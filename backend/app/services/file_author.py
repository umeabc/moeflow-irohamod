"""原作者署名（文件级单一值）服务。

设计要点：
- 作者署名只对应一个 ``Source(kind=author)``，不创建 Translation；
- 作者 Source 不计入 source_count / translated / checked 统计；
- 同一文件的保存/清空通过 File 上的原子锁串行化，避免并发写坏唯一索引；
- 普通标号入口（Source/Translation API）不允许修改作者 Source。

v16-fix3：作者信息支持项目级模板。
- ``Project.author_label_template`` 中的占位符 ``{翻译}`` / ``{嵌字}`` / ``{原作者}``
  在导出/展示时按文件当前的负责人字段替换；
- 模板里的纯文本（如 ``B站@BA校委会``）会原样加到每张图片的作者信息里；
- 某一行的占位符全部为空时整行省略（避免出现「翻译：」这样的空行）；
- 模板为空时沿用 v16 行为：作者信息 = 文件卡里手动填写的原作者。
"""

import datetime
import re
import time

from flask_babel import gettext
from flask_apikit.exceptions import ValidateError
from mongoengine import NotUniqueError

from app.constants.file import FileType
from app.constants.project import ProjectStatus
from app.constants.source import SourceKind, SourcePositionType
from app.exceptions import (
    FileNotActivatedError,
    FileTypeNotSupportError,
    NoPermissionError,
)
from app.exceptions.project import ProjectFinishedError
from app.models.file import File, Source

MAX_ORIGINAL_AUTHOR_LENGTH = 500
MAX_AUTHOR_TEMPLATE_LENGTH = 1000
AUTHOR_POSITION_X = 0.01
AUTHOR_POSITION_Y = 0.01

# 作者信息模板可用的占位符：占位符文案 -> File 上的字段名
AUTHOR_TEMPLATE_PLACEHOLDERS = {
    "翻译": "translator",
    "嵌字": "typesetter",
    "原作者": "original_author",
}
_PLACEHOLDER_RE = re.compile(r"\{([^{}]*)\}")
_KNOWN_PLACEHOLDER_RE = re.compile(
    r"\{(" + "|".join(AUTHOR_TEMPLATE_PLACEHOLDERS.keys()) + r")\}"
)

# 可填写/修改/清空原作者的项目角色（站点管理员另行放行）
AUTHOR_EDIT_ROLES = {"creator", "admin", "coordinator", "translator", "proofreader"}
# 可撤回（↶ 清空）原作者的项目角色（站点管理员另行放行）
AUTHOR_UNDO_ROLES = {"creator", "admin", "coordinator"}


def _role_system_code(user, file: File) -> str:
    role = user.get_role(file.project)
    return role.system_code if role else ""


def can_edit_original_author(user, file: File) -> bool:
    """是否可填写/修改/清空原作者（后端最终裁决）"""
    if getattr(user, "admin", False):
        return True
    return _role_system_code(user, file) in AUTHOR_EDIT_ROLES


def can_undo_original_author(user, file: File) -> bool:
    """是否可撤回原作者（仅项目管理员/站点管理员）"""
    if getattr(user, "admin", False):
        return True
    return _role_system_code(user, file) in AUTHOR_UNDO_ROLES


def require_edit_original_author(user, file: File):
    if not can_edit_original_author(user, file):
        raise NoPermissionError(gettext("您没有权限修改原作者"))


def require_undo_original_author(user, file: File):
    if not can_undo_original_author(user, file):
        raise NoPermissionError(gettext("仅项目管理员可撤回原作者"))


def normalize_original_author(value) -> str:
    """校验并规范化作者署名（去首尾空白，最长 500 个 Unicode 字符）"""
    if not isinstance(value, str):
        raise ValidateError(gettext("原作者格式错误"))
    text = value.strip()
    if len(text) > MAX_ORIGINAL_AUTHOR_LENGTH:
        raise ValidateError(gettext("原作者最多 500 个字符"))
    return text


def validate_author_template(value) -> str:
    """校验并规范化作者信息模板（换行统一为 \\n，去掉首尾空白）"""
    if value is None:
        return ""
    if not isinstance(value, str):
        raise ValidateError(gettext("作者信息模板格式错误"))
    text = value.replace("\r\n", "\n").replace("\r", "\n").strip()
    if len(text) > MAX_AUTHOR_TEMPLATE_LENGTH:
        raise ValidateError(gettext("作者信息模板最多 1000 个字符"))
    unknown = sorted(
        {
            name
            for name in _PLACEHOLDER_RE.findall(text)
            if name not in AUTHOR_TEMPLATE_PLACEHOLDERS
        }
    )
    if unknown:
        raise ValidateError(
            gettext("作者信息模板包含未知占位符：{names}（可用：翻译、嵌字、原作者）").format(
                names="、".join("{" + name + "}" for name in unknown)
            )
        )
    return text


