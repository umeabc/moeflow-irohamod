"""Bundled PS scripts and the fixed LabelPlus GitHub release updater.

Runtime releases live on the persistent storage volume. A single atomic metadata
replacement selects an immutable, content-addressed archive, so readers never
observe a new version with an incomplete file.
"""

import hashlib
import json
import logging
import os
from pathlib import Path
import re
import tempfile
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from urllib.parse import urljoin, urlsplit

import requests

from app import APP_PATH, STORAGE_PATH


logger = logging.getLogger(__name__)
BUILTIN_PS_SCRIPTS_DIR = Path(APP_PATH) / "static" / "ps-scripts"
RUNTIME_PS_SCRIPTS_DIR = Path(STORAGE_PATH) / "static" / "ps-scripts"
LABELPLUS_METADATA_NAME = "labelplus.json"
LABELPLUS_RELEASE_URL = "https://api.github.com/repos/LabelPlus/PS-Script/releases/latest"
GITHUB_ALLOWED_HOSTS = frozenset({
    "api.github.com", "github.com", "release-assets.githubusercontent.com",
    "objects.githubusercontent.com", "github-releases.githubusercontent.com",
})
DOWNLOAD_TIMEOUT = (10, 60)
MAX_ARCHIVE_BYTES = 50 * 1024 * 1024
MAX_RELEASE_BYTES = 1024 * 1024
MAX_REDIRECTS = 5
SEVEN_Z_MAGIC = b"7z\xbc\xaf\x27\x1c"
_update_lock = threading.Lock()

BUILTIN_SCRIPTS = {
    "labelplus": {
        "version": "1.8.0",
        "filename": "LabelPlus_PS-Script_1.8.0.7z",
        "size": 94536,
        "sha256": "8259a1cb188ee7f6428ce875975acfc60e79ccc7a9f4504322435f2cf683b1f9",
    },
    "llm": {
        "version": "6.5.1",
        "filename": "photoshop-doubao-v6.5.1.zip",
        "size": 1623369,
        "sha256": "110b08204d137f68f5ee10f1455d026312972147c220c546e18776e93f9504f2",
    },
}


class PSScriptUpdateError(Exception):
    def __init__(self, message, status_code=422):
        super().__init__(message)
        self.status_code = status_code


def _safe_filename(value):
    return (
        isinstance(value, str) and 0 < len(value) <= 200
        and value.lower().endswith(".7z") and not value.startswith(".")
        and not any(char in value for char in '/\\:*?"<>|')
        and all(ord(char) >= 32 and ord(char) != 127 for char in value)
    )


def _runtime_archive(metadata):
    # Only the validated hexadecimal digest influences the filesystem path.
    return RUNTIME_PS_SCRIPTS_DIR / ("labelplus-" + metadata["sha256"] + ".7z")


def _runtime_metadata():
    try:
        metadata_path = RUNTIME_PS_SCRIPTS_DIR / LABELPLUS_METADATA_NAME
        if metadata_path.stat().st_size > 16384:
            return None
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        if not isinstance(metadata, dict):
            return None
        if not (
            isinstance(metadata.get("version"), str) and metadata["version"]
            and _safe_filename(metadata.get("filename"))
            and isinstance(metadata.get("sha256"), str)
            and re.fullmatch(r"[0-9a-f]{64}", metadata["sha256"])
            and type(metadata.get("size")) is int
            and len(SEVEN_Z_MAGIC) <= metadata["size"] <= MAX_ARCHIVE_BYTES
            and isinstance(metadata.get("updated_at"), str)
        ):
            return None
        archive = _runtime_archive(metadata)
        if archive.is_symlink() or not archive.is_file():
            return None
        if archive.stat().st_size != metadata["size"]:
            return None
        with archive.open("rb") as handle:
            if handle.read(len(SEVEN_Z_MAGIC)) != SEVEN_Z_MAGIC:
                return None
        # Whitelist fields: neither metadata nor API responses expose local paths.
        return {key: metadata[key] for key in (
            "version", "filename", "size", "sha256", "updated_at",
        )}
    except (OSError, ValueError, TypeError):
        return None


def get_script(kind):
    """Return (download path, public metadata), falling back to bundled files."""
    if kind not in BUILTIN_SCRIPTS:
        raise FileNotFoundError(kind)
    metadata = _runtime_metadata() if kind == "labelplus" else None
    if metadata:
        path = _runtime_archive(metadata)
        source = "updated"
    else:
        metadata = {**BUILTIN_SCRIPTS[kind], "updated_at": None}
        path = BUILTIN_PS_SCRIPTS_DIR / metadata["filename"]
        source = "builtin"
    if not path.is_file():
        raise FileNotFoundError(kind)
    return path, {
        **metadata, "source": source,
        "download_url": f"/api/v1/site/ps-scripts/{kind}",
    }


def get_scripts():
    return {kind: get_script(kind)[1] for kind in BUILTIN_SCRIPTS}


