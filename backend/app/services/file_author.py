"""原作者署名（文件级单一值）服务。

设计要点：
- 作者署名只对应一个 ``Source(kind=author)``，不创建 Translation；
- 作者 Source 不计入 source_count / translated / checked 统计；
- 同一文件的保存/清空通过 File 上的原子锁串行化，避免并发写坏唯一索引；
- 普通标号入口（Source/Translation API）不允许修改作者 Source。
"""

import datetime
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
AUTHOR_POSITION_X = 0.01
AUTHOR_POSITION_Y = 0.01

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


def set_original_author(file: File, value: str):
    """设置/修改/清空原作者，返回作者 Source（清空后为 None）。

    调用方需先完成权限、模式和项目状态校验；此函数仍会再次兜底校验。
    """
    text = normalize_original_author(value)
    ensure_original_author_editable(file)
    with _FileAuthorLock(file):
        file.reload()
        author_source = get_author_source(file)
        if text:
            if author_source is None:
                try:
                    author_source = Source(
                        file=file,
                        kind=SourceKind.AUTHOR,
                        author_key=str(file.id),
                        content=text,
                        x=AUTHOR_POSITION_X,
                        y=AUTHOR_POSITION_Y,
                        position_type=SourcePositionType.IN,
                        machine=False,
                        rank=file.next_source_rank(),
                    ).save()
                except NotUniqueError:
                    # 并发下另一个请求已创建，退化为更新
                    author_source = get_author_source(file)
                    if author_source is None:
                        raise
                    author_source.update(
                        content=text,
                        x=AUTHOR_POSITION_X,
                        y=AUTHOR_POSITION_Y,
                        position_type=SourcePositionType.IN,
                        machine=False,
                        edit_time=datetime.datetime.utcnow(),
                    )
            else:
                # 修改保持原 source id/rank，不重排既有标号
                author_source.update(
                    content=text,
                    x=AUTHOR_POSITION_X,
                    y=AUTHOR_POSITION_Y,
                    position_type=SourcePositionType.IN,
                    machine=False,
                    edit_time=datetime.datetime.utcnow(),
                )
        elif author_source is not None:
            author_source.delete()
            author_source = None
        file.update(original_author=text)
        file.update_cache("edit_time", datetime.datetime.utcnow())
        file.reload()
        return author_source


def clear_original_author(file: File):
    """清空原作者署名（幂等，不改变任何计数缓存）"""
    return set_original_author(file, "")
