"""Regression coverage for the ordinary project side of image moderation."""

import io
import json
from unittest.mock import Mock, patch
from zipfile import ZipFile

from PIL import Image

from app import oss
from app.constants.file import FileNotExistReason, FileSafeStatus, ParseStatus
from app.constants.output import OutputStatus, OutputTypes
from app.exceptions import NoPermissionError, ProjectFinishedError
from app.models.site_setting import SiteSetting
from app.tasks.file_parse import safe_result_task, safe_task
from app.tasks.ocr import ocr_task
from app.tasks.output_project import output_project_task
from tests import MoeAPITestCase


class PendingImageAccessTestCase(MoeAPITestCase):
    def setUp(self):
        super().setUp()
        self.project = self.create_project("pending-image-access")
        self.user = self.get_creator(self.project)
        self.token = self.user.generate_token()
        self.target = self.project.targets().first()
        self.project_url = f"/v1/projects/{self.project.id}"
        self.export_url = f"{self.project_url}/targets/{self.target.id}/outputs"

    def set_pending_visibility(self, allowed):
        SiteSetting.get().update(allow_pending_images=allowed)

    def image(self, stem, status=FileSafeStatus.NEED_HUMAN_CHECK):
        if status == "placeholder":
            file = self.project.create_file(stem + ".png")
        else:
            buffer = io.BytesIO()
            with Image.new("RGB", (2, 2), "red") as image:
                image.save(buffer, "PNG")
            file = self.project.upload(stem + ".png", buffer)
            if status is None:
                file.update(unset__safe_status=1)
            else:
                file.update(safe_status=status)
            file.reload()
        source = file.create_source(f"original {stem}")
        translation = source.create_translation(f"translated {stem}", self.target, self.user)
        return file, source, translation

    def read_sources(self, file, token=None):
        return self.get(
            f"/v1/files/{file.id}/sources",
            query_string={"target_id": str(self.target.id)},
            token=token or self.token,
        )

    def export_payload(self, output):
        output.reload()
        self.assertEqual(OutputStatus.SUCCEEDED, output.status)
        with oss.download(
            self.app.config["OSS_OUTPUT_PREFIX"] + str(output.id) + "/", output.file_name
        ) as stored:
            return stored.read()

    def test_all_pending_states_and_unrelated_project_permissions(self):
        file, _, _ = self.image("legacy")
        outsider = self.create_user("outside-pending-project").generate_token()
        for status in (0, 1, 2, 3, None, FileSafeStatus.SAFE, FileSafeStatus.BLOCK):
            with self.subTest(status=status):
                if status is None:
                    file.update(unset__safe_status=1)
                else:
                    file.update(safe_status=status)
                self.set_pending_visibility(True)
                expected = NoPermissionError if status == FileSafeStatus.BLOCK else None
                self.assertErrorEqual(self.read_sources(file), expected)
                self.assertErrorEqual(self.read_sources(file, outsider), NoPermissionError)

                self.set_pending_visibility(False)
                expected = None if status == FileSafeStatus.SAFE else NoPermissionError
                self.assertErrorEqual(self.read_sources(file), expected)

    def test_hidden_id_rejects_all_normal_source_and_translation_writes(self):
        file, source, translation = self.image("pending-writes")
        self.set_pending_visibility(False)
        sources_url = f"/v1/files/{file.id}/sources"
        source_url = f"/v1/sources/{source.id}"
        translation_url = f"/v1/translations/{translation.id}"
        target_id = str(self.target.id)
        for method, url, payload in (
            ("POST", sources_url, {"content": "new label"}),
            ("PATCH", sources_url, [{"source_id": str(source.id), "translation_id": str(translation.id)}]),
            ("PUT", source_url, {"content": "new source"}),
            ("PUT", source_url + "/rank", {"next_source_id": "end"}),
            ("DELETE", source_url, None),
            ("POST", source_url + "/translations", {"content": "new", "target_id": target_id}),
            ("POST", source_url + "/translations", {"content": "", "target_id": target_id}),
            ("PUT", translation_url, {"selected": True, "proofread_content": "new"}),
            ("PUT", translation_url, {"content": "new"}),
            ("DELETE", translation_url, None),
        ):
            with self.subTest(method=method, url=url, payload=payload):
                options = {} if payload is None else {
                    "data": json.dumps(payload), "content_type": "application/json"
                }
                response = self.open(url, method=method, token=self.token, **options)
                self.assertErrorEqual(response, NoPermissionError)
        self.assertEqual("original pending-writes", source.reload().content)
        self.assertEqual("translated pending-writes", translation.reload().content)
        self.assertFalse(translation.selected)

        self.set_pending_visibility(True)
        response = self.put(source_url, token=self.token, json={"content": "editable again"})
        self.assertErrorEqual(response)
        response = self.put(translation_url, token=self.token, json={"content": "editable again"})
        self.assertErrorEqual(response)

    def test_not_uploaded_placeholder_translates_but_blocked_placeholder_never_does(self):
        placeholder, source, _ = self.image("labelplus", "placeholder")
        blocked, _, _ = self.image("blocked-placeholder", "placeholder")
        blocked.update(safe_status=FileSafeStatus.BLOCK, file_not_exist_reason=FileNotExistReason.BLOCK)
        self.assertEqual(FileNotExistReason.NOT_UPLOAD, placeholder.file_not_exist_reason)
        for allowed in (False, True):
            self.set_pending_visibility(allowed)
            self.assertErrorEqual(self.read_sources(placeholder))
            self.assertErrorEqual(self.read_sources(blocked), NoPermissionError)
        self.set_pending_visibility(False)
        self.assertErrorEqual(self.post(
            f"/v1/sources/{source.id}/translations", token=self.token,
            json={"content": "placeholder translation", "target_id": str(self.target.id)},
        ))

    def test_archived_project_reads_but_does_not_edit_or_mark_typesetter(self):
        file, source, translation = self.image("archived")
        self.project.archive()
        self.assertErrorEqual(self.read_sources(file))
        self.assertErrorEqual(self.put(
            f"/v1/sources/{source.id}", token=self.token, json={"content": "edit"}
        ), ProjectFinishedError)
        self.assertErrorEqual(self.delete(
            f"/v1/translations/{translation.id}", token=self.token
        ), ProjectFinishedError)
        self.assertErrorEqual(self.post(f"{self.project_url}/ocr", token=self.token), ProjectFinishedError)

        response = self.post(self.export_url, token=self.token, json={
            "type": OutputTypes.ONLY_TEXT, "typesetter": "must not be saved",
        })
        self.assertErrorEqual(response)
        self.assertEqual(0, response.json["typesetter_marked_count"])
        self.assertFalse(file.reload().typesetter)
        exported = self.export_payload(self.project.outputs().first()).decode("utf-8")
        self.assertIn("translated archived", exported)
        self.set_pending_visibility(False)
        self.assertErrorEqual(self.read_sources(file), NoPermissionError)

    def test_queued_exports_recheck_policy_for_zip_and_txt(self):
        approved, _, _ = self.image("approved", FileSafeStatus.SAFE)
        pending, _, _ = self.image("pending")
        legacy, _, _ = self.image("legacy", None)
        blocked, _, _ = self.image("blocked", FileSafeStatus.BLOCK)
        placeholder, _, _ = self.image("imported", "placeholder")
        visible_text = self.project.to_labelplus(target=self.target)
        self.assertIn("translated pending", visible_text)
        self.assertIn("translated legacy", visible_text)
        self.assertNotIn("translated blocked", visible_text)
        with patch.dict(self.app.config, {"OUTPUT_WAIT_SECONDS": 0}):
            for output_type in (OutputTypes.ALL, OutputTypes.ONLY_TEXT):
                with self.subTest(output_type=output_type):
                    self.set_pending_visibility(True)
                    with patch("app.apis.project.output_project") as enqueue:
                        response = self.post(self.export_url, token=self.token, json={
                            "type": output_type,
                            "file_ids_include": [str(f.id) for f in (approved, pending, legacy, blocked, placeholder)],
                            "file_ids_exclude": [str(placeholder.id)],
                        })
                        self.assertErrorEqual(response)
                        output = self.project.outputs().first()
                        enqueue.assert_called_once_with(str(output.id))
                    self.set_pending_visibility(False)
                    output_project_task(str(output.id))
                    contents = self.export_payload(output)
                    if output_type == OutputTypes.ALL:
                        with ZipFile(io.BytesIO(contents)) as archive:
                            self.assertEqual(["images/approved.png"], [
                                name for name in archive.namelist() if name.startswith("images/")
                            ])
                            self.assertNotIn("errors.txt", archive.namelist())
                            contents = archive.read("translations.txt")
                    text = contents.decode("utf-8")
                    self.assertIn("[approved.png]", text)
                    self.assertIn("translated approved", text)
                    for hidden in ("pending", "legacy", "blocked", "imported"):
                        self.assertNotIn(f"[{hidden}.png]", text)
                        self.assertNotIn(f"translated {hidden}", text)

    def test_hidden_images_are_not_marked_for_export(self):
        approved, _, _ = self.image("typeset-visible", FileSafeStatus.SAFE)
        pending, _, _ = self.image("typeset-hidden")
        self.set_pending_visibility(False)
        with patch("app.apis.project.output_project"):
            response = self.post(self.export_url, token=self.token, json={
                "type": OutputTypes.ONLY_TEXT, "typesetter": "assigned",
            })
        self.assertErrorEqual(response)
        self.assertEqual(1, response.json["typesetter_marked_count"])
        self.assertEqual("assigned", approved.reload().typesetter)
        self.assertFalse(pending.reload().typesetter)

    def test_project_ocr_queue_and_consumer_ignore_hidden_and_old_upload(self):
        approved, _, _ = self.image("ocr-approved", FileSafeStatus.SAFE)
        pending, _, _ = self.image("ocr-pending")
        blocked, _, _ = self.image("ocr-blocked", FileSafeStatus.BLOCK)
        placeholder, _, _ = self.image("ocr-placeholder", "placeholder")
        self.project.team.update(ocr_quota_month=1)
        self.set_pending_visibility(False)
        with patch("app.apis.project.ocr") as enqueue:
            response = self.post(f"{self.project_url}/ocr", token=self.token)
        self.assertErrorEqual(response)
        enqueue.assert_called_once_with("project", str(self.project.id))
        self.assertEqual(ParseStatus.QUEUING, approved.reload().parse_status)
        for skipped in (pending, blocked, placeholder):
            self.assertEqual(ParseStatus.NOT_START, skipped.reload().parse_status)

        # Simulate work queued while still visible, before moderation settings changed.
        pending.update(parse_status=ParseStatus.QUEUING)

        def reupload_after_claim(images):
            self.assertEqual([approved.id], [file.id for file in images])
            approved.update(save_name="replacement.png", parse_status=ParseStatus.PARSING)
            raise RuntimeError("worker failed after replacement was uploaded")

        with patch("app.tasks.ocr.merge_and_ocr", side_effect=reupload_after_claim) as merge:
            result = ocr_task("project", str(self.project.id))
        merge.assert_called_once()
        self.assertIn("worker failed after replacement", result)
        self.assertEqual(ParseStatus.NOT_START, pending.reload().parse_status)
        self.assertEqual(ParseStatus.PARSING, approved.reload().parse_status)
        self.assertFalse(self.project.reload().ocring)

    def test_stale_scan_result_cannot_block_a_replacement(self):
        scanned, _, _ = self.image("being-scanned", FileSafeStatus.WAIT_RESULT)
        scanned.update(safe_result_id="scan-for-old-file")
        old_save_name = scanned.save_name

        def replace_while_waiting(_request):
            scanned.update(save_name="replacement.png", safe_status=FileSafeStatus.SAFE)
            return json.dumps({"code": 200, "data": [{
                "code": 200, "results": [{"scene": "porn", "suggestion": "block"}],
            }]})

        client = Mock()
        client.do_action_with_exception.side_effect = replace_while_waiting
        with patch("app.tasks.file_parse._green_request", return_value=(client, Mock())), patch.object(oss, "delete") as delete:
            result = safe_result_task(str(scanned.id), old_save_name, "scan-for-old-file")
        self.assertIn("跳过", result)
        self.assertEqual("replacement.png", scanned.reload().save_name)
        self.assertEqual(FileSafeStatus.SAFE, scanned.safe_status)
        delete.assert_not_called()

        with patch("app.tasks.file_parse._green_request") as request:
            result = safe_task(str(scanned.id), old_save_name)
        self.assertIn("跳过", result)
        request.assert_not_called()