def _validate_url(url):
    if not isinstance(url, str):
        raise PSScriptUpdateError("已阻止不可信的下载地址 / Untrusted download URL blocked")
    try:
        parsed = urlsplit(url)
        valid = (
            parsed.scheme == "https" and parsed.hostname in GITHUB_ALLOWED_HOSTS
            and parsed.port in (None, 443) and not parsed.username
            and not parsed.password and not parsed.fragment
            and "\\" not in url and not any(ord(c) < 32 for c in url)
        )
    except (ValueError, TypeError):
        valid = False
    if not valid:
        raise PSScriptUpdateError("已阻止不可信的下载地址 / Untrusted download URL blocked")


def _get_response(session, url, accept):
    """Validate the initial URL and every redirect before any outbound request."""
    for _ in range(MAX_REDIRECTS + 1):
        _validate_url(url)
        response = session.get(
            url, headers={
                "User-Agent": "MoeFlow-PS-Scripts-Updater", "Accept": accept,
                "Accept-Encoding": "identity",
            },
            timeout=DOWNLOAD_TIMEOUT, allow_redirects=False, stream=True,
        )
        if response.status_code in (301, 302, 303, 307, 308):
            location = response.headers.get("Location")
            response.close()
            if not location:
                raise PSScriptUpdateError("下载重定向无效 / Invalid download redirect")
            try:
                url = urljoin(url, location)
            except (TypeError, ValueError) as exc:
                raise PSScriptUpdateError("下载重定向无效 / Invalid download redirect") from exc
            continue
        if response.status_code in (403, 429):
            response.close()
            raise PSScriptUpdateError(
                "GitHub 拒绝请求或请求次数已达上限，请稍后重试 / "
                "GitHub denied the request or rate limit exceeded; retry later", 429,
            )
        if response.status_code != 200:
            response.close()
            raise PSScriptUpdateError(
                f"GitHub 请求失败 (HTTP {response.status_code}) / GitHub request failed"
            )
        return response
    raise PSScriptUpdateError("下载重定向次数过多 / Too many download redirects")


def _chunks(response, limit):
    length = response.headers.get("Content-Length")
    if length is not None:
        try:
            if int(length) < 0 or int(length) > limit:
                raise PSScriptUpdateError("下载文件超过大小限制 / Download exceeds size limit")
        except ValueError as exc:
            raise PSScriptUpdateError("下载长度无效 / Invalid download length") from exc
    size = 0
    for chunk in response.iter_content(chunk_size=64 * 1024):
        if not chunk:
            continue
        size += len(chunk)
        if size > limit:
            raise PSScriptUpdateError("下载文件超过大小限制 / Download exceeds size limit")
        yield chunk
    # requests transparently decodes compressed responses; Content-Length then
    # describes wire bytes, while the limit above always bounds decoded bytes.
    encoding = response.headers.get("Content-Encoding", "identity").lower()
    if length is not None and encoding == "identity" and size != int(length):
        raise PSScriptUpdateError("下载不完整 / Incomplete download")


def _release_asset(session):
    response = _get_response(session, LABELPLUS_RELEASE_URL, "application/vnd.github+json")
    try:
        release = json.loads(b"".join(_chunks(response, MAX_RELEASE_BYTES)))
    except (ValueError, UnicodeError) as exc:
        raise PSScriptUpdateError("GitHub 版本信息无效 / Invalid GitHub release metadata") from exc
    finally:
        response.close()
    if not isinstance(release, dict) or (
        release.get("draft") is not False or release.get("prerelease") is not False
    ):
        raise PSScriptUpdateError("没有可用的正式版本 / No stable release available")
    version = release.get("tag_name")
    if (
        not isinstance(version, str) or not version.strip() or len(version) > 200
        or any(ord(char) < 32 or ord(char) == 127 for char in version)
    ):
        raise PSScriptUpdateError("GitHub 版本号无效 / Invalid GitHub release version")
    assets = release.get("assets")
    if isinstance(assets, list):
        for asset in assets:
            if isinstance(asset, dict) and _safe_filename(asset.get("name")):
                _validate_url(asset.get("browser_download_url"))
                return version, asset
    raise PSScriptUpdateError("最新版本没有 7z 附件 / Latest release has no 7z asset")


