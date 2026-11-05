import hashlib
import json
import os

import pytest
import requests

from app.services import ps_scripts as service
from tests.ps_script_fakes import ARCHIVE, FakeResponse, FakeSession, release_response


@pytest.fixture(autouse=True)
def isolated_runtime(tmp_path, monkeypatch):
    monkeypatch.setattr(service, "RUNTIME_PS_SCRIPTS_DIR", tmp_path / "ps-scripts")

    def forbid_http(*args, **kwargs):
        pytest.fail("Real HTTP is forbidden in PS script tests")

    monkeypatch.setattr(requests.sessions.Session, "request", forbid_http)


def fake_http(monkeypatch, *responses):
    session = FakeSession(responses)
    monkeypatch.setattr(service.requests, "Session", lambda: session)
    return session


def install_release(monkeypatch, version="v1.9.0", archive=ARCHIVE, **changes):
    fake_http(monkeypatch, release_response(version, archive, **changes), FakeResponse(archive))
    return service.update_labelplus()


def test_bundled_archive_hashes_and_sizes():
    for kind, expected in service.BUILTIN_SCRIPTS.items():
        path, metadata = service.get_script(kind)
        content = path.read_bytes()
        assert len(content) == expected["size"]
        assert hashlib.sha256(content).hexdigest() == expected["sha256"]
        assert metadata["source"] == "builtin"
        assert metadata["updated_at"] is None


@pytest.mark.parametrize("kind", ["unknown", "../labelplus", "../../config.py", "LABELPLUS"])
def test_only_known_kinds(kind):
    with pytest.raises(FileNotFoundError):
        service.get_script(kind)


def test_success_publishes_complete_metadata_and_runtime_archive(monkeypatch):
    response = release_response()
    download = FakeResponse(chunks=[ARCHIVE[:2], b"", ARCHIVE[2:]], headers={"Content-Length": str(len(ARCHIVE))})
    session = fake_http(monkeypatch, response, download)
    result = service.update_labelplus()
    path, metadata = service.get_script("labelplus")
    assert result["updated"] is True
    assert metadata == result["labelplus"]
    assert metadata["source"] == "updated"
    assert metadata["version"] == "v1.9.0"
    assert metadata["size"] == len(ARCHIVE)
    assert metadata["sha256"] == hashlib.sha256(ARCHIVE).hexdigest()
    assert metadata["updated_at"].endswith("Z")
    assert path.read_bytes() == ARCHIVE
    persisted = json.loads((service.RUNTIME_PS_SCRIPTS_DIR / service.LABELPLUS_METADATA_NAME).read_text())
    assert set(persisted) == {"version", "filename", "size", "sha256", "updated_at"}
    assert service.get_script("llm")[1]["source"] == "builtin"
    assert session.calls[0][0] == service.LABELPLUS_RELEASE_URL
    assert session.trust_env is False
    for _, options in session.calls:
        assert options["timeout"] == (10, 60)
        assert options["allow_redirects"] is False
        assert options["stream"] is True
        assert options["headers"]["User-Agent"]
        assert options["headers"]["Accept"]
    assert response.closed and download.closed and session.closed
    assert not list(service.RUNTIME_PS_SCRIPTS_DIR.glob("*.tmp"))


@pytest.mark.parametrize("digest", [None, ""])
def test_missing_digest_still_records_computed_sha256(monkeypatch, digest):
    metadata = install_release(monkeypatch, asset_changes={"digest": digest})["labelplus"]
    assert metadata["sha256"] == hashlib.sha256(ARCHIVE).hexdigest()


def test_versionless_upstream_filename_gets_version(monkeypatch):
    result = install_release(monkeypatch, asset_changes={"name": "LabelPlus.7z"})
    assert result["labelplus"]["filename"] == "LabelPlus_1.9.0.7z"


