import io
from unittest.mock import patch

from PIL import Image

from app import oss
from app.constants.file import FileNotExistReason, FileSafeStatus
from app.constants.project import ProjectStatus
from app.exceptions import NoPermissionError
from app.models.file import File
from app.models.site_setting import SiteSetting
from tests import MoeAPITestCase


class ImageReviewAPITestCase(MoeAPITestCase):
    def setUp(self):
        super().setUp()
        self.project = self.create_project("review")
        self.token = self.get_creator(self.project).generate_token()
        admin = self.create_user("review-admin")
        admin.admin = True
        admin.save()
        self.admin_token = admin.generate_token()
        self.files_url = f"/v1/projects/{self.project.id}/files"
        self.review_url = "/v1/admin/files/safe-status"

    @staticmethod
    def image_bytes(color):
        with io.BytesIO() as image_file:
            Image.new("RGB", (32, 24), color).save(image_file, format="PNG")
            return image_file.getvalue()

    def upload(self, filename, color):
        payload = {"file": (io.BytesIO(self.image_bytes(color)), filename)}
        reply = self.post(self.files_url, data=payload, token=self.token)
        self.assertErrorEqual(reply)
        return reply.json

    def content(self, file_id):
        return self.client.get(
            f"/v1/files/{file_id}/content",
            headers={"Authorization": f"Bearer {self.token}"},
        )

    def test_upload_overwrite_and_url_import_share_policy(self):
        original = self.upload("same.png", "red")
        self.assertEqual(original["safe_status"], FileSafeStatus.NEED_HUMAN_CHECK)
        self.assertTrue(original["available_in_project"])
        self.assertTrue(original["url"])
        self.assertEqual(self.content(original["id"]).status_code, 200)

        SiteSetting.get().update(allow_pending_images=False, auto_approve_images=True)
        approved = self.upload("same.png", "blue")
        self.assertEqual(approved["id"], original["id"])
        self.assertTrue(approved["upload_overwrite"])
        self.assertEqual(approved["safe_status"], FileSafeStatus.SAFE)
        self.assertTrue(approved["available_in_project"])
        prefix = self.app.config["OSS_FILE_PREFIX"]
        self.assertFalse(oss.is_exist(prefix, original["save_name"]))

        SiteSetting.get().update(auto_approve_images=False)
        File.by_id(original["id"]).update(safe_task_id="old", safe_result_id="old")
        pending = self.upload("same.png", "yellow")
        self.assertEqual(pending["id"], original["id"])
        self.assertEqual(pending["safe_status"], FileSafeStatus.NEED_HUMAN_CHECK)
        self.assertFalse(pending["available_in_project"])
        for key in ("save_name", "url", "cover_url", "safe_check_url"):
            self.assertEqual(pending[key], "", key)
        saved = File.by_id(original["id"])
        self.assertIsNone(saved.safe_task_id)
        self.assertIsNone(saved.safe_result_id)
        self.assertFalse(oss.is_exist(prefix, approved["save_name"]))
        self.assertTrue(oss.is_exist(prefix, saved.save_name))
        self.assertErrorEqual(self.content(saved.id), NoPermissionError)

        with patch(
            "app.apis.file_download.download_image",
            return_value=[(self.image_bytes("cyan"), "via-url.png")],
        ):
            reply = self.post(
                f"{self.files_url}/from-url",
                json={"url": "https://example.invalid/via-url.png", "source": "external"},
                token=self.token,
            )
        self.assertErrorEqual(reply)
        imported = self.project.get_files("via-url.png").first()
        self.assertEqual(imported.safe_status, FileSafeStatus.NEED_HUMAN_CHECK)
        self.assertFalse(imported.available_in_project(False))

    def test_pending_visibility_filters_before_pagination_and_neighbors(self):
        SiteSetting.get().update(auto_approve_images=True)
        first = self.upload("a.png", "red")
        last = self.upload("z.png", "blue")
        SiteSetting.get().update(auto_approve_images=False)
        pending_ids = set()
        for i, status in enumerate((0, 1, 2, 3, None)):
            row = self.upload(f"m{i}.png", (i * 30, 80, 100))
            pending_ids.add(row["id"])
            if status is None:
                File.by_id(row["id"]).update(unset__safe_status=1)
            else:
                File.by_id(row["id"]).update(safe_status=status)
        stub = self.project.create_file("zz-stub.png")
        self.assertEqual(stub.file_not_exist_reason, FileNotExistReason.NOT_UPLOAD)
        self.assertTrue(stub.available_in_project(False))

        shown = self.get(self.files_url, token=self.token).json
        self.assertTrue(pending_ids <= {row["id"] for row in shown})
        SiteSetting.get().update(allow_pending_images=False)
        hidden = self.get(f"{self.files_url}?limit=2", token=self.token).json
        self.assertEqual([row["id"] for row in hidden], [first["id"], last["id"]])
        detail = self.get(f"/v1/files/{first['id']}", token=self.token)
        self.assertEqual(detail.json["next_image"]["id"], last["id"])
        for file_id in pending_ids:
            self.assertErrorEqual(self.get(f"/v1/files/{file_id}", token=self.token), NoPermissionError)
            self.assertErrorEqual(self.content(file_id), NoPermissionError)
        stub_response = self.get(f"/v1/files/{stub.id}", token=self.token)
        self.assertTrue(stub_response.json["available_in_project"])

    def test_admin_preview_stale_review_rejection_and_reupload(self):
        stale = self.upload("review.png", "red")
        replacement = self.upload("review.png", "blue")
        rejected = self.upload("reject.png", "green")
        self.project.create_file("placeholder.png")
        self.project.create_folder("folder")
        inactive = self.upload("inactive.png", "cyan")
        File.by_id(inactive["id"]).update(activated=False)
        other = self.create_project("archive")
        other.upload("archived.png", io.BytesIO(self.image_bytes("pink")))
        other.update(status=ProjectStatus.ARCHIVED)
        SiteSetting.get().update(allow_pending_images=False)
        pending_url = f"/v1/admin/files?safe_status={FileSafeStatus.NEED_HUMAN_CHECK}"
        data = self.get(pending_url, token=self.admin_token).json
        self.assertEqual({row["id"] for row in data}, {replacement["id"], rejected["id"]})
        self.assertTrue(all(row["safe_check_url"] and row["save_name"] for row in data))
        self.assertTrue(all(not row["available_in_project"] for row in data))

        fail = self.put(
            self.review_url,
            json={
                "safe_files": [replacement["id"]],
                "unsafe_files": [rejected["id"]],
                "file_versions": {
                    stale["id"]: stale["save_name"],
                    rejected["id"]: rejected["save_name"],
                },
            },
            token=self.admin_token,
        )
        self.assertEqual(fail.status_code, 409)
        self.assertEqual(fail.json["conflicting_file_ids"], [stale["id"]])
        self.assertEqual(File.by_id(rejected["id"]).safe_status, FileSafeStatus.NEED_HUMAN_CHECK)
        self.assertErrorEqual(
            self.put(
                self.review_url,
                json={
                    "safe_files": [replacement["id"]],
                    "unsafe_files": [rejected["id"]],
                    "file_versions": {
                        replacement["id"]: replacement["save_name"],
                        rejected["id"]: rejected["save_name"],
                    },
                },
                token=self.admin_token,
            )
        )
        self.assertEqual(self.content(replacement["id"]).status_code, 200)
        blocked = File.by_id(rejected["id"])
        self.assertEqual(blocked.safe_status, FileSafeStatus.BLOCK)
        self.assertEqual(blocked.file_not_exist_reason, FileNotExistReason.BLOCK)
        self.assertFalse(blocked.available_in_project(True))
        self.assertEqual(blocked.save_name, "")
        prefix = self.app.config["OSS_FILE_PREFIX"]
        for style in (None, "cover", "safe-check"):
            self.assertFalse(oss.is_exist(prefix, rejected["save_name"], process_name=style))
        history = self.get(
            f"/v1/admin/files?safe_status={FileSafeStatus.BLOCK}", token=self.admin_token
        ).json
        self.assertEqual([row["id"] for row in history], [rejected["id"]])
        self.assertEqual(history[0]["safe_check_url"], "")
        self.assertFalse(history[0]["available_in_project"])

        retry = self.upload("reject.png", "purple")
        self.assertEqual(retry["id"], rejected["id"])
        self.assertEqual(retry["safe_status"], FileSafeStatus.NEED_HUMAN_CHECK)
        self.assertEqual(retry["file_not_exist_reason"], FileNotExistReason.UNKNOWN)
