from app.exceptions import NoPermissionError
from app.models.site_setting import SiteSetting
from tests import MoeAPITestCase


class TestSiteSettingAPI(MoeAPITestCase):
    def test_get_flavor_without_token(self):
        response = self.get("/v1/site/flavor")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["flavor"], "irohamod")
        self.assertTrue(response.json["name"])
        self.assertTrue(response.json["version"])

    def test_get_site_setting(self):
        admin_user = self.create_user("admin")
        admin_user.admin = True
        admin_user.save()
        admin_token = admin_user.generate_token()
        user = self.create_user("user")
        user_token = user.generate_token()
        # 普通用户, 无权限
        data = self.get("/v1/admin/site-setting", token=user_token)
        self.assertErrorEqual(data, NoPermissionError)
        # 管理员, 有权限
        data = self.get("/v1/admin/site-setting", token=admin_token)
        self.assertErrorEqual(data)

    def test_put_site_setting(self):
        admin_user = self.create_user("admin")
        admin_user.admin = True
        admin_user.save()
        admin_token = admin_user.generate_token()
        user = self.create_user("user")
        user_token = user.generate_token()
        site_setting = SiteSetting.get()
        site_setting.enable_whitelist = True
        site_setting.only_allow_admin_create_team = True
        site_setting.auto_join_team_ids = []
        site_setting.whitelist_emails = []
        site_setting.save()
        site_setting.reload()
        self.assertEqual(site_setting.enable_whitelist, True)
        self.assertEqual(site_setting.whitelist_emails, [])
        self.assertEqual(site_setting.only_allow_admin_create_team, True)
        self.assertEqual(site_setting.auto_join_team_ids, [])
        new_setting_json = {
            "enable_whitelist": False,
            "whitelist_emails": ["admin1@moeflow.com", "admin2@moeflow.com"],
            "only_allow_admin_create_team": False,
            "auto_join_team_ids": ["5e7f7b2b4d9b4b0b8c1c1c1c"],
        }
        # 普通用户, 无权限
        data = self.put(
            "/v1/admin/site-setting", json=new_setting_json, token=user_token
        )
        self.assertErrorEqual(data, NoPermissionError)
        # 管理员, 有权限
        data = self.put(
            "/v1/admin/site-setting", json=new_setting_json, token=admin_token
        )
        self.assertErrorEqual(data)
        site_setting.reload()
        # Deprecated whitelist fields are accepted but no longer written.
        self.assertTrue(site_setting.enable_whitelist)
        self.assertEqual(site_setting.whitelist_emails, [])
        self.assertEqual(
            site_setting.only_allow_admin_create_team,
            new_setting_json["only_allow_admin_create_team"],
        )
        self.assertEqual(
            [str(id) for id in site_setting.auto_join_team_ids],
            new_setting_json["auto_join_team_ids"],
        )

    def test_review_switches_default_and_are_preserved_by_older_settings_put(self):
        admin = self.create_user("review-admin")
        admin.admin = True
        admin.save()
        token = admin.generate_token()
        url = "/v1/admin/site-setting"
        # Existing site documents need not be migrated before deploying.
        SiteSetting.get().update(unset__allow_pending_images=1, unset__auto_approve_images=1)
        initial = self.get(url, token=token)
        self.assertTrue(initial.json["allow_pending_images"])
        self.assertFalse(initial.json["auto_approve_images"])
        old_payload = {"only_allow_admin_create_team": False, "auto_join_team_ids": []}
        updated = self.put(
            url,
            token=token,
            json={**old_payload, "allow_pending_images": False, "auto_approve_images": True},
        )
        self.assertErrorEqual(updated)
        self.assertFalse(updated.json["allow_pending_images"])
        self.assertTrue(updated.json["auto_approve_images"])
        self.assertErrorEqual(self.put(url, token=token, json=old_payload))
        saved = self.get(url, token=token)
        self.assertFalse(saved.json["allow_pending_images"])
        self.assertTrue(saved.json["auto_approve_images"])
