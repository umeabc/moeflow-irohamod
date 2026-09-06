from flask_babel import lazy_gettext

from .base import MoeError


class NoticeRootError(MoeError):
    """
    @apiDefine NoticeRootError
    @apiError 7100 通知异常
    """

    code = 7100
    message = lazy_gettext("通知异常")


class NoticeNotExistError(NoticeRootError):
    """
    @apiDefine NoticeNotExistError
    @apiError 7101 通知不存在
    """

    code = 7101
    message = lazy_gettext("通知不存在")
