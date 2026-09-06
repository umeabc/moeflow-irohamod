import os
import platform
import re
import shutil
import time

from flask_babel import gettext

from app.constants.storage import StorageType
from app.core.views import MoeAPIView
from app.decorators.auth import admin_required
from app.models.site_setting import SiteSetting
from app.validators.site_setting import CustomMessagesSchema, SiteSettingSchema


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


class CustomMessagesAPI(MoeAPIView):
    """公开：返回站点自定义文案覆盖（key -> message），登录页文案也需可覆盖"""

    def get(self):
        return SiteSetting.get().custom_messages or {}


class AdminCustomMessagesAPI(MoeAPIView):
    """管理：读取/保存站点自定义文案覆盖"""

    @admin_required
    def get(self):
        return SiteSetting.get().custom_messages or {}

    @admin_required
    def put(self):
        data = self.get_json(CustomMessagesSchema())
        # 支持按语言分组：{ "zh-CN": {key: msg}, "en": {key: msg} }，或旧扁平 {"key": msg}
        # 注意值可为 dict（语言组）或 str（旧扁平），不能 str() 化，原样保存
        messages = data["messages"]
        site_setting = SiteSetting.get()
        site_setting.custom_messages = messages
        site_setting.save()
        site_setting.reload()
        return {"message": gettext("保存成功"), "custom_messages": site_setting.custom_messages}


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


class SystemStatusAPI(MoeAPIView):
    """获取后端服务器的基础资源使用情况（仅管理员）"""

    @admin_required
    def get(self):
        from app import STORAGE_PATH, app_config

        cpu_percent = None
        try:
            with open("/proc/stat", "r", encoding="utf-8") as f:
                first = f.readline().split()
            if first and first[0] == "cpu":
                values = [int(value) for value in first[1:]]
                idle = values[3] + (values[4] if len(values) > 4 else 0)
                total = sum(values)
                time.sleep(0.08)
                with open("/proc/stat", "r", encoding="utf-8") as f:
                    second = f.readline().split()
                values2 = [int(value) for value in second[1:]]
                idle2 = values2[3] + (values2[4] if len(values2) > 4 else 0)
                total2 = sum(values2)
                delta_total = total2 - total
                delta_idle = idle2 - idle
                if delta_total > 0:
                    cpu_percent = round((1 - delta_idle / delta_total) * 100, 1)
        except (OSError, ValueError, IndexError):
            pass

        memory_percent = None
        try:
            memory = {}
            with open("/proc/meminfo", "r", encoding="utf-8") as f:
                for line in f:
                    match = re.match(r"^(MemTotal|MemAvailable):\s+(\d+)", line)
                    if match:
                        memory[match.group(1)] = int(match.group(2))
            if memory.get("MemTotal") and "MemAvailable" in memory:
                memory_percent = round(
                    (1 - memory["MemAvailable"] / memory["MemTotal"]) * 100, 1
                )
        except (OSError, ValueError):
            pass

        disk_percent = None
        disk_total = disk_used = disk_free = None
        try:
            disk_total, disk_used, disk_free = shutil.disk_usage(STORAGE_PATH)
            if disk_total:
                disk_percent = round(disk_used / disk_total * 100, 1)
        except OSError:
            pass

        system_version = platform.platform()
        try:
            with open("/etc/os-release", "r", encoding="utf-8") as f:
                for line in f:
                    if line.startswith("PRETTY_NAME="):
                        system_version = line.split("=", 1)[1].strip().strip('"')
                        break
        except OSError:
            pass

        return {
            "cpu_percent": cpu_percent,
            "memory_percent": memory_percent,
            "disk_percent": disk_percent,
            "disk_total": disk_total,
            "disk_used": disk_used,
            "disk_free": disk_free,
            "system_version": system_version,
            "storage_type": app_config["STORAGE_TYPE"],
        }
