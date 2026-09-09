"""
从社交媒体 / 外部链接下载图片并导入项目（服务器端下载，不走本地浏览器）。

「从 X 获取单用户所有图片」（source=twitter_user）走进度式导入：
  POST /files/from-url  -> 枚举图片 URL 存任务，后台线程逐张下载，立即返回 {task_id, total}
  GET  /files/from-url-task/<task_id> -> 轮询进度 {done, total, imported, duplicated, finished}
其余来源保持一次性下载导入。
"""
import io
import threading

from flask_babel import gettext
from werkzeug.datastructures import FileStorage

from app.core.views import MoeAPIView
from app.decorators.auth import token_required
from app.decorators.url import fetch_model
from app.exceptions import NoPermissionError
from app.models.file import File
from app.models.project import Project, ProjectPermission
from app.models.site_setting import SiteSetting
from app.models.media_import_task import MediaImportTask
from app.services.image_download import (
    ImageDownloadError,
    download_image,
    enumerate_bluesky_user_media,
    enumerate_pixiv_user_media,
    enumerate_twitter_user_media,
)
from app.utils.hash import get_file_md5
from app.constants.project import ProjectStatus
from app.exceptions.project import ProjectFinishedError

import datetime


def _failure_filename(name) -> str:
    """从命名信息推断失败图片的文件名（尽力而为，缺省返回空串）。"""
    if not isinstance(name, dict):
        return ""
    text = (name.get("text") or "").strip()
    if text:
        # 与下载函数生成的文件名规则尽量一致：取 text 前若干字符
        return text[:40]
    return ""


def _import_one(project, content, filename, team_project_ids):
    """单张入库：组级 MD5 去重，重复返回 None。"""
    stream = io.BytesIO(content)
    real_file = FileStorage(stream=stream, filename=filename)
    md5 = get_file_md5(real_file)
    stream.seek(0)
    if md5:
        duplicate: File = (
            File.objects(md5=md5, activated=True, project__in=team_project_ids)
            .order_by("-edit_time")
            .first()
        )
        if duplicate:
            return None
    project.upload(filename, real_file)
    return filename


def _run_media_import_task(task: MediaImportTask, project, settings, download_kind="twitter"):
    """后台线程：逐张下载并入库，更新任务进度。

    注意：线程内必须使用 Flask 应用上下文（current_app / OSS / mongoengine
    均依赖），否则 project.upload 会抛 Working outside of application context。
    download_kind: 'twitter' 用 _download_twitter_pic；'pixiv' 用 _download_pixiv_pic。
    """
    from app import flask_app

    with flask_app.app_context():
        _run_media_import_task_inner(task, project, settings, download_kind)


