import hashlib
import tempfile
from pathlib import Path
from unittest.mock import patch

from app.exceptions import NeedTokenError, NoPermissionError
from app.services import ps_scripts as service
from tests import MoeAPITestCase
from tests.ps_script_fakes import ARCHIVE, FakeResponse, FakeSession, release_response


class PSScriptsAPITestCase(MoeAPITestCase):
    def setUp(self):
        super().setUp()
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        runtime = patch.object(service, "RUNTIME_PS_SCRIPTS_DIR", Path(temporary.name))
        runtime.start()
        self.addCleanup(runtime.stop)
        network = patch("requests.sessions.Session.request", side_effect=AssertionError("Real HTTP forbidden"))
        network.start()
        self.addCleanup(network.stop)

    def admin_token(self):
        admin = self.create_user("ps-admin")
        admin.update(admin=True)
        admin.reload()
        return admin.generate_token()

    def test_public_downloads_need_no_login_and_use_versioned_attachments(self):
        for kind in ("labelplus", "llm"):
            with self.client.get(f"/v1/site/ps-scripts/{kind}") as response:
                expected = service.BUILTIN_SCRIPTS[kind]
                self.assertEqual(response.status_code, 200)
                self.assertIn("attachment", response.headers["Content-Disposition"])
                self.assertIn(expected["filename"], response.headers["Content-Disposition"])
                self.assertEqual(response.headers["Cache-Control"], "no-store")
                self.assertEqual(hashlib.sha256(response.data).hexdigest(), expected["sha256"])
                self.assertEqual(len(response.data), expected["size"])

    def test_unknown_kinds_and_path_traversal_are_404(self):
        for path in ("unknown", "LABELPLUS", "../config.py", "%2e%2e%2fconfig.py", "..%5cconfig.py"):
            with self.client.get(f"/v1/site/ps-scripts/{path}") as response:
                self.assertEqual(response.status_code, 404)

    def test_admin_endpoints_require_admin_permissions(self):
        user = self.create_user("ps-ordinary")
        for url, method in (("/v1/admin/ps-scripts", "GET"), ("/v1/admin/ps-scripts/labelplus/update", "POST")):
            anonymous = self.open(url, method=method)
            self.assertErrorEqual(anonymous, NeedTokenError)
            response = self.open(url, method=method, token=user.generate_token())
            self.assertErrorEqual(response, NoPermissionError)
            self.assertEqual(response.status_code, 403)

    def test_admin_metadata_contains_versions_without_server_paths(self):
        response = self.get("/v1/admin/ps-scripts", token=self.admin_token())
        self.assertErrorEqual(response)
        self.assertEqual(set(response.json), {"labelplus", "llm"})
        for kind, metadata in response.json.items():
            self.assertEqual(metadata["version"], service.BUILTIN_SCRIPTS[kind]["version"])
            self.assertEqual(metadata["source"], "builtin")
            self.assertIsNone(metadata["updated_at"])
            self.assertEqual(metadata["download_url"], f"/api/v1/site/ps-scripts/{kind}")
            self.assertNotIn(str(service.RUNTIME_PS_SCRIPTS_DIR), response.get_data(as_text=True))
            self.assertNotIn(str(service.BUILTIN_PS_SCRIPTS_DIR), response.get_data(as_text=True))

    def test_update_then_runtime_download_then_missing_runtime_fallback(self):
        session = FakeSession([release_response(), FakeResponse(ARCHIVE)])
        with patch.object(service.requests, "Session", return_value=session):
            # Caller-supplied URL is deliberately ignored; only the fixed release API is used.
            response = self.post("/v1/admin/ps-scripts/labelplus/update", token=self.admin_token(),
                                 json={"url": "http://127.0.0.1/private"})
        self.assertErrorEqual(response)
        self.assertTrue(response.json["updated"])
        self.assertEqual(response.json["labelplus"]["source"], "updated")
        self.assertEqual(session.calls[0][0], service.LABELPLUS_RELEASE_URL)
        with self.client.get("/v1/site/ps-scripts/labelplus") as download:
            self.assertEqual(download.data, ARCHIVE)
            self.assertIn("v1.9.0", download.headers["Content-Disposition"])
            self.assertEqual(download.headers["Cache-Control"], "no-store")
        service.get_script("labelplus")[0].unlink()
        with self.client.get("/v1/site/ps-scripts/labelplus") as download:
            self.assertEqual(download.status_code, 200)
            self.assertEqual(len(download.data), service.BUILTIN_SCRIPTS["labelplus"]["size"])

    def test_update_latest_skips_asset_download(self):
        session = FakeSession([release_response("v1.8.0")])
        with patch.object(service.requests, "Session", return_value=session):
            response = self.post("/v1/admin/ps-scripts/labelplus/update", token=self.admin_token())
        self.assertErrorEqual(response)
        self.assertFalse(response.json["updated"])
        self.assertEqual(len(session.calls), 1)

    def test_update_failure_returns_client_readable_bilingual_message(self):
        token = self.admin_token()
        for upstream_status in (403, 429, 500):
            session = FakeSession([FakeResponse(status=upstream_status)])
            with patch.object(service.requests, "Session", return_value=session):
                response = self.post("/v1/admin/ps-scripts/labelplus/update", token=token)
            self.assertIn(response.status_code, (422, 429))
            self.assertEqual(response.json["code"], response.status_code)
            self.assertIn("GitHub", response.json["message"])
            self.assertIn(" / ", response.json["message"])
