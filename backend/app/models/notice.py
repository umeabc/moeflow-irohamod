"""
站点通知（公告）
"""

import datetime
from typing import Union, NoReturn

from bson import ObjectId
from flask_babel import gettext
from mongoengine import (
    BooleanField,
    DateTimeField,
    Document,
    ListField,
    ObjectIdField,
    ReferenceField,
    StringField,
)

from app.exceptions.notice import NoticeNotExistError


class Notice(Document):
    """站点级通知/公告（全体用户可见，管理员发布）"""

    title = StringField(db_field="t", default="")  # 标题（可选）
    content = StringField(db_field="c", required=True)  # 内容（纯文本多行）
    enabled = BooleanField(db_field="e", default=True)  # 是否生效（关闭后不再作为新通知弹出，但历史仍在）
    create_time = DateTimeField(db_field="ct", default=datetime.datetime.utcnow)
    create_user = ReferenceField(
        "User", db_field="cu", default=None, reverse_delete_rule="NULLIFY"
    )

    meta = {"indexes": ["create_time"]}

    @classmethod
    def by_id(cls, id) -> Union["Notice", NoReturn]:
        notice = cls.objects(id=id).first()
        if notice is None:
            raise NoticeNotExistError()
        return notice

    def to_api(self):
        return {
            "id": str(self.id),
            "title": self.title or "",
            "content": self.content,
            "enabled": self.enabled,
            "create_time": (
                self.create_time.isoformat() if self.create_time else None
            ),
            "create_user_name": (
                getattr(self.create_user, "name", "") if self.create_user else ""
            ),
        }


class UserNoticeRead(Document):
    """每个用户一份已读通知记录（user 唯一）"""

    user = ReferenceField(
        "User", db_field="u", required=True, unique=True, reverse_delete_rule="CASCADE"
    )
    read_notice_ids = ListField(ObjectIdField(), db_field="r", default=list)
    update_time = DateTimeField(db_field="ut", default=datetime.datetime.utcnow)

    @classmethod
    def for_user(cls, user) -> "UserNoticeRead":
        """取或建用户的已读记录"""
        record = cls.objects(user=user).first()
        if record is None:
            record = cls(user=user).save()
        return record

    def is_read(self, notice_id) -> bool:
        return ObjectId(notice_id) in self.read_notice_ids

    def mark_read(self, notice_ids) -> int:
        """标记已读，返回本次新增已读条数"""
        if not notice_ids:
            return 0
        id_set = set(ObjectId(i) for i in notice_ids)
        old_len = len(self.read_notice_ids)
        self.read_notice_ids = list(
            {ObjectId(x) for x in self.read_notice_ids} | id_set
        )
        self.update_time = datetime.datetime.utcnow()
        return len(self.read_notice_ids) - old_len
