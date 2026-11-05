"""Public, same-origin downloads and administrator-only script updates."""

from functools import wraps

from flask import send_file

from app.core.views import MoeAPIView
from app.decorators.auth import admin_required
from app.exceptions import NoPermissionError
from app.services import ps_scripts


def script_admin_required(method):
    """Use existing authentication, with HTTP 403 for these new admin routes."""
    authorized = admin_required(method)

    @wraps(method)
    def wrapper(*args, **kwargs):
        try:
            return authorized(*args, **kwargs)
        except NoPermissionError as exc:
            exc.status_code = 403
            raise

    return wrapper


class PSScriptDownloadAPI(MoeAPIView):
    def get(self, kind):
        try:
            path, metadata = ps_scripts.get_script(kind)
        except FileNotFoundError:
            return {"message": "脚本不存在 / Script not found"}, 404, {"Cache-Control": "no-store"}
        response = send_file(
            path, as_attachment=True, download_name=metadata["filename"],
            mimetype="application/x-7z-compressed" if kind == "labelplus" else "application/zip",
            conditional=False, etag=False,
        )
        response.headers["Cache-Control"] = "no-store"
        return response


class AdminPSScriptsAPI(MoeAPIView):
    @script_admin_required
    def get(self):
        return ps_scripts.get_scripts(), 200, {"Cache-Control": "no-store"}


class AdminLabelPlusUpdateAPI(MoeAPIView):
    @script_admin_required
    def post(self):
        try:
            return ps_scripts.update_labelplus(), 200, {"Cache-Control": "no-store"}
        except ps_scripts.PSScriptUpdateError as exc:
            return {"code": exc.status_code, "message": str(exc)}, exc.status_code