def _publish(session, version, asset):
    expected = asset.get("digest")
    if expected not in (None, "") and (
        not isinstance(expected, str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", expected, re.I)
    ):
        raise PSScriptUpdateError("附件摘要格式不支持 / Unsupported asset digest format")
    RUNTIME_PS_SCRIPTS_DIR.mkdir(parents=True, exist_ok=True)
    temporary_paths = []
    response = _get_response(session, asset["browser_download_url"], "application/octet-stream")
    try:
        digest = hashlib.sha256()
        size = 0
        prefix = b""
        with tempfile.NamedTemporaryFile(
            dir=RUNTIME_PS_SCRIPTS_DIR, prefix=".labelplus-", suffix=".tmp", delete=False
        ) as handle:
            archive_temp = Path(handle.name)
            temporary_paths.append(archive_temp)
            for chunk in _chunks(response, MAX_ARCHIVE_BYTES):
                prefix = (prefix + chunk)[:len(SEVEN_Z_MAGIC)]
                handle.write(chunk)
                digest.update(chunk)
                size += len(chunk)
            handle.flush()
            os.fsync(handle.fileno())
        if prefix != SEVEN_Z_MAGIC:
            raise PSScriptUpdateError("附件不是有效的 7z 文件 / Asset is not a valid 7z archive")
        if asset.get("size") is not None and asset["size"] != size:
            raise PSScriptUpdateError("附件大小校验失败 / Asset size verification failed")
        sha256 = digest.hexdigest()
        if expected:
            if expected[7:].lower() != sha256:
                raise PSScriptUpdateError("附件 SHA-256 校验失败 / Asset SHA-256 verification failed")
        filename = asset["name"]
        # Some upstream assets use a versionless name; keep downloads identifiable.
        filename_version = re.sub(r"[^\w.-]", "-", version.lstrip("vV"))[:80] or "release"
        if filename_version not in filename:
            filename = filename[:-3][:100] + "_" + filename_version + ".7z"
        metadata = {
            "version": version, "filename": filename, "size": size,
            "sha256": sha256,
            "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        # Write both complete files before changing the pointer. Failed metadata
        # publication leaves the previous pointer and its archive untouched.
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=RUNTIME_PS_SCRIPTS_DIR,
            prefix=".labelplus-meta-", suffix=".tmp", delete=False,
        ) as handle:
            metadata_temp = Path(handle.name)
            temporary_paths.append(metadata_temp)
            json.dump(metadata, handle, ensure_ascii=False)
            handle.flush()
            os.fsync(handle.fileno())
        archive = _runtime_archive(metadata)
        os.replace(archive_temp, archive)
        os.replace(metadata_temp, RUNTIME_PS_SCRIPTS_DIR / LABELPLUS_METADATA_NAME)
        _cleanup_old_archives(archive)
        logger.info("LabelPlus updated: version=%s size=%s sha256=%s", version, size, sha256)
        return {**metadata, "source": "updated", "download_url": "/api/v1/site/ps-scripts/labelplus"}
    finally:
        response.close()
        for path in temporary_paths:
            try:
                path.unlink(missing_ok=True)
            except OSError:
                logger.warning("Could not remove temporary PS script file")


@contextmanager
def _update_file_lock():
    """Coordinate Gunicorn workers as well as threads; the OS releases on exit."""
    RUNTIME_PS_SCRIPTS_DIR.mkdir(parents=True, exist_ok=True)
    with (RUNTIME_PS_SCRIPTS_DIR / ".labelplus-update.lock").open("a+b") as handle:
        if os.name == "nt":
            import msvcrt

            if handle.tell() == 0:
                handle.write(b"\0")
                handle.flush()
            handle.seek(0)
            def lock():
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)

            def unlock():
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl

            def lock():
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)

            def unlock():
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
        try:
            lock()
        except OSError as exc:
            raise PSScriptUpdateError(
                "脚本正在更新，请稍后重试 / Script update already running", 409,
            ) from exc
        try:
            yield
        finally:
            unlock()


def _cleanup_old_archives(current_archive):
    # Called under the process lock, after committing metadata. Open downloads
    # continue on POSIX; on Windows an in-use archive is retained for next time.
    try:
        previous = [
            path for path in RUNTIME_PS_SCRIPTS_DIR.iterdir()
            if path != current_archive and re.fullmatch(r"labelplus-[0-9a-f]{64}\.7z", path.name)
            and path.is_file() and not path.is_symlink()
        ]
        previous.sort(key=lambda path: path.stat().st_mtime_ns, reverse=True)
        for path in previous[2:]:
            try:
                path.unlink()
            except OSError:
                logger.warning("Could not remove old PS script archive")
    except OSError:
        logger.warning("Could not list old PS script archives")


def update_labelplus():
    """No caller-provided repository, download URL, proxy or credentials are used."""
    if not _update_lock.acquire(blocking=False):
        raise PSScriptUpdateError("脚本正在更新，请稍后重试 / Script update already running", 409)
    try:
        with _update_file_lock(), requests.Session() as session:
            # Avoid environment proxies/netrc credentials influencing the fixed
            # trusted destination, especially during cross-host redirects.
            session.trust_env = False
            version, asset = _release_asset(session)
            current = get_script("labelplus")[1]
            if version.lstrip("vV") == current["version"].lstrip("vV"):
                return {
                    "updated": False, "message": "已是最新版本 / Already up to date",
                    "labelplus": current,
                }
            metadata = _publish(session, version, asset)
            return {
                "updated": True, "message": "LabelPlus 脚本更新成功 / LabelPlus script updated",
                "labelplus": metadata,
            }
    except requests.RequestException as exc:
        raise PSScriptUpdateError(
            "无法连接 GitHub 或下载中断，请稍后重试 / GitHub connection or download failed; retry later"
        ) from exc
    except OSError as exc:
        raise PSScriptUpdateError(
            "无法保存脚本，当前版本未更改 / Unable to save script; current version is unchanged"
        ) from exc
    finally:
        _update_lock.release()