def _run_media_import_task_inner(task, project, settings, download_kind="twitter"):
    from app.services.image_download import (
        _download_bluesky_pic,
        _download_pixiv_pic,
        _download_twitter_pic,
    )

    proxy = getattr(settings, "download_proxy", "") or ""
    auth = (getattr(settings, "twitter_auth", "") or "").strip()
    ct0 = (getattr(settings, "twitter_ct0", "") or "").strip()
    session = (getattr(settings, "pixiv_session", "") or "").strip()
    bluesky_auth_headers = None
    if download_kind == "bluesky":
        # 非匿名模式：登录一次拿 JWT，下载敏感图时携带（CDN 拒绝时回退 PDS getBlob）
        from app.services.image_download import _bluesky_auth_base

        try:
            _, bluesky_auth_headers = _bluesky_auth_base(
                anonymous=bool(getattr(settings, "bluesky_anonymous", True)),
                identifier=(getattr(settings, "bluesky_handle", "") or "").strip(),
                app_password=(
                    getattr(settings, "bluesky_app_password", "") or ""
                ).strip(),
                proxy=proxy,
                timeout=60,
            )
            if not bluesky_auth_headers:
                bluesky_auth_headers = None
        except Exception:  # noqa: BLE001 登录失败不影响匿名下载，仅失去敏感图能力
            bluesky_auth_headers = None
    team_project_ids = [p.id for p in Project.objects(team=project.team).only("id")]
    try:
        for i, (img_url, name) in enumerate(zip(task.urls, task.names)):
            try:
                text = (name or {}).get("text") or ""
                created_at = (name or {}).get("created_at") or ""
                page = (name or {}).get("page")
                if download_kind == "pixiv":
                    content, filename = _download_pixiv_pic(
                        img_url,
                        proxy,
                        60,
                        session,
                        text=text,
                        created_at=created_at,
                        page=page,
                    )
                elif download_kind == "bluesky":
                    content, filename = _download_bluesky_pic(
                        img_url,
                        proxy,
                        60,
                        text=text,
                        created_at=created_at,
                        page=page,
                        auth_headers=bluesky_auth_headers,
                    )
                else:
                    content, filename = _download_twitter_pic(
                        img_url,
                        proxy,
                        60,
                        text=text,
                        created_at=created_at,
                        page=page,
                        ct0=ct0,
                    )
            except ImageDownloadError as e:
                task.failed += 1
                task.done = i + 1
                task.failures.append(
                    {
                        "index": i + 1,
                        "filename": _failure_filename(name),
                        "step": "download",
                        "reason": str(e)[:500],
                    }
                )
                task.updated_at = datetime.datetime.utcnow()
                task.save()
                continue
            except Exception as e:  # noqa: BLE001 下载阶段兜底（非 ImageDownloadError 的意外异常）
                task.failed += 1
                task.done = i + 1
                task.failures.append(
                    {
                        "index": i + 1,
                        "filename": _failure_filename(name),
                        "step": "download",
                        "reason": "下载异常: %s" % str(e)[:500],
                    }
                )
                task.updated_at = datetime.datetime.utcnow()
                task.save()
                continue
            try:
                if _import_one(project, content, filename, team_project_ids) is None:
                    task.duplicated += 1
                else:
                    task.imported += 1
            except Exception as e:  # noqa: BLE001 入库失败记录明细
                task.failed += 1
                task.failures.append(
                    {
                        "index": i + 1,
                        "filename": filename or _failure_filename(name),
                        "step": "import",
                        "reason": "入库失败: %s" % str(e)[:500],
                    }
                )
            task.done = i + 1
            task.updated_at = datetime.datetime.utcnow()
            task.save()
    except Exception as e:  # noqa: BLE001 后台线程兜底，避免线程静默死亡
        task.error = str(e)[:500]
    finally:
        task.finished = True
        task.updated_at = datetime.datetime.utcnow()
        task.save()


