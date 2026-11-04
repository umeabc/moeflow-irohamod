from unittest.mock import patch

from app.models.media_import_task import MediaImportTask
from app.models.site_setting import SiteSetting
from tests import MoeAPITestCase


class MediaImportAPITestCase(MoeAPITestCase):
    def test_user_media_preserves_credentials_and_filename_metadata(self):
        project = self.create_project("media")
        token = self.get_creator(project).generate_token()
        settings = SiteSetting.get()
        settings.update(
            download_proxy="http://proxy.test", twitter_auth=" auth ", twitter_ct0=" csrf ",
            pixiv_session=" session ", bluesky_anonymous=False,
            bluesky_handle=" handle ", bluesky_app_password=" password ",
        )
        url = "https://example.com/user"
        cases = (
            ("twitter", (url, "auth", "csrf", "http://proxy.test"), {},
             ("https://image.test/1", "caption", "date", 2),
             {"text": "caption", "created_at": "date", "page": 2}),
            ("pixiv", (url, "session", "http://proxy.test"), {},
             ("https://image.test/1", "caption", "date", "12345", 2),
             {"text": "caption", "created_at": "date", "illust_id": "12345", "page": 2}),
            ("bluesky", (url, "http://proxy.test"),
             {"anonymous": False, "handle_id": "handle", "app_password": "password"},
             ("https://image.test/1", "caption", "date", 2),
             {"text": "caption", "created_at": "date", "page": 2}),
        )
        for kind, args, kwargs, item, metadata in cases:
            with self.subTest(kind=kind), patch(
                f"app.apis.file_download.enumerate_{kind}_user_media", return_value=[item]
            ) as enumerate_media, patch("app.apis.file_download.threading.Thread") as thread:
                response = self.post(
                    f"/v1/projects/{project.id}/files/from-url",
                    json={"source": kind + "_user", "url": url}, token=token,
                )
                self.assertErrorEqual(response)
                enumerate_media.assert_called_once_with(*args, **kwargs)
                task = MediaImportTask.by_task_id(response.json["task_id"])
                self.assertEqual(project, task.project)
                self.assertEqual([item[0]], task.urls)
                self.assertEqual([metadata], task.names)
                self.assertEqual(1, response.json["total"])
                self.assertEqual(kind, thread.call_args.kwargs["args"][3])
                self.assertTrue(thread.call_args.kwargs["daemon"])
                thread.return_value.start.assert_called_once_with()

    def test_empty_user_media_keeps_platform_messages_and_does_not_start_task(self):
        project = self.create_project("empty_media")
        token = self.get_creator(project).generate_token()
        for kind, message in (
            ("twitter", "该用户的媒体时间线中未找到图片"),
            ("pixiv", "该用户的作品中未找到可下载的图片"),
            ("bluesky", "该用户的媒体时间线中未找到图片"),
        ):
            with self.subTest(kind=kind), patch(
                f"app.apis.file_download.enumerate_{kind}_user_media", return_value=[]
            ), patch("app.apis.file_download.threading.Thread") as thread, patch(
                "app.apis.file_download.gettext", side_effect=lambda value: value
            ):
                response = self.post(
                    f"/v1/projects/{project.id}/files/from-url",
                    json={"source": kind + "_user", "url": "https://example.com/user"}, token=token,
                )
                self.assertEqual(400, response.status_code)
                self.assertEqual(message, response.json["message"])
                self.assertEqual(0, MediaImportTask.objects.count())
                thread.assert_not_called()