@pytest.mark.parametrize("updated", [False, True])
def test_latest_version_skips_download(monkeypatch, updated):
    version = "v1.8.0"
    if updated:
        install_release(monkeypatch)
        version = "v1.9.0"
    session = fake_http(monkeypatch, release_response(version))
    result = service.update_labelplus()
    assert result["updated"] is False
    assert len(session.calls) == 1
    assert result["labelplus"]["source"] == ("updated" if updated else "builtin")


@pytest.mark.parametrize("changes, expected", [
    ({"draft": True}, "stable release"),
    ({"prerelease": True}, "stable release"),
    ({"assets": []}, "no 7z"),
    ({"assets": [{"name": "script.zip"}]}, "no 7z"),
    ({"asset_changes": {"name": "../script.7z"}}, "no 7z"),
    ({"tag_name": "\n"}, "version"),
    ({"tag_name": None}, "version"),
])
def test_invalid_releases_leave_builtin_available(monkeypatch, changes, expected):
    session = fake_http(monkeypatch, release_response(**changes))
    with pytest.raises(service.PSScriptUpdateError, match=expected):
        service.update_labelplus()
    assert len(session.calls) == 1
    assert service.get_script("labelplus")[1]["source"] == "builtin"


@pytest.mark.parametrize("payload", [b"not json", b"null", b"[]", b"{}"])
def test_invalid_release_json_is_readable_failure(monkeypatch, payload):
    response = FakeResponse(payload)
    fake_http(monkeypatch, response)
    with pytest.raises(service.PSScriptUpdateError):
        service.update_labelplus()
    assert response.closed


@pytest.mark.parametrize("digest", ["sha256:" + "0" * 64, "sha256:bad", "sha512:" + "0" * 128, 123])
def test_invalid_or_mismatched_digest_preserves_old_release(monkeypatch, digest):
    install_release(monkeypatch)
    old_path, old_metadata = service.get_script("labelplus")
    fake_http(monkeypatch, release_response("v2.0.0", asset_changes={"digest": digest}), FakeResponse(ARCHIVE))
    with pytest.raises(service.PSScriptUpdateError, match="digest|SHA-256"):
        service.update_labelplus()
    assert service.get_script("labelplus") == (old_path, old_metadata)
    assert old_path.read_bytes() == ARCHIVE
    assert not list(service.RUNTIME_PS_SCRIPTS_DIR.glob("*.tmp"))


@pytest.mark.parametrize("content", [b"<html>upstream error</html>", b"PK\x03\x04zip", b"7z", b""])
def test_non_7z_archive_is_rejected(monkeypatch, content):
    fake_http(monkeypatch, release_response(archive=content), FakeResponse(content))
    with pytest.raises(service.PSScriptUpdateError, match="7z archive"):
        service.update_labelplus()
    assert service.get_script("labelplus")[1]["source"] == "builtin"
    assert not (service.RUNTIME_PS_SCRIPTS_DIR / service.LABELPLUS_METADATA_NAME).exists()


def test_failed_network_keeps_previous_archive_and_metadata(monkeypatch):
    install_release(monkeypatch)
    previous = service.get_script("labelplus")
    fake_http(monkeypatch, release_response("v2.0.0"), FakeResponse(ARCHIVE[:8], failure=requests.ConnectionError("offline")))
    with pytest.raises(service.PSScriptUpdateError, match="connection or download failed"):
        service.update_labelplus()
    assert service.get_script("labelplus") == previous
    assert previous[0].read_bytes() == ARCHIVE
    assert not list(service.RUNTIME_PS_SCRIPTS_DIR.glob("*.tmp"))


def test_connect_timeout_is_readable_and_lock_is_released(monkeypatch):
    fake_http(monkeypatch, requests.Timeout("timed out"))
    with pytest.raises(service.PSScriptUpdateError, match="connection or download failed"):
        service.update_labelplus()
    assert install_release(monkeypatch)["updated"]


