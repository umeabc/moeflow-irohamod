"""
审计日志：记录用户动作与服务器错误

- log_action：视图装饰器，请求成功后写入 ActionLog
- log_error：记录 ErrorLog（供全局错误处理调用）
- log_middleware_before_request：请求前初始化 g 上的日志上下文
"""
import ipaddress
import logging
import traceback as traceback_module
from functools import wraps

from flask import g, request

logger = logging.getLogger(__name__)

# 请求体中需要脱敏的字段（不写入日志）
SENSITIVE_KEYS = {
    "password",
    "old_password",
    "new_password",
    "v_code",
    "old_email_v_code",
    "new_email_v_code",
    "captcha",
    "captcha_info",
    "app_password",
    "twitter_auth",
    "twitter_ct0",
    "pixiv_session",
}

MAX_LOGGED_STRING = 1000


def _is_private_ip(value):
    try:
        return ipaddress.ip_address(value).is_private
    except ValueError:
        return False


def _get_client_ip():
    """
    获取客户端真实 IP。

    站点可能部署在 CDN（如 Cloudflare）之后：
    - 优先使用 CDN 提供的真实 IP 头（CF-Connecting-IP / True-Client-IP）
    - 否则取 X-Forwarded-For 中第一个非内网地址
      （nginx 在 CDN 之后时，XFF 形如 "<client>, <cdn-edge>"）
    - 最后回退到 X-Real-IP / remote_addr
    """
    for header in ("CF-Connecting-IP", "True-Client-IP"):
        ip = request.headers.get(header)
        if ip:
            return ip.split(",")[0].strip()

    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        parts = [part.strip() for part in forwarded.split(",") if part.strip()]
        for part in parts:
            if not _is_private_ip(part):
                return part
        if parts:
            return parts[0]

    ip = request.headers.get("X-Real-IP") or request.remote_addr
    if ip and "," in ip:
        ip = ip.split(",")[0].strip()
    return ip


def _get_current_user():
    return g.get("current_user")


def _redact(data):
    """递归脱敏字典/列表中的敏感字段，并截断过长字符串"""
    if isinstance(data, dict):
        result = {}
        for key, value in data.items():
            if key.lower() in SENSITIVE_KEYS:
                result[key] = "***"
            else:
                result[key] = _redact(value)
        return result
    if isinstance(data, (list, tuple)):
        return [_redact(item) for item in data]
    if isinstance(data, str) and len(data) > MAX_LOGGED_STRING:
        return data[:MAX_LOGGED_STRING] + "...(truncated)"
    return data


def _extract_resource(kwargs, resource_type):
    """从视图参数中提取资源信息（通常由 @fetch_model 注入模型实例）"""
    for value in kwargs.values():
        if hasattr(value, "id") and hasattr(value, "to_api"):
            info = {
                "resource_id": str(value.id),
                "resource_type": resource_type
                or value.__class__.__name__.lower(),
                "resource_name": None,
            }
            if hasattr(value, "name"):
                info["resource_name"] = value.name
            return info
    return {
        "resource_id": None,
        "resource_type": resource_type,
        "resource_name": None,
    }


def _build_details():
    """收集 g 上的日志上下文"""
    details = {}
    for key in ("log_details",):
        value = getattr(g, key, None)
        if isinstance(value, dict):
            details.update(value)
    # 兼容视图内直接设置 resource 的情景
    resource_id = getattr(g, "log_resource_id", None)
    resource_name = getattr(g, "log_resource_name", None)
    return details, resource_id, resource_name


def _result_status(result):
    """从视图返回值推断 HTTP 状态码（(body, status) 元组形式）"""
    if (
        isinstance(result, tuple)
        and len(result) > 1
        and isinstance(result[1], int)
    ):
        return result[1]
    return 200


def log_action(action_type, resource_type=None):
    """
    记录用户动作日志的装饰器。

    用法::

        @log_action("project.create", resource_type="project")
        def post(self, team):
            ...

    视图内可通过 ``g.log_details`` 追加详情（字典）。
    """

    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            result = func(*args, **kwargs)
            try:
                from app.models.log import ActionLog

                user = _get_current_user()
                resource = _extract_resource(kwargs, resource_type)
                details, resource_id, resource_name = _build_details()

                # 登录/注册等未登录动作：记录邮箱/用户名便于追溯
                if user is None:
                    body = request.get_json(silent=True)
                    if isinstance(body, dict):
                        if body.get("email"):
                            details.setdefault("email", body["email"])
                        if body.get("name"):
                            details.setdefault("name", body["name"])

                ActionLog(
                    user=user,
                    user_name=user.name if user else None,
                    user_email=user.email if user else None,
                    is_admin=bool(user.admin) if user else False,
                    action_type=action_type,
                    resource_type=resource["resource_type"],
                    resource_id=resource_id or resource["resource_id"],
                    resource_name=resource_name or resource["resource_name"],
                    method=request.method,
                    path=request.path,
                    ip=_get_client_ip(),
                    user_agent=request.headers.get("User-Agent"),
                    details=_redact(details) or None,
                    status_code=_result_status(result),
                ).save()
            except Exception as e:
                logger.error("Failed to log action %s: %s", action_type, e)
            return result

        return wrapper

    return decorator


def log_error(error, error_type="exception", status_code=500):
    """记录服务器错误日志（Web 请求上下文）"""
    try:
        from app.models.log import ErrorLog

        user = _get_current_user()
        request_data = {}
        if request.args:
            request_data["args"] = dict(request.args)
        body = request.get_json(silent=True)
        if isinstance(body, dict) and body:
            request_data["json"] = _redact(body)
        elif request.form:
            request_data["form"] = _redact(dict(request.form))

        message = "{}: {}".format(error.__class__.__name__, error)
        trace = "".join(
            traceback_module.format_exception(
                type(error), error, error.__traceback__
            )
        )
        ErrorLog(
            error_type=error_type,
            error_class=error.__class__.__name__,
            error_message=message[:MAX_LOGGED_STRING],
            traceback=trace,
            user=user,
            user_name=user.name if user else None,
            method=request.method,
            path=request.path,
            ip=_get_client_ip(),
            user_agent=request.headers.get("User-Agent"),
            request_data=request_data or None,
            status_code=status_code,
        ).save()
    except Exception as e:
        logger.error("Failed to log error: %s", e)


def log_celery_error(task_name, task_id=None, exception=None, traceback_text=None):
    """记录 Celery 后台任务失败（无请求上下文）"""
    try:
        from app.models.log import ErrorLog

        error_name = exception.__class__.__name__ if exception else "TaskError"
        message = "{}: {}".format(error_name, exception)
        if task_id:
            message = "{} (task_id={})".format(message, task_id)

        # 信号传入的 traceback 可能是 traceback 对象，统一转为字符串
        if traceback_text is not None and not isinstance(traceback_text, str):
            try:
                traceback_text = "".join(
                    traceback_module.format_tb(traceback_text)
                )
            except Exception:  # noqa: BLE001
                traceback_text = str(traceback_text)

        ErrorLog(
            error_type="celery_task",
            error_class=error_name,
            error_message=message[:MAX_LOGGED_STRING],
            traceback=traceback_text,
            user=None,
            user_name=None,
            method="TASK",
            path="celery:{}".format(task_name),
            ip=None,
            user_agent=None,
            request_data=None,
            status_code=500,
        ).save()
    except Exception as e:
        logger.error("Failed to log celery error: %s", e)


def log_middleware_before_request():
    """请求前初始化日志上下文"""
    g.log_details = {}
    g.log_resource_id = None
    g.log_resource_name = None
