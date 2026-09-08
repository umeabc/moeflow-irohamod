import logging
from mongoengine import (
    Document,
    ListField,
    BooleanField,
    StringField,
    ObjectIdField,
    DictField,
)

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


class SiteSetting(Document):
    """
    This document only have one document, of which the type is 'site'.
    """

    type = StringField(db_field="n", required=True, unique=True)
    # 兼容历史文档：字段保留在模型中（存在 DB 中但不再启用），功能层面已移除
    enable_whitelist = BooleanField(db_field="ew", default=True)
    whitelist_emails = ListField(StringField(), db_field="we", default=list)
    only_allow_admin_create_team = BooleanField(db_field="oacg", default=True)
    auto_join_team_ids = ListField(ObjectIdField(), db_field="ajt", default=list)
    homepage_html = StringField(db_field="h", default="")
    homepage_css = StringField(db_field="hc", default="")
    # 站点自定义文案覆盖（key -> message）：管理员后台可编辑，前端运行时合并覆盖默认 locale
    custom_messages = DictField(db_field="cm", default=dict)
    # 站点品牌图片（存 oss 文件名，site-brand/ 前缀下）：可后台上传替换 mascot / favicon
    mascot_name = StringField(db_field="ma", default="")
    favicon_name = StringField(db_field="fi", default="")
    # 从社交媒体/外部链接下载图片设置（管理员后台配置）
    twitter_auth = StringField(db_field="ta", default="")  # Twitter auth_token
    twitter_ct0 = StringField(db_field="tc", default="")  # Twitter ct0
    download_proxy = StringField(db_field="dp", default="")  # 下载图片专用 HTTP 代理（空=直连）
    pixiv_session = StringField(db_field="ps", default="")  # Pixiv PHPSESSID（R18 等受限作品可选）

    meta = {
        "indexes": [
            "type",
        ]
    }

    @classmethod
    def init_site_setting(cls):
        if cls.objects(type="site").count() > 0:
            logger.debug("已有站点设置，跳过初始化")
        else:
            logger.debug("初始化站点设置")
            cls(type="site").save()

    @classmethod
    def get(cls) -> "SiteSetting":
        return cls.objects(type="site").first()

    def to_api(self):
        return {
            "only_allow_admin_create_team": self.only_allow_admin_create_team,
            "auto_join_team_ids": [str(id) for id in self.auto_join_team_ids],
            "homepage_html": self.homepage_html,
            "homepage_css": self.homepage_css,
            "custom_messages": self.custom_messages or {},
            "mascot_name": self.mascot_name or "",
            "favicon_name": self.favicon_name or "",
            "twitter_auth": self.twitter_auth or "",
            "twitter_ct0": self.twitter_ct0 or "",
            "download_proxy": self.download_proxy or "",
            "pixiv_session": self.pixiv_session or "",
        }