@pytest.mark.parametrize("status", [403, 429])
def test_github_denial_and_rate_limit_are_readable(monkeypatch, status):
    response = FakeResponse(status=status)
    fake_http(monkeypatch, response)
    with pytest.raises(service.PSScriptUpdateError, match="rate limit") as error:
        service.update_labelplus()
    assert error.value.status_code == 429
    assert response.closed


@pytest.mark.parametrize("url", [
    "http://github.com/file.7z", "https://127.0.0.1/file.7z",
    "http://169.254.169.254/latest/meta-data/", "https://evilgithub.com/file.7z",
    "https://github.com.evil.example/file.7z", "https://github.com@evil.example/file.7z",
    "https://username:password@github.com/file.7z", "https://github.com:444/file.7z",
    "file:///etc/passwd", "https://github.com\\@evil.example/file.7z",
    "https://github.com/file.7z#fragment", None, 1,
])
def test_untrusted_initial_asset_urls_are_blocked(monkeypatch, url):
    session = fake_http(monkeypatch, release_response(asset_changes={"browser_download_url": url}))
    with pytest.raises(service.PSScriptUpdateError, match="Untrusted"):
        service.update_labelplus()
    assert len(session.calls) == 1


def test_every_redirect_is_validated_before_request(monkeypatch):
    redirects = [
        FakeResponse(status=302, headers={"Location": "https://objects.githubusercontent.com/download"}),
        FakeResponse(status=307, headers={"Location": "http://127.0.0.1/private"}),
    ]
    session = fake_http(monkeypatch, release_response(), *redirects)
    with pytest.raises(service.PSScriptUpdateError, match="Untrusted"):
        service.update_labelplus()
    assert len(session.calls) == 3
    assert all(response.closed for response in redirects)


def test_allowed_cdn_redirect_download_succeeds(monkeypatch):
    redirect = FakeResponse(status=302, headers={"Location": "https://release-assets.githubusercontent.com/github-production-release-asset/file?token=example"})
    session = fake_http(monkeypatch, release_response(), redirect, FakeResponse(ARCHIVE))
    assert service.update_labelplus()["updated"]
    assert len(session.calls) == 3
    assert redirect.closed


def test_release_api_redirects_cannot_escape_allowlist(monkeypatch):
    session = fake_http(monkeypatch, FakeResponse(status=302, headers={"Location": "https://evil.example/latest"}))
    with pytest.raises(service.PSScriptUpdateError, match="Untrusted"):
        service.update_labelplus()
    assert len(session.calls) == 1


def test_gzip_release_length_is_not_compared_with_decoded_json(monkeypatch):
    response = release_response()
    response.headers = {"Content-Encoding": "gzip", "Content-Length": "20"}
    session = fake_http(monkeypatch, response, FakeResponse(ARCHIVE))
    assert service.update_labelplus()["updated"]
    assert session.calls[0][1]["headers"]["Accept-Encoding"] == "identity"


def test_redirect_loops_are_bounded(monkeypatch):
    responses = [FakeResponse(status=302, headers={"Location": "/loop"}) for _ in range(service.MAX_REDIRECTS + 1)]
    session = fake_http(monkeypatch, *responses)
    with pytest.raises(service.PSScriptUpdateError, match="Too many"):
        service.update_labelplus()
    assert len(session.calls) == service.MAX_REDIRECTS + 1
    assert all(response.closed for response in responses)


def test_malformed_redirect_is_a_controlled_error(monkeypatch):
    response = FakeResponse(status=302, headers={"Location": "https://[invalid"})
    session = fake_http(monkeypatch, response)
    with pytest.raises(service.PSScriptUpdateError, match="Invalid download redirect"):
        service.update_labelplus()
    assert len(session.calls) == 1
    assert response.closed


