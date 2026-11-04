"""Real image-codec regressions for uploads, previews, and LabelPlus exports."""

import io
import re
from unittest.mock import patch
from urllib.parse import urlsplit
from zipfile import ZipFile

from PIL import Image

from app import celery, oss
from app.constants.file import FileType
from app.constants.output import OutputStatus, OutputTypes
from app.constants.storage import StorageType
from app.models.file import File
from app.models.language import Language
from app.tasks.thumbnail import create_thumbnail_task
from app.utils.image import ensure_image_codec
from tests import MoeAPITestCase


def image_bytes(format, *, color=(24, 100, 200), transparent=False):
    # No skips or mocked codecs: AVIF must use the installed Pillow plugin.
    ensure_image_codec("image." + format.lower())
    with Image.new("RGBA", (80, 60), color + (255,)) as image:
        if transparent:
            image.paste((0, 0, 0, 0), (0, 0, 40, 60))
        buffer = io.BytesIO()
        if format == "JPEG":
            with image.convert("RGB") as rgb:
                rgb.save(buffer, format=format)
        else:
            image.save(buffer, format=format)
        return buffer.getvalue()


class ImageFormatsAPITestCase(MoeAPITestCase):
    def setUp(self):
        super().setUp()
        self.project = self.create_project(
            "image-formats", target_languages=Language.by_code("en")
        )
        self.target = self.project.targets().first()
        self.user = self.get_creator(self.project)
        self.token = self.user.generate_token()

    def tearDown(self):
        try:
            self.project.clear()
        finally:
            super().tearDown()

    def upload_image(self, name, format, *, parent=None, **kwargs):
        payload = image_bytes(format, **kwargs)
        data = {"file": (io.BytesIO(payload), name)}
        if parent:
            data["parent_id"] = str(parent.id)
        response = self.post(
            f"/v1/projects/{self.project.id}/files",
            data=data,
            token=self.token,
            content_type="multipart/form-data",
        )
        self.assertErrorEqual(response)
        file = File.by_id(response.json["id"])
        self.assertEqual(FileType.IMAGE, file.type)
        return file, payload

    def export(self, type=OutputTypes.ALL, **kwargs):
        response = self.post(
            f"/v1/projects/{self.project.id}/targets/{self.target.id}/outputs",
            json={"type": type, **kwargs},
            token=self.token,
        )
        self.assertErrorEqual(response)
        output = self.project.outputs().order_by("-create_time").first()
        self.assertEqual(OutputStatus.SUCCEEDED, output.status)
        with oss.download(
            self.app.config["OSS_OUTPUT_PREFIX"] + str(output.id) + "/",
            output.file_name,
        ) as stream:
            return stream.read()

    def assert_upload_previews(self, format):
        file, payload = self.upload_image("page." + format.lower(), format)
        for url, size in (
            (file.url, (80, 60)),
            (file.cover_url, (180, 140)),
            (file.safe_check_url, (80, 60)),
        ):
            self.assertNotEqual("generating", url)
            response = self.client.get(urlsplit(url).path)
            try:
                self.assertEqual(200, response.status_code)
                self.assertEqual("image/" + format.lower(), response.mimetype)
                if url == file.url:
                    self.assertEqual(payload, response.data)
                with Image.open(io.BytesIO(response.data)) as decoded:
                    decoded.load()
                    self.assertEqual(format, decoded.format)
                    self.assertEqual(size, decoded.size)
            finally:
                response.close()

    def test_webp_upload_and_previews(self):
        self.assert_upload_previews("WEBP")

    def test_avif_upload_and_previews(self):
        self.assert_upload_previews("AVIF")

    def assert_jpeg_export(self, format):
        file, original = self.upload_image(
            "page." + format.lower(), format, transparent=True
        )
        source = file.create_source("source", x=0.25, y=0.5)
        source.create_translation("translated page", self.target, self.user)
        with ZipFile(io.BytesIO(self.export())) as archive:
            self.assertNotIn("errors.txt", archive.namelist())
            self.assertIn("images/page.jpg", archive.namelist())
            self.assertNotIn("images/" + file.name, archive.namelist())
            text = archive.read("translations.txt").decode("utf-8")
            self.assertIn(">>>>>>>>[page.jpg]<<<<<<<<", text)
            self.assertNotIn("[" + file.name + "]", text)
            self.assertIn("translated page", text)
            jpeg = archive.read("images/page.jpg")
            self.assertTrue(jpeg.startswith(b"\xff\xd8\xff"))
            with Image.open(io.BytesIO(jpeg)) as decoded:
                decoded.load()
                self.assertEqual("JPEG", decoded.format)
                self.assertEqual("RGB", decoded.mode)
                self.assertEqual((80, 60), decoded.size)
                self.assertTrue(all(channel >= 250 for channel in decoded.getpixel((5, 30))))
                with Image.open(io.BytesIO(original)) as uploaded:
                    expected = uploaded.convert("RGB").getpixel((65, 30))
                actual = decoded.getpixel((65, 30))
                self.assertTrue(all(abs(a - b) < 8 for a, b in zip(actual, expected)))
        # Exporting never changes the stored original or its database filename.
        file.reload()
        self.assertTrue(file.name.endswith("." + format.lower()))
        with file.download_real_file() as stream:
            self.assertEqual(original, stream.read())

    def test_webp_exports_real_jpeg_and_matching_translation(self):
        self.assert_jpeg_export("WEBP")

    def test_avif_exports_real_jpeg_and_matching_translation(self):
        self.assert_jpeg_export("AVIF")

    def assert_collision_export(self, include_avif=False):
        originals = {}
        for name, color in (("page.jpg", (100, 0, 0)), ("page (2).jpg", (0, 100, 0))):
            file, payload = self.upload_image(name, "JPEG", color=color)
            originals[name] = payload
        formats = ["WEBP", "AVIF"] if include_avif else ["WEBP"]
        for index, format in enumerate(formats):
            file, _ = self.upload_image(
                "page." + format.lower(), format, color=(0, 0, 100 + index * 50)
            )
            file.create_source("source").create_translation(
                "translated " + format, self.target, self.user
            )
        with ZipFile(io.BytesIO(self.export())) as archive:
            image_names = [name for name in archive.namelist() if name.startswith("images/")]
            self.assertEqual(len(originals) + len(formats), len(image_names))
            self.assertEqual(len(image_names), len({name.casefold() for name in image_names}))
            text = archive.read("translations.txt").decode("utf-8")
            references = re.findall(r">>>>>>>>\[(.*?)\]<<<<<<<<", text)
            self.assertCountEqual(image_names, ["images/" + ref for ref in references])
            for name, payload in originals.items():
                self.assertEqual(payload, archive.read("images/" + name))
            for name in image_names:
                self.assertTrue(name.endswith(".jpg"))
                with Image.open(io.BytesIO(archive.read(name))) as decoded:
                    decoded.load()
                    self.assertEqual("JPEG", decoded.format)
            for format in formats:
                self.assertIn("translated " + format, text)

    def test_webp_export_avoids_existing_jpeg_names(self):
        self.assert_collision_export()

    def test_avif_webp_export_avoids_same_stem_collisions(self):
        self.assert_collision_export(include_avif=True)

    def test_legacy_formats_export_bytes_unchanged(self):
        originals = {}
        for name, format in (("page.jpg", "JPEG"), ("page.png", "PNG"), ("page.gif", "GIF")):
            _, originals[name] = self.upload_image(name, format)
        with ZipFile(io.BytesIO(self.export())) as archive:
            text = archive.read("translations.txt").decode("utf-8")
            for name, payload in originals.items():
                self.assertEqual(payload, archive.read("images/" + name))
                self.assertIn("[" + name + "]", text)

    def test_nested_webp_export_paths_match_translation(self):
        folder = self.project.create_folder("chapter")
        file, _ = self.upload_image("page.webp", "WEBP", parent=folder)
        self.upload_image("page.png", "PNG")
        with ZipFile(io.BytesIO(self.export(file_ids_include=[str(file.id)]))) as archive:
            self.assertIn("images/chapter/page.jpg", archive.namelist())
            self.assertNotIn("images/page.png", archive.namelist())
            text = archive.read("translations.txt").decode("utf-8")
            self.assertIn("[chapter/page.jpg]", text)
            self.assertNotIn("[page.png]", text)

    def test_text_only_export_keeps_original_webp_filename(self):
        self.upload_image("page.webp", "WEBP")
        text = self.export(OutputTypes.ONLY_TEXT).decode("utf-8")
        self.assertIn("[page.webp]", text)
        self.assertNotIn("[page.jpg]", text)

    def assert_remote_previews(self, format):
        file, payload = self.upload_image("page." + format.lower(), format)
        for storage_type in (StorageType.R2, StorageType.REMOTE_HTTP):
            uploaded = {}

            def capture_upload(prefix, name, stream, **kwargs):
                uploaded[name] = stream.read()
                return None, None

            # Only the transport is mocked; the real codec produces preview bytes.
            with (
                patch.dict(celery.conf.app_config, {"STORAGE_TYPE": storage_type}),
                patch.object(oss, "init"),
                patch.object(oss, "download", return_value=io.BytesIO(payload)),
                patch.object(oss, "upload", side_effect=capture_upload),
            ):
                result = create_thumbnail_task(str(file.id))
            self.assertTrue(result.startswith("成功"), result)
            self.assertEqual(2, len(uploaded))
            for name, preview in uploaded.items():
                self.assertTrue(name.endswith("." + format.lower()))
                with Image.open(io.BytesIO(preview)) as decoded:
                    decoded.load()
                    self.assertEqual(format, decoded.format)
                    expected_size = (180, 140) if name.startswith("cover-") else (80, 60)
                    self.assertEqual(expected_size, decoded.size)

    def test_webp_remote_previews_have_matching_codec(self):
        self.assert_remote_previews("WEBP")

    def test_avif_remote_previews_have_matching_codec(self):
        self.assert_remote_previews("AVIF")
