from marshmallow import fields

from app.validators.custom_schema import DefaultSchema


class ActionLogQuerySchema(DefaultSchema):
    """动作日志查询参数（page/limit 由 MoePagination 处理）"""
    user_id = fields.Str()
    user_name = fields.Str()
    action_type = fields.Str()
    resource_type = fields.Str()
    is_admin = fields.Bool()
    start_time = fields.DateTime()
    end_time = fields.DateTime()


class ErrorLogQuerySchema(DefaultSchema):
    """错误日志查询参数（page/limit 由 MoePagination 处理）"""
    error_type = fields.Str()
    error_class = fields.Str()
    resolved = fields.Bool()
    start_time = fields.DateTime()
    end_time = fields.DateTime()


class ErrorLogResolveSchema(DefaultSchema):
    """错误日志标记已解决"""
    resolved = fields.Bool(required=True)
    resolved_note = fields.Str(missing="")
