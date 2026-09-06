from marshmallow import fields, validates_schema
from flask_babel import gettext
from flask_apikit.exceptions import ValidateError

from app.validators.custom_message import required_message
from app.validators.custom_schema import DefaultSchema


class CreateNoticeSchema(DefaultSchema):
    title = fields.Str(missing="")
    content = fields.Str(
        required=True,
        error_messages={**required_message},
    )

    @validates_schema
    def verify_content(self, data):
        if not (data.get("content") or "").strip():
            raise ValidateError(gettext("通知内容不能为空"))


class EditNoticeSchema(DefaultSchema):
    title = fields.Str(missing=None, allow_none=True)
    content = fields.Str(missing=None, allow_none=True)
    enabled = fields.Bool(missing=None, allow_none=True)

    @validates_schema
    def verify_not_empty(self, data):
        if not any(v is not None for v in data.values()):
            raise ValidateError(gettext("没有有效参数"))
