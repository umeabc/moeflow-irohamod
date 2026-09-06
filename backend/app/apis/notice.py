"""通知（公告）：用户查询已读 + 管理员发布/管理"""

from flask import request
from flask_babel import gettext

from app.core.views import MoeAPIView
from app.decorators.auth import admin_required, token_required
from app.decorators.url import fetch_model
from app.models.notice import Notice, UserNoticeRead
from app.validators.notice import (
    CreateNoticeSchema,
    EditNoticeSchema,
)


class NoticeListAPI(MoeAPIView):
    """用户侧：查看全体通知（可选只看未读）"""

    @token_required
    def get(self):
        # 全体启用的通知，倒序
        notices = Notice.objects(enabled=True).order_by("-create_time")
        record = UserNoticeRead.for_user(self.current_user)
        # ?scope=unread 只看未读（供登录弹窗）
        only_unread = (request.args.get("scope") or "").strip() == "unread"
        data = []
        for notice in notices:
            read = record.is_read(notice.id)
            if only_unread and read:
                continue
            item = notice.to_api()
            item["read"] = read
            data.append(item)
        return data


class NoticeReadAPI(MoeAPIView):
    """用户侧：标记通知为已读"""

    @token_required
    def put(self):
        data = self.get_json()
        notice_ids = data.get("notice_ids") or []
        if not isinstance(notice_ids, list):
            return {"message": gettext("参数错误")}, 400
        record = UserNoticeRead.for_user(self.current_user)
        record.mark_read(notice_ids)
        record.save()
        return {"message": gettext("操作成功")}


class AdminNoticeListAPI(MoeAPIView):
    """管理员：查看/发布通知"""

    @admin_required
    def get(self):
        notices = Notice.objects.order_by("-create_time")
        return [notice.to_api() for notice in notices]

    @admin_required
    def post(self):
        data = self.get_json(CreateNoticeSchema())
        notice = Notice(
            title=(data.get("title") or "").strip(),
            content=(data.get("content") or "").strip(),
            create_user=self.current_user,
        ).save()
        return notice.to_api()


class AdminNoticeAPI(MoeAPIView):
    """管理员：编辑/删除通知"""

    @admin_required
    @fetch_model(Notice)
    def put(self, notice):
        data = self.get_json(EditNoticeSchema())
        if data.get("title") is not None:
            notice.title = data["title"]
        if data.get("content") is not None:
            notice.content = data["content"]
        if data.get("enabled") is not None:
            notice.enabled = data["enabled"]
        notice.save()
        notice.reload()
        return notice.to_api()

    @admin_required
    @fetch_model(Notice)
    def delete(self, notice):
        # 先清理所有用户已读记录中的该通知 id
        UserNoticeRead.objects(
            read_notice_ids=notice.id
        ).update(pull__read_notice_ids=notice.id)
        notice.delete()
        return {"message": gettext("删除成功")}
