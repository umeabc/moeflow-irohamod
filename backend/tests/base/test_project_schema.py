from marshmallow import ValidationError

from app.exceptions import ProjectSetNotExistError
from app.models.language import Language
from app.models.project import Project
from app.models.team import Team
from app.validators.project import CreateProjectSchema, ImportProjectSchema
from tests import MoeTestCase


class ProjectSchemaTestCase(MoeTestCase):
    def test_create_and_import_keep_distinct_language_fields_and_defaults(self):
        team = Team.create("schema")
        role = Project.role_cls.by_system_code("translator")
        common = {
            "name": "project", "intro": "intro", "project_set": str(team.default_project_set.id),
            "allow_apply_type": Project.allow_apply_type_cls.TEAM_USER,
            "application_check_type": Project.application_check_type_cls.ADMIN_CHECK,
            "default_role": str(role.id), "source_language": "ja",
        }
        for schema_type, language_field, value in (
            (CreateProjectSchema, "target_languages", ["zh-CN"]),
            (ImportProjectSchema, "output_language", "zh-CN"),
        ):
            with self.subTest(schema=schema_type.__name__):
                schema = schema_type(context={"team": team})
                loaded = schema.load({**common, language_field: value})
                self.assertEqual(role, loaded["default_role"])
                self.assertEqual(team.default_project_set, loaded["project_set"])
                self.assertEqual(Language.by_code("ja"), loaded["source_language"])
                if isinstance(value, list):
                    self.assertEqual([Language.by_code("zh-CN")], list(loaded[language_field]))
                else:
                    self.assertEqual(Language.by_code("zh-CN"), loaded[language_field])
                self.assertIsNone(loaded["labelplus_txt"])
                if schema_type is CreateProjectSchema:
                    self.assertTrue(loaded["with_proofread"])
                    self.assertFalse(loaded["with_author"])
                else:
                    self.assertNotIn("with_proofread", loaded)
                    self.assertNotIn("with_author", loaded)
                with self.assertRaises(ValidationError) as error:
                    schema.load(common)
                self.assertIn(language_field, error.exception.messages)
                other_team = Team.create(schema_type.__name__)
                with self.assertRaises(ProjectSetNotExistError):
                    schema.load({**common, language_field: value,
                                 "project_set": str(other_team.default_project_set.id)})
