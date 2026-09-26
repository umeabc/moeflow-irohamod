from marshmallow import fields

from app.validators.custom_message import required_message
from app.validators.custom_schema import DefaultSchema
from app.validators.custom_validate import object_id


class LlmPresetSchema(DefaultSchema):
    """自动翻译模型预设单项"""

    provider = fields.Str(missing="")
    model = fields.Str(missing="")
    base_url = fields.Str(missing="")
    api_key = fields.Str(missing="")
    use_admin_key = fields.Boolean(missing=False)


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
    # Bluesky 下载设置
    bluesky_anonymous = fields.Boolean(missing=True)
    bluesky_handle = fields.Str(missing="")
    bluesky_app_password = fields.Str(missing="")
    # 自动翻译模型预设
    llm_presets = fields.List(fields.Nested(LlmPresetSchema), missing=list)


class CustomMessagesSchema(DefaultSchema):
    """自定义文案覆盖：{key: message} 字典"""

    messages = fields.Dict(required=True, error_messages={**required_message})
