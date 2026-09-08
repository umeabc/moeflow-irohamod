"""
从社交媒体 / 外部链接下载图片并导入项目（服务器端下载，不走本地浏览器）。
"""
import io

from flask_babel import gettext
from werkzeug.datastructures import FileStorage

from app.core.views import MoeAPIView
from app.decorators.auth import token_required
from app.decorators.url import fetch_model
from app.exceptions import NoPermissionError
from app.models.file import File
from app.models.project import Project, ProjectPermission
from app.models.site_setting import SiteSetting
from app.services.image_download import ImageDownloadError, download_image
from app.utils.hash import get_file_md5
from app.constants.project import ProjectStatus
from app.exceptions.project import ProjectFinishedError


class ProjectFileFromURLAPI(MoeAPIView):
    """从 URL（社交媒体/外部链接）下载图片直接导入项目（支持一次下载多张）"""

    @token_required
    @fetch_model(Project)
    def post(self, project: Project):
        data = self.get_json()
        source = (data.get("source") or "external").strip()
        url = (data.get("url") or "").strip()
        if source not in ("twitter", "twitter_user", "bluesky", "pixiv", "external"):
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
        try:
            downloaded = download_image(source, url, settings)
        except ImageDownloadError as e:
            return {"message": str(e)}, 400
        if not downloaded:
            return {"message": gettext("未获取到图片")}, 400
        # 逐张导入：组级 MD5 去重（与上传一致），重复的跳过并记录
        team_project_ids = [
            p.id for p in Project.objects(team=project.team).only("id")
        ]
        files = []
        duplicated = []
        for content, filename in downloaded:
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
                    duplicated.append(filename)
                    continue
            # 复用项目上传逻辑（含 oss 存储、md5、缩略图等）
            file: File = project.upload(filename, real_file)
            files.append(file.to_api())
        return {"files": files, "duplicated": duplicated}