class ProjectFileFromURLAPI(MoeAPIView):
    """从 URL（社交媒体/外部链接）下载图片直接导入项目（支持一次下载多张）"""

    @token_required
    @fetch_model(Project)
    def post(self, project: Project):
        data = self.get_json()
        source = (data.get("source") or "external").strip()
        url = (data.get("url") or "").strip()
        if source not in (
            "twitter",
            "twitter_user",
            "bluesky",
            "bluesky_user",
            "pixiv",
            "pixiv_user",
            "external",
        ):
            return {"message": gettext("不支持的来源")}, 400
        if not url:
            return {"message": gettext("缺少图片链接")}, 400
        # 项目进行中
        if project.status != ProjectStatus.WORKING:
            raise ProjectFinishedError
        # 上传/导入文件权限
        if not self.current_user.can(project, ProjectPermission.ADD_FILE):
            raise NoPermissionError(gettext("您没有此项目的上传文件权限"))
        settings = SiteSetting.get()

        # twitter_user：进度式导入（枚举 -> 后台线程下载 -> 返回 task_id）
        if source == "twitter_user":
            try:
                items = enumerate_twitter_user_media(
                    url,
                    (getattr(settings, "twitter_auth", "") or "").strip(),
                    (getattr(settings, "twitter_ct0", "") or "").strip(),
                    (getattr(settings, "download_proxy", "") or ""),
                )
            except ImageDownloadError as e:
                return {"message": str(e)}, 400
            if not items:
                return {"message": gettext("该用户的媒体时间线中未找到图片")}, 400
            task = MediaImportTask(
                project=project,
                task_id=str(project.id) + "_" + datetime.datetime.now().strftime("%Y%m%d%H%M%S%f"),
                urls=[u for u, _, _ in items],
                names=[{"text": t, "created_at": c} for _, t, c in items],
                total=len(items),
            ).save()
            # 后台线程下载（进程内线程，任务状态存 Mongo 供轮询）
            t = threading.Thread(
                target=_run_media_import_task,
                args=(task, project, settings, "twitter"),
                daemon=True,
            )
            t.start()
            return {"task_id": task.task_id, "total": task.total}

        # pixiv_user：进度式导入（枚举 -> 后台线程下载 -> 返回 task_id）
        if source == "pixiv_user":
            try:
                items = enumerate_pixiv_user_media(
                    url,
                    (getattr(settings, "pixiv_session", "") or "").strip(),
                    (getattr(settings, "download_proxy", "") or ""),
                )
            except ImageDownloadError as e:
                return {"message": str(e)}, 400
            if not items:
                return {"message": gettext("该用户的作品中未找到可下载的图片")}, 400
            task = MediaImportTask(
                project=project,
                task_id=str(project.id) + "_" + datetime.datetime.now().strftime("%Y%m%d%H%M%S%f"),
                urls=[u for u, _, _ in items],
                names=[{"text": t, "created_at": c} for _, t, c in items],
                total=len(items),
            ).save()
            t = threading.Thread(
                target=_run_media_import_task,
                args=(task, project, settings, "pixiv"),
                daemon=True,
            )
            t.start()
            return {"task_id": task.task_id, "total": task.total}

        # bluesky_user：进度式导入（枚举 -> 后台线程下载 -> 返回 task_id）
        if source == "bluesky_user":
            try:
                items = enumerate_bluesky_user_media(
                    url,
                    (getattr(settings, "download_proxy", "") or ""),
                    anonymous=bool(getattr(settings, "bluesky_anonymous", True)),
                    handle_id=(getattr(settings, "bluesky_handle", "") or "").strip(),
                    app_password=(
                        getattr(settings, "bluesky_app_password", "") or ""
                    ).strip(),
                )
            except ImageDownloadError as e:
                return {"message": str(e)}, 400
            if not items:
                return {"message": gettext("该用户的媒体时间线中未找到图片")}, 400
            task = MediaImportTask(
                project=project,
                task_id=str(project.id) + "_" + datetime.datetime.now().strftime("%Y%m%d%H%M%S%f"),
                urls=[u for u, _, _, _ in items],
                names=[
                    {"text": t, "created_at": c, "page": p} for _, t, c, p in items
                ],
                total=len(items),
            ).save()
            t = threading.Thread(
                target=_run_media_import_task,
                args=(task, project, settings, "bluesky"),
                daemon=True,
            )
            t.start()
            return {"task_id": task.task_id, "total": task.total}

        # 其余来源：一次性下载导入
        try:
            downloaded = download_image(source, url, settings)
        except ImageDownloadError as e:
            return {"message": str(e)}, 400
        if not downloaded:
            return {"message": gettext("未获取到图片")}, 400
        team_project_ids = [
            p.id for p in Project.objects(team=project.team).only("id")
        ]
        files = []
        duplicated = []
        for content, filename in downloaded:
            if _import_one(project, content, filename, team_project_ids) is None:
                duplicated.append(filename)
            else:
                files.append(filename)
        return {"files": files, "duplicated": duplicated}


class MediaImportTaskAPI(MoeAPIView):
    """查询「从 X 获取单用户所有图片」导入任务进度"""

    @token_required
    def get(self, task_id: str):
        task = MediaImportTask.by_task_id(task_id)
        if task is None:
            return {"message": gettext("任务不存在")}, 404
        # 校验任务所属项目权限
        try:
            project = Project.objects(id=task.project.id).first()
        except Exception:  # noqa: BLE001
            return {"message": gettext("任务不存在")}, 404
        if project is None:
            return {"message": gettext("任务不存在")}, 404
        if not self.current_user.can(project, ProjectPermission.ADD_FILE):
            raise NoPermissionError(gettext("您没有此项目的上传文件权限"))
        return task.to_progress()
