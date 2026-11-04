import io
import os
from zipfile import ZipFile

from app import oss
from app.constants.output import OutputTypes
from app.models.language import Language
from tests import TEST_FILE_PATH, MoeAPITestCase


class OutputAPITestCase(MoeAPITestCase):
    def test_output_project(self):
        """完整导出、包含/排除文件以及空筛选的七种原有场景。"""
        cases = (
            ("all_with_images", OutputTypes.ALL, None, (1, 2, 3)),
            ("all_text", OutputTypes.ONLY_TEXT, None, (1, 2, 3)),
            ("include_with_images", OutputTypes.ALL, "include", (1, 3)),
            ("include_text", OutputTypes.ONLY_TEXT, "include", (1, 3)),
            ("exclude_with_images", OutputTypes.ALL, "exclude", (2,)),
            ("exclude_text", OutputTypes.ONLY_TEXT, "exclude", (2,)),
            ("empty_filters", OutputTypes.ALL, "empty", (1, 2, 3)),
        )
        for name, output_type, selection, expected in cases:
            with self.subTest(case=name):
                project = self.create_project(name, target_languages=Language.by_code("en"))
                target = project.targets().first()
                token = self.get_creator(project).generate_token()
                with open(os.path.join(TEST_FILE_PATH, "2kb.png"), "rb") as file:
                    files = [project.upload(f"{i}.png", file) for i in (1, 2, 3)]
                payload = {"type": output_type}
                if selection == "empty":
                    payload.update(file_ids_include=[], file_ids_exclude=[])
                elif selection:
                    payload[f"file_ids_{selection}"] = [str(files[0].id), str(files[2].id)]
                data = self.post(
                    f"/v1/projects/{project.id}/targets/{target.id}/outputs",
                    json=payload,
                    token=token,
                )
                self.assertErrorEqual(data)
                self.assertEqual(1, project.outputs().count())
                output = project.outputs().first()
                stored = oss.download(
                    self.app.config["OSS_OUTPUT_PREFIX"] + str(output.id) + "/",
                    output.file_name,
                )
                if output_type == OutputTypes.ALL:
                    with ZipFile(io.BytesIO(stored.read())) as archive:
                        self.assertIn("translations.txt", archive.namelist())
                        for i in (1, 2, 3):
                            self.assertEqual(i in expected, f"images/{i}.png" in archive.namelist())
                        translations = archive.read("translations.txt").decode("utf-8")
                else:
                    translations = stored.read().decode("utf-8")
                for i in (1, 2, 3):
                    self.assertEqual(i in expected, f"[{i}.png]" in translations)
