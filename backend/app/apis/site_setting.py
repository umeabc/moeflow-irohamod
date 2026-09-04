import shutil

from app.constants.storage import StorageType
from app.core.views import MoeAPIView
from app.decorators.auth import admin_required
from app.models.site_setting import SiteSetting
from app.validators.site_setting import SiteSettingSchema


class SiteSettingAPI(MoeAPIView):
    @admin_required
    def get(self):
        """
        @api {get} /v1/site-setting 获取站点设置
        @apiVersion 1.0.0
        @apiName getSiteSettingAPI
        @apiGroup SiteSetting
        @apiUse APIHeader
        @apiUse TokenHeader

        @apiSuccessExample {json} 返回示例
        {
            "data": {
                "enable_whitelist": true,
                "whitelist_emails": [],
            }
        }
        """
        return SiteSetting.get().to_api()

    @admin_required
    def put(self):
        """
        @api {put} /v1/site-setting 修改站点设置
        @apiVersion 1.0.0
        @apiName putSiteSettingAPI
        @apiGroup SiteSetting
        @apiUse APIHeader
        @apiUse TokenHeader

        @apiParam {Boolean} enable_whitelist 是否开启白名单
        @apiParam {String[]} whitelist_emails 白名单邮箱列表

        @apiSuccessExample {json} 返回示例
        {
            "data": {
                "enable_whitelist": true,
                "whitelist_emails": [],
            }
        }
        """
        data = self.get_json(SiteSettingSchema())
        site_setting = SiteSetting.get()
        site_setting.only_allow_admin_create_team = data["only_allow_admin_create_team"]
        site_setting.auto_join_team_ids = data["auto_join_team_ids"]
        site_setting.homepage_html = data.get("homepage_html", "")
        site_setting.homepage_css = data.get("homepage_css", "")
        site_setting.save()
        site_setting.reload()
        return site_setting.to_api()


class HomepageAPI(MoeAPIView):
    def get(self):
        return {
            "html": SiteSetting.get().homepage_html,
            "css": SiteSetting.get().homepage_css,
        }


class StorageUsageAPI(MoeAPIView):
    @admin_required
    def get(self):
        """
        @api {get} /v1/admin/storage-usage 获取存储区剩余空间
        @apiVersion 1.0.0
        @apiName getStorageUsageAPI
        @apiGroup SiteSetting
        @apiUse APIHeader
        @apiUse TokenHeader

        @apiSuccessExample {json} 返回示例
        {
            "storage_type": "LOCAL_STORAGE",
            "total": 34359738368,
            "used": 10522601472,
            "free": 21471334400,
        }
        """
        from app import STORAGE_PATH, app_config

        if app_config["STORAGE_TYPE"] == StorageType.LOCAL_STORAGE:
            total, used, free = shutil.disk_usage(STORAGE_PATH)
        else:
            total = used = free = 0
        return {
            "storage_type": app_config["STORAGE_TYPE"],
            "total": total,
            "used": used,
            "free": free,
        }
