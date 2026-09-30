from functools import wraps

from flask import g, request

from app.exceptions import NeedTokenError, UserBannedError, NoPermissionError
from app.models.user import User


def _touch_last_active(user):
    """记录用户最后一次操作时间（失败不影响鉴权流程）"""
    try:
        user.touch_last_active()
    except Exception:  # noqa: BLE001
        pass


def token_required(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        token = request.headers.get("Authorization")
        if token is None:
            raise NeedTokenError
        current_user = User.verify_token(token)
        # 检查用户状态
        if current_user.banned:
            raise UserBannedError
        # 赋值到g对象
        g.current_user = current_user
        _touch_last_active(current_user)
        return func(*args, **kwargs)

    return wrapper


def admin_required(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        token = request.headers.get("Authorization")
        if token is None:
            raise NeedTokenError
        current_user = User.verify_token(token)
        # 检查用户状态
        if not current_user.admin_can():
            raise NoPermissionError
        # 赋值到g对象
        g.current_user = current_user
        _touch_last_active(current_user)
        return func(*args, **kwargs)

    return wrapper
