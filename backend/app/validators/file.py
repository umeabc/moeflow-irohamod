from marshmallow import fields

from app.models.file import File
from app.validators.custom_validate import indexes_in, object_id
from app.validators.custom_message import required_message
from app.validators.custom_schema import DefaultSchema


class FileSearchSchema(DefaultSchema):
    word = fields.Str(missing=None)
    parent_id = fields.Str(missing=None, validate=[object_id])
    only_folder = fields.Bool(missing=False)
    only_file = fields.Bool(missing=False)
    order_by = fields.List(fields.Str(), missing=None, validate=[indexes_in(File)])
    target = fields.Str(missing=None, validate=[object_id])


class FileGetSchema(DefaultSchema):
    target = fields.Str(missing=None, validate=[object_id])


class FileMoveSchema(DefaultSchema):
    file_ids = fields.List(
        fields.Str(validate=[object_id]),
        required=True,
        error_messages={**required_message},
    )
    target_project_id = fields.Str(
        required=True,
        validate=[object_id],
        error_messages={**required_message},
    )


class FileUploadSchema(DefaultSchema):
    parent_id = fields.Str(missing=None, validate=[object_id])


class AdminFileSearchSchema(DefaultSchema):
    safe_status = fields.List(fields.Int(), missing=[])
