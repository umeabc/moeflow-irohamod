"""Deterministic HTTP doubles; PS script tests never contact GitHub."""

import hashlib
import json

from app.services import ps_scripts


ARCHIVE = ps_scripts.SEVEN_Z_MAGIC + b"test release archive"


class FakeResponse:
    def __init__(self, content=b"", status=200, headers=None, failure=None, chunks=None):
        self.content = content
        self.status_code = status
        self.headers = headers or {}
        self.failure = failure
        self.chunks = chunks
        self.closed = False

    def iter_content(self, chunk_size):
        for chunk in self.chunks if self.chunks is not None else [self.content]:
            yield chunk
        if self.failure:
            raise self.failure

    def close(self):
        self.closed = True


class FakeSession:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []
        self.trust_env = True
        self.closed = False

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.closed = True

    def get(self, url, **kwargs):
        self.calls.append((url, kwargs))
        if not self.responses:
            raise AssertionError("Unexpected HTTP request")
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


def release_response(version="v1.9.0", archive=ARCHIVE, **changes):
    asset = {
        "name": f"LabelPlus_PS-Script_{version}.7z",
        "browser_download_url": f"https://github.com/LabelPlus/PS-Script/releases/download/{version}/script.7z",
        "size": len(archive),
        "digest": "sha256:" + hashlib.sha256(archive).hexdigest(),
    }
    asset.update(changes.pop("asset_changes", {}))
    release = {"tag_name": version, "draft": False, "prerelease": False, "assets": [asset]}
    release.update(changes)
    return FakeResponse(json.dumps(release).encode())
