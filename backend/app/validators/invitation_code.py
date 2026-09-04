from marshmallow import fields, validates_schema
from flask_babel import gettext
from flask_apikit.exceptions import ValidateError

from app.validators.custom_message import required_message
from app.validators.custom_schema import DefaultSchema
from app.validators.custom_validate import object_id


class CreateInviteCodeSchema(DefaultSchema):
    team_id = fields.Str(
        required=True,
        validate=[object_id],
        error_messages={**required_message},
    )
    role = fields.Str(missing="")


class EditInviteCodeSchema(DefaultSchema):
    enabled = fields.Bool(missing=None, allow_none=True)
    team_id = fields.Str(missing=None, allow_none=True, validate=[object_id])
    role = fields.Str(missing=None, allow_none=True)

    @validates_schema
    def verify_not_empty(self, data):
        if not any(v is not None for v in data.values()):
            raise ValidateError(gettext("没有有效参数"))
