"""
团队邀请码（用于注册）
"""

import datetime
import random

from mongoengine import (
    Document,
    StringField,
    ReferenceField,
    BooleanField,
    IntField,
    DateTimeField,
)

# 避开易混淆字符（0/O、1/I 等）
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 8


class InvitationCode(Document):
    code = StringField(db_field="c", unique=True, index=True)  # 邀请码
    team = ReferenceField("Team", db_field="t", reverse_delete_rule="CASCADE")  # 绑定团队
    role = StringField(db_field="r", default="")  # 加入角色的 system_code；空=用团队默认角色
    enabled = BooleanField(db_field="e", default=True)  # 是否可用（多次使用，可停用）
    use_count = IntField(db_field="u", default=0)  # 已用次数（审计统计）
    create_time = DateTimeField(db_field="ct", default=datetime.datetime.utcnow)
    create_user = ReferenceField(
        "User", db_field="cu", default=None, reverse_delete_rule="NULLIFY"
    )

    @classmethod
    def generate_code(cls) -> str:
        """生成唯一邀请码（大写字母+数字，8 位）"""
        while True:
            code = "".join(random.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))
            if not cls.objects(code=code).first():
                return code

    def to_api(self):
        return {
            "id": str(self.id),
            "code": self.code,
            "team_id": str(self.team.id) if self.team else None,
            "team_name": self.team.name if self.team else "",
            "role": self.role,
            "enabled": self.enabled,
            "use_count": self.use_count,
            "create_time": (
                self.create_time.isoformat() if self.create_time else None
            ),
        }
