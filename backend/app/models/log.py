import datetime
from mongoengine import (
    Document,
    DateTimeField,
    StringField,
    IntField,
    DictField,
    ReferenceField,
    BooleanField,
    NULLIFY,
)


class ActionLog(Document):
    """
    用户动作日志（包括普通用户和管理员操作）
    """
    meta = {
        "collection": "action_log",
        "indexes": [
            "user",
            "action_type",
            "-create_time",  # 常用排序（最新在前）
            ("user", "-create_time"),
            ("action_type", "-create_time"),
        ]
    }

    user = ReferenceField("User", db_field="u", reverse_delete_rule=NULLIFY)  # 操作用户（可为空，记录删除用户后的历史）
    user_name = StringField(db_field="un")  # 操作用户名（冗余存储，避免用户删除后无法追溯）
    user_email = StringField(db_field="ue")  # 操作用户邮箱（冗余）
    is_admin = BooleanField(default=False, db_field="ia")  # 是否管理员操作
    
    action_type = StringField(required=True, db_field="at")  # 动作类型：user.login, user.register, project.create, file.upload, admin.user.delete 等
    resource_type = StringField(db_field="rt")  # 资源类型：user, project, file, team, output 等
    resource_id = StringField(db_field="ri")  # 资源 ID（ObjectId 字符串）
    resource_name = StringField(db_field="rn")  # 资源名称（冗余，方便查询）
    
    method = StringField(db_field="m")  # HTTP 方法：GET/POST/PUT/DELETE
    path = StringField(db_field="p")  # 请求路径：/api/v1/projects/xxx
    ip = StringField(db_field="ip")  # 客户端 IP
    user_agent = StringField(db_field="ua")  # User-Agent
    
    details = DictField(db_field="d")  # 详细信息（JSON）：如修改前后的值、关键参数等
    status_code = IntField(db_field="sc")  # HTTP 状态码
    
    create_time = DateTimeField(default=datetime.datetime.utcnow, db_field="ct")  # 创建时间

    def to_api(self):
        """转换为 API 返回格式"""
        return {
            'id': str(self.id),
            'user_name': self.user_name,
            'user_email': self.user_email,
            'is_admin': self.is_admin,
            'action_type': self.action_type,
            'resource_type': self.resource_type,
            'resource_id': self.resource_id,
            'resource_name': self.resource_name,
            'method': self.method,
            'path': self.path,
            'ip': self.ip,
            'status_code': self.status_code,
            'details': self.details,
            'create_time': self.create_time.isoformat() if self.create_time else None,
        }


class ErrorLog(Document):
    """
    服务器错误日志
    """
    meta = {
        "collection": "error_log",
        "indexes": [
            "error_type",
            "-create_time",
            ("error_type", "-create_time"),
            "resolved",
        ]
    }

    error_type = StringField(required=True, db_field="et")  # 错误类型：exception, http_error, validation_error 等
    error_class = StringField(db_field="ec")  # 异常类名：ValueError, KeyError, NoPermissionError 等
    error_message = StringField(db_field="em")  # 错误信息
    traceback = StringField(db_field="tb")  # 完整 traceback
    
    user = ReferenceField("User", db_field="u", reverse_delete_rule=NULLIFY)  # 触发错误的用户（可为空）
    user_name = StringField(db_field="un")  # 用户名（冗余）
    
    method = StringField(db_field="m")  # HTTP 方法
    path = StringField(db_field="p")  # 请求路径
    ip = StringField(db_field="ip")  # 客户端 IP
    user_agent = StringField(db_field="ua")  # User-Agent
    
    request_data = DictField(db_field="rd")  # 请求数据（args, json, form）
    status_code = IntField(db_field="sc")  # HTTP 状态码
    
    resolved = BooleanField(default=False, db_field="r")  # 是否已解决（管理员可标记）
    resolved_by = ReferenceField("User", db_field="rb", reverse_delete_rule=NULLIFY)  # 解决人
    resolved_time = DateTimeField(db_field="rt")  # 解决时间
    resolved_note = StringField(db_field="rn")  # 解决备注
    
    create_time = DateTimeField(default=datetime.datetime.utcnow, db_field="ct")  # 创建时间

    def to_api(self):
        """转换为 API 返回格式"""
        return {
            'id': str(self.id),
            'error_type': self.error_type,
            'error_class': self.error_class,
            'error_message': self.error_message,
            'traceback': self.traceback,
            'user_name': self.user_name,
            'method': self.method,
            'path': self.path,
            'ip': self.ip,
            'request_data': self.request_data,
            'status_code': self.status_code,
            'resolved': self.resolved,
            'resolved_by': self.resolved_by.name if self.resolved_by else None,
            'resolved_time': self.resolved_time.isoformat() if self.resolved_time else None,
            'resolved_note': self.resolved_note,
            'create_time': self.create_time.isoformat() if self.create_time else None,
        }
