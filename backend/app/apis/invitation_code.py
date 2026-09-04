"""管理员：邀请码管理"""

from flask_babel import gettext
from app.core.views import MoeAPIView
from app.decorators.auth import admin_required
from app.decorators.url import fetch_model
from app.exceptions import TeamNotExistError
from app.models.invitation_code import InvitationCode
from app.models.team import Team
from app.validators.invitation_code import (
    CreateInviteCodeSchema,
    EditInviteCodeSchema,
)


class InvitationCodeListAPI(MoeAPIView):
    @admin_required
    def get(self):
        """返回全部邀请码 (倒序)"""
        codes = InvitationCode.objects.order_by("-create_time")
        return [code.to_api() for code in codes]

    @admin_required
    def post(self):
        """新建邀请码 (自动生成 code, 绑定团队+可选角色)"""
        data = self.get_json(CreateInviteCodeSchema())
        team = Team.objects(id=data["team_id"]).first()
        if team is None:
            raise TeamNotExistError
        code = InvitationCode.generate_code()
        invitation_code = InvitationCode(
            code=code,
            team=team,
            role=data.get("role", ""),
            create_user=self.current_user,
        ).save()
        return invitation_code.to_api()


class InvitationCodeAPI(MoeAPIView):
    @admin_required
    @fetch_model(InvitationCode)
    def put(self, invitation_code):
        """修改邀请码 (enabled / team / role)"""
        data = self.get_json(EditInviteCodeSchema())
        if data.get("team_id") is not None:
            team = Team.objects(id=data["team_id"]).first()
            if team is None:
                raise TeamNotExistError
            invitation_code.team = team
        if data.get("enabled") is not None:
            invitation_code.enabled = data["enabled"]
        if data.get("role") is not None:
            invitation_code.role = data["role"]
        invitation_code.save()
        invitation_code.reload()
        return invitation_code.to_api()

    @admin_required
    @fetch_model(InvitationCode)
    def delete(self, invitation_code):
        """删除邀请码"""
        invitation_code.delete()
        return {"message": gettext("删除成功")}
