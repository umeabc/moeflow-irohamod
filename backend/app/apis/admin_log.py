import datetime

from bson import ObjectId
from flask_babel import gettext
from flask_apikit.utils import QueryParser

from app.core.responses import MoePagination
from app.core.views import MoeAPIView
from app.decorators.auth import admin_required
from app.models.log import ActionLog, ErrorLog
from app.validators.log import (
    ActionLogQuerySchema,
    ErrorLogQuerySchema,
    ErrorLogResolveSchema,
)


class AdminActionLogAPI(MoeAPIView):
    @admin_required
    def get(self):
        """
        @api {get} /v1/admin/logs/actions 获取用户动作日志列表
        @apiVersion 1.0.0
        @apiName getAdminActionLogAPI
        @apiGroup AdminLog
        @apiUse APIHeader
        @apiUse TokenHeader

        @apiParam {Number} [page=1] 页码
        @apiParam {Number} [limit=20] 每页数量
        @apiParam {String} [user_id] 用户ID筛选
        @apiParam {String} [action_type] 动作类型筛选
        @apiParam {String} [resource_type] 资源类型筛选
        @apiParam {Boolean} [is_admin] 是否管理员操作筛选
        @apiParam {String} [start_time] 开始时间（ISO格式）
        @apiParam {String} [end_time] 结束时间（ISO格式）

        @apiSuccessExample {json} 返回示例
        [
            {
                "id": "xxx",
                "user_name": "张三",
                "user_email": "user@example.com",
                "is_admin": true,
                "action_type": "project.create",
                "resource_type": "project",
                "resource_id": "xxx",
                "resource_name": "项目名称",
                "method": "POST",
                "path": "/api/v1/projects",
                "ip": "127.0.0.1",
                "status_code": 200,
                "create_time": "2026-09-21T10:30:00"
            }
        ]
        """
        query = self.get_query(
            {"is_admin": QueryParser.bool},
            ActionLogQuerySchema(),
        )

        db_query = {}
        if query.get("user_id"):
            db_query["user"] = ObjectId(query["user_id"])
        if query.get("user_name"):
            db_query["user_name__icontains"] = query["user_name"]
        if query.get("action_type"):
            db_query["action_type__icontains"] = query["action_type"]
        if query.get("resource_type"):
            db_query["resource_type__icontains"] = query["resource_type"]
        if query.get("is_admin") is not None:
            db_query["is_admin"] = query["is_admin"]
        if query.get("start_time"):
            db_query["create_time__gte"] = query["start_time"]
        if query.get("end_time"):
            db_query["create_time__lte"] = query["end_time"]

        p = MoePagination()
        logs = (
            ActionLog.objects(**db_query)
            .order_by("-create_time")
            .skip(p.skip)
            .limit(p.limit)
        )
        p.set_data(
            data=[log.to_api() for log in logs],
            count=ActionLog.objects(**db_query).count(),
        )
        return p


class AdminErrorLogAPI(MoeAPIView):
    @admin_required
    def get(self):
        """
        @api {get} /v1/admin/logs/errors 获取错误日志列表
        @apiVersion 1.0.0
        @apiName getAdminErrorLogAPI
        @apiGroup AdminLog
        @apiUse APIHeader
        @apiUse TokenHeader

        @apiParam {Number} [page=1] 页码
        @apiParam {Number} [limit=20] 每页数量
        @apiParam {String} [error_type] 错误类型筛选
        @apiParam {String} [error_class] 错误类名筛选
        @apiParam {Boolean} [resolved] 是否已解决筛选
        @apiParam {String} [start_time] 开始时间（ISO格式）
        @apiParam {String} [end_time] 结束时间（ISO格式）

        @apiSuccessExample {json} 返回示例
        [
            {
                "id": "xxx",
                "error_type": "exception",
                "error_class": "ValueError",
                "error_message": "ValueError: invalid value",
                "traceback": "...",
                "user_name": "张三",
                "method": "POST",
                "path": "/api/v1/projects",
                "ip": "127.0.0.1",
                "status_code": 500,
                "resolved": false,
                "create_time": "2026-09-21T10:30:00"
            }
        ]
        """
        query = self.get_query(
            {"resolved": QueryParser.bool},
            ErrorLogQuerySchema(),
        )

        db_query = {}
        if query.get("error_type"):
            db_query["error_type__icontains"] = query["error_type"]
        if query.get("error_class"):
            db_query["error_class__icontains"] = query["error_class"]
        if query.get("resolved") is not None:
            db_query["resolved"] = query["resolved"]
        if query.get("start_time"):
            db_query["create_time__gte"] = query["start_time"]
        if query.get("end_time"):
            db_query["create_time__lte"] = query["end_time"]

        p = MoePagination()
        logs = (
            ErrorLog.objects(**db_query)
            .order_by("-create_time")
            .skip(p.skip)
            .limit(p.limit)
        )
        p.set_data(
            data=[log.to_api() for log in logs],
            count=ErrorLog.objects(**db_query).count(),
        )
        return p


class AdminErrorLogDetailAPI(MoeAPIView):
    @admin_required
    def get(self, log_id):
        """
        @api {get} /v1/admin/logs/errors/:log_id 获取错误日志详情
        @apiVersion 1.0.0
        @apiName getAdminErrorLogDetailAPI
        @apiGroup AdminLog
        @apiUse APIHeader
        @apiUse TokenHeader

        @apiSuccessExample {json} 返回示例
        {
            "id": "xxx",
            "error_type": "exception",
            "error_class": "ValueError",
            "error_message": "ValueError: invalid value",
            "traceback": "...",
            "user_name": "张三",
            "method": "POST",
            "path": "/api/v1/projects",
            "ip": "127.0.0.1",
            "request_data": {"key": "value"},
            "status_code": 500,
            "resolved": false,
            "create_time": "2026-09-21T10:30:00"
        }
        """
        log = ErrorLog.objects(id=log_id).first()
        if not log:
            return {"message": gettext("错误日志不存在")}, 404
        return log.to_api()

    @admin_required
    def put(self, log_id):
        """
        @api {put} /v1/admin/logs/errors/:log_id 标记错误日志为已解决
        @apiVersion 1.0.0
        @apiName putAdminErrorLogDetailAPI
        @apiGroup AdminLog
        @apiUse APIHeader
        @apiUse TokenHeader

        @apiParam {Boolean} resolved 是否已解决
        @apiParam {String} [resolved_note] 解决备注

        @apiSuccessExample {json} 返回示例
        {
            "id": "xxx",
            "resolved": true,
            "resolved_by": "管理员",
            "resolved_time": "2026-09-21T10:35:00",
            "resolved_note": "已修复"
        }
        """
        data = self.get_json(ErrorLogResolveSchema())
        log = ErrorLog.objects(id=log_id).first()
        if not log:
            return {"message": gettext("错误日志不存在")}, 404

        log.resolved = data["resolved"]
        log.resolved_note = data.get("resolved_note") or ""
        if data["resolved"]:
            log.resolved_by = self.current_user
            log.resolved_time = datetime.datetime.utcnow()
        else:
            log.resolved_by = None
            log.resolved_time = None
        log.save()
        return log.to_api()
