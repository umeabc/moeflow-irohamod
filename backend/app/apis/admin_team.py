"""管理员：全站团队管理"""

from flask_babel import gettext
from app.core.views import MoeAPIView
from app.decorators.auth import admin_required
from app.decorators.url import fetch_model
from app.constants.file import FileType
from app.models.team import Team
from app.models.project import Project, ProjectSet
from app.models.file import File


class AdminTeamListAPI(MoeAPIView):
    @admin_required
    def get(self):
        """返回全站所有团队的行概览（含各统计数）"""
        result = []
        for team in Team.objects.order_by("-create_time"):
            project_ids = [
                project.id for project in Project.objects(team=team).only("id")
            ]
            image_count = (
                File.objects(project__in=project_ids, type=FileType.IMAGE).count()
                if project_ids
                else 0
            )
            result.append(
                {
                    "id": str(team.id),
                    "name": team.name,
                    "avatar": team.avatar,
                    "has_avatar": team.has_avatar(),
                    "project_set_count": ProjectSet.objects(team=team).count(),
                    "project_count": len(project_ids),
                    "image_count": image_count,
                }
            )
        return result


class AdminTeamAPI(MoeAPIView):
    @admin_required
    @fetch_model(Team)
    def delete(self, team):
        """删除团队（级联删除其下所有项目/文件）"""
        team.clear()
        return {"message": gettext("删除成功")}
