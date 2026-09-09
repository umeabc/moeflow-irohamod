"""
「从 X 获取单用户所有图片」导入任务（进度跟踪）。

流程：前端发起任务后立即拿到 task_id + total，
后台线程逐张下载入库并更新 done/duplicated/finished，前端轮询进度。
"""
import datetime
from typing import Union, NoReturn

from bson import ObjectId
from mongoengine import (
    BooleanField,
    DateTimeField,
    Document,
    IntField,
    ListField,
    ObjectIdField,
    ReferenceField,
    StringField,
)


class MediaImportTask(Document):
    """一次「用户媒体图片导入」任务的状态"""

    project = ReferenceField(
        "Project", db_field="p", required=True, reverse_delete_rule="CASCADE"
    )
    task_id = StringField(db_field="tid", default="")  # 前端返回用的短 id
    # 待下载的图片 URL 列表（枚举阶段产生）
    urls = ListField(StringField(), db_field="u", default=list)
    # 每张对应的命名信息（text + created_at），与 urls 一一对应
    names = ListField(dict(), db_field="n", default=list)
    total = IntField(db_field="t", default=0)  # 枚举到的总张数
    done = IntField(db_field="d", default=0)  # 已处理张数（含成功+重复+失败）
    imported = IntField(db_field="im", default=0)  # 实际入库张数
    duplicated = IntField(db_field="dup", default=0)  # 因重复跳过张数
    failed = IntField(db_field="f", default=0)  # 下载失败张数
    # 失败明细：每项 {index, filename, step, reason}
    #   index: 在 urls 中的序号（从 1 开始）
    #   filename: 期望入库的文件名（可推断时）
    #   step: "download"（下载/取图失败）| "import"（入库失败）
    #   reason: 失败原因（后端 ImageDownloadError 消息或异常信息）
    failures = ListField(dict(), db_field="fl", default=list)
    finished = BooleanField(db_field="fin", default=False)
    error = StringField(db_field="e", default="")  # 整体失败原因（可选）
    created_at = DateTimeField(db_field="ct", default=datetime.datetime.utcnow)
    updated_at = DateTimeField(db_field="ut", default=datetime.datetime.utcnow)

    meta = {"indexes": ["task_id", "project", "created_at"]}

    @classmethod
    def by_task_id(cls, task_id: str) -> Union["MediaImportTask", None]:
        return cls.objects(task_id=task_id).first()

    def to_progress(self) -> dict:
        """轮询进度接口返回的数据"""
        return {
            "task_id": self.task_id,
            "total": self.total,
            "done": self.done,
            "imported": self.imported,
            "duplicated": self.duplicated,
            "failed": self.failed,
            "failures": self.failures,
            "finished": self.finished,
            "error": self.error,
        }
