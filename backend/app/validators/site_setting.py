from marshmallow import fields

from app.validators.custom_message import required_message
from app.validators.custom_schema import DefaultSchema
from app.validators.custom_validate import object_id


class SiteSettingSchema(DefaultSchema):
    only_allow_admin_create_team = fields.Boolean(
        required=True, error_messages={**required_message}
    )
    auto_join_team_ids = fields.List(
        fields.Str(
            validate=[object_id],
        ),
        required=True,
        error_messages={**required_message},
    )
    homepage_html = fields.Str()
    homepage_css = fields.Str()
    # 从社交媒体/外部链接下载图片设置
    twitter_auth = fields.Str(missing="")
    twitter_ct0 = fields.Str(missing="")
    download_proxy = fields.Str(missing="")
    pixiv_session = fields.Str(missing="")


class CustomMessagesSchema(DefaultSchema):
    """自定义文案覆盖：{key: message} 字典"""

    messages = fields.Dict(required=True, error_messages={**required_message})