def _author_template_values(file: File) -> dict:
    return {
        "翻译": (file.translator or "").strip(),
        "嵌字": (file.typesetter or "").strip(),
        "原作者": (file.original_author or "").strip(),
    }


def render_author_label(file: File, project=None) -> str:
    """按项目模板渲染该文件的作者信息文本（无模板时回退到手动原作者）"""
    project = project if project is not None else file.project
    template = (getattr(project, "author_label_template", "") or "").strip()
    if not template:
        return (file.original_author or "").strip()
    values = _author_template_values(file)
    lines = []
    for raw_line in template.split("\n"):
        names = _KNOWN_PLACEHOLDER_RE.findall(raw_line)
        if names and not any(values.get(name) for name in names):
            # 这一行只用到了空值的占位符，整行省略
            continue
        rendered = _KNOWN_PLACEHOLDER_RE.sub(
            lambda match: values.get(match.group(1), ""), raw_line
        )
        lines.append(rendered.rstrip())
    # 去掉首尾多余空行，保留中间的用户排版
    return "\n".join(lines).strip("\n")


def get_author_source(file: File):
    return Source.objects(file=file, kind=SourceKind.AUTHOR).first()


def ensure_original_author_editable(file: File):
    """校验文件/项目状态是否允许写入原作者（不产生副作用）"""
    if not file.activated:
        raise FileNotActivatedError
    if file.type != FileType.IMAGE:
        raise FileTypeNotSupportError(gettext("只有图片文件可以设置原作者"))
    if not bool(file.project.with_author):
        raise ValidateError(gettext("该项目未启用原作者"))
    if file.project.status != ProjectStatus.WORKING:
        raise ProjectFinishedError


class _FileAuthorLock:
    """基于 File 文档的轻量分布式互斥锁（author_updating 字段）。"""

    def __init__(self, file: File, timeout: float = 2.0, interval: float = 0.05):
        self.file = file
        self.timeout = timeout
        self.interval = interval

    def __enter__(self):
        deadline = time.monotonic() + self.timeout
        while True:
            updated = File.objects(
                id=self.file.id, author_updating__ne=True
            ).update(set__author_updating=True)
            if updated:
                return self
            if time.monotonic() >= deadline:
                raise ValidateError(gettext("原作者正在保存，请稍后重试"))
            time.sleep(self.interval)

    def __exit__(self, exc_type, exc, tb):
        File.objects(id=self.file.id).update(set__author_updating=False)
        return False


def _new_author_source(file: File, content: str) -> Source:
    return Source(
        file=file,
        kind=SourceKind.AUTHOR,
        author_key=str(file.id),
        content=content,
        x=AUTHOR_POSITION_X,
        y=AUTHOR_POSITION_Y,
        position_type=SourcePositionType.IN,
        machine=False,
        rank=file.next_source_rank(),
    ).save()


def apply_author_label(file: File, project=None) -> "Source | None":
    """按当前渲染结果确保作者标号存在/内容最新，渲染为空则删除标号。

    作者标号是「派生数据」：只要项目启用了原作者，展示与导出都会按模板实时渲染，
    这里同步一份到 Source.content，保证数据库内容与界面一致。
    """
    if file.type != FileType.IMAGE:
        return get_author_source(file)
    project = project if project is not None else file.project
    if not bool(getattr(project, "with_author", False)):
        return get_author_source(file)
    text = render_author_label(file, project=project)
    source = get_author_source(file)
    if not text:
        if source is not None:
            source.delete()
        return None
    if source is None:
        try:
            return _new_author_source(file, text)
        except NotUniqueError:
            # 并发下另一个请求已创建，退化为更新
            source = get_author_source(file)
            if source is None:
                raise
    if source.content != text:
        source.update(content=text, edit_time=datetime.datetime.utcnow())
        source.reload()
    return source


def apply_project_author_template(project) -> int:
    """项目模板变更后，按新模板重建/同步全部图片的作者标号，返回处理文件数"""
    count = 0
    for file in project.files(type_only=FileType.IMAGE):
        apply_author_label(file, project=project)
        count += 1
    return count


def set_original_author(file: File, value: str):
    """设置/修改/清空原作者，返回作者 Source（渲染为空时返回 None）。

    调用方需先完成权限、模式和项目状态校验；此函数仍会再次兜底校验。
    """
    text = normalize_original_author(value)
    ensure_original_author_editable(file)
    with _FileAuthorLock(file):
        file.reload()
        file.update(original_author=text)
        file.reload()
        # 作者标号内容由「模板 + 负责人字段」派生：可能是空（删标号），
        # 也可能在只改原作者后仍有翻译/嵌字行（保留标号）
        author_source = apply_author_label(file)
        file.update_cache("edit_time", datetime.datetime.utcnow())
        file.reload()
        return author_source


def clear_original_author(file: File):
    """清空原作者署名（幂等，不改变任何计数缓存）"""
    return set_original_author(file, "")