@pytest.mark.parametrize("headers, content", [
    ({"Content-Length": str(service.MAX_ARCHIVE_BYTES + 1)}, ARCHIVE),
    ({}, ARCHIVE + b"extra"),
])
def test_size_limit_applies_to_headers_and_stream(monkeypatch, headers, content):
    monkeypatch.setattr(service, "MAX_ARCHIVE_BYTES", len(ARCHIVE))
    fake_http(monkeypatch, release_response(archive=content), FakeResponse(content, headers=headers))
    with pytest.raises(service.PSScriptUpdateError, match="size limit"):
        service.update_labelplus()
    assert service.get_script("labelplus")[1]["source"] == "builtin"
    assert not list(service.RUNTIME_PS_SCRIPTS_DIR.glob("*.tmp"))


@pytest.mark.parametrize("headers", [{"Content-Length": "nonsense"}, {"Content-Length": str(len(ARCHIVE) + 1)}])
def test_invalid_or_incomplete_download_length(monkeypatch, headers):
    fake_http(monkeypatch, release_response(), FakeResponse(ARCHIVE, headers=headers))
    with pytest.raises(service.PSScriptUpdateError, match="length|Incomplete"):
        service.update_labelplus()


def test_release_asset_size_must_match(monkeypatch):
    fake_http(monkeypatch, release_response(asset_changes={"size": len(ARCHIVE) + 1}), FakeResponse(ARCHIVE))
    with pytest.raises(service.PSScriptUpdateError, match="size verification"):
        service.update_labelplus()


def test_metadata_publish_failure_keeps_previous_version(monkeypatch):
    install_release(monkeypatch)
    previous = service.get_script("labelplus")
    original_replace = service.os.replace

    def fail_metadata(source, destination):
        if destination.name == service.LABELPLUS_METADATA_NAME:
            raise OSError("simulated disk failure")
        return original_replace(source, destination)

    monkeypatch.setattr(service.os, "replace", fail_metadata)
    fake_http(monkeypatch, release_response("v2.0.0", ARCHIVE + b"next"), FakeResponse(ARCHIVE + b"next"))
    with pytest.raises(service.PSScriptUpdateError, match="Unable to save"):
        service.update_labelplus()
    assert service.get_script("labelplus") == previous
    assert previous[0].read_bytes() == ARCHIVE
    assert not list(service.RUNTIME_PS_SCRIPTS_DIR.glob("*.tmp"))


def test_runtime_missing_file_falls_back_to_builtin(monkeypatch):
    install_release(monkeypatch)
    service.get_script("labelplus")[0].unlink()
    assert service.get_script("labelplus")[1]["source"] == "builtin"


@pytest.mark.parametrize("changes", [{"sha256": "../../private"}, {"filename": "../private.7z"}, {"size": -1}])
def test_invalid_runtime_metadata_cannot_change_download_path(monkeypatch, changes):
    install_release(monkeypatch)
    path = service.RUNTIME_PS_SCRIPTS_DIR / service.LABELPLUS_METADATA_NAME
    metadata = json.loads(path.read_text())
    metadata.update(changes)
    path.write_text(json.dumps(metadata))
    assert service.get_script("labelplus")[1]["source"] == "builtin"


def test_retention_keeps_current_and_two_previous_archives(monkeypatch):
    paths = []
    for index in range(5):
        install_release(monkeypatch, f"v2.{index}.0", ARCHIVE + bytes([index]))
        path = service.get_script("labelplus")[0]
        os.utime(path, (1000 + index, 1000 + index))
        paths.append(path)
    assert not paths[0].exists() and not paths[1].exists()
    assert all(path.exists() for path in paths[2:])
    assert len(list(service.RUNTIME_PS_SCRIPTS_DIR.glob("*.7z"))) == 3
    assert service.get_script("labelplus")[1]["version"] == "v2.4.0"


def test_process_lock_rejects_concurrent_update_and_releases(monkeypatch):
    session = fake_http(monkeypatch, release_response(), FakeResponse(ARCHIVE))
    with service._update_file_lock():
        with pytest.raises(service.PSScriptUpdateError) as error:
            service.update_labelplus()
        assert error.value.status_code == 409
    assert not session.calls
    assert service.update_labelplus()["updated"]
