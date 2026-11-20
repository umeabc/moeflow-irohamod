"""
对上传的文件进行预处理
"""

import datetime
import re
import uuid

import chardet
from celery.exceptions import MaxRetriesExceededError
from flask import json
from mongoengine.queryset.visitor import Q

from app import celery
from app import oss
from app.models import connect_db
from app.constants.source import SourceKind
from app.constants.file import (
    FileNotExistReason,
    FileSafeStatus,
    FileType,
    FindTermsStatus,
    ParseErrorType,
    ParseStatus,
)
from app.utils.logging import logger
from . import SyncResult


@celery.task(name="tasks.parse_text_task", time_limit=1200)
def parse_text_task(file_id, old_revision_id=None):
    """
    将文本解析成Source

    :param file_id: 传入File的Id(str or ObjectId)
    :param old_revision_id: 旧修订版Id，有的话，会将旧修订版翻译导入其中
    :return:
    """
    from app.models.file import File
    from app.models.project import Project
    from app.models.team import Team
    from app.models.user import User

    (Project, Team, User)
    # 配置
    oss_file_prefix = celery.conf.app_config["OSS_FILE_PREFIX"]
    connect_db(celery.conf.app_config)
    oss.init(celery.conf.app_config)
    # 获取旧修订版
    old_revision = None
    if old_revision_id:
        old_revision = File.objects(id=old_revision_id, type=FileType.TEXT).first()
    # 获取file
    file = File.objects(id=file_id, type=FileType.TEXT).first()
    if file is None:
        return f"跳过，文件不存在，File <{file_id}>"
    # 如果文本是成功或解析中状态则跳过
    if file.parse_status == ParseStatus.PARSE_SUCCEEDED:
        return f"跳过，文件已成功解析，File <{file_id}>"
    if file.parse_status == ParseStatus.PARSING:
        return f"跳过，文件解析中，File <{file_id}>"
    # 将所有File设置成处理中，并设置开始时间
    file.update(
        parse_status=ParseStatus.PARSING,
        parse_start_time=datetime.datetime.utcnow(),
    )
    # 下载文件，并获取内容
    text_file = oss.download(
        oss_file_prefix, file.save_name, bucket_name=file.storage_bucket or None
    )
    try:
        text = text_file.read()
    except Exception as e:
        file.update(
            parse_status=ParseStatus.PARSE_FAILED,
            inc__parse_times=1,
            parse_error_type=ParseErrorType.FILE_CAN_NOT_READ,
        )
        logger.error(e)
        return f"失败：文件损坏 (File<{file.id}>)"
        # 检测字符集
    text_charset = chardet.detect(text)["encoding"]
    try:
        text = text.decode(text_charset)
    except Exception as e:
        file.update(
            parse_status=ParseStatus.PARSE_FAILED,
            inc__parse_times=1,
            parse_error_type=ParseErrorType.TEXT_UNKNOWN_CHARSET,
        )
        logger.error(e)
        return f"失败：字符集转换失败 (File<{file.id}>)"
    lines = re.split(r"\n|\r\n|\r", text)
    # 为文件生成翻译原文
    for key, line in enumerate(lines):
        source = file.create_source(line, rank=key)
        # 如果为空内容，则不进行下步操作
        if source.blank:
            continue
        # 如果有旧修订版则将相同的翻译拷贝给新的
        if old_revision and old_revision != file:
            old_source = old_revision.sources().filter(content=line).first()
            # 如果有旧的一模一样的原文
            if old_source:
                source.copy(old_source)
        # 寻找术语并添加
        source.find_terms()
    # 将File设置成处理成功，并清理task_id/开始时间/解析次数
    file.update(
        parse_status=ParseStatus.PARSE_SUCCEEDED,
        unset__parse_times=1,
        unset__parse_task_id=1,
        unset__parse_start_time=1,
    )
    return f"成功：File<{file_id}>"


def parse_text(file_id, /, *, old_revision_id=None, run_sync=False):
    if run_sync:
        # 同步执行
        parse_text_task(file_id, old_revision_id)
        return SyncResult()
    else:
        # 异步执行
        return parse_text_task.delay(file_id, old_revision_id)


def _green_request(action, uri):
    from aliyunsdkcore import client
    from aliyunsdkcore.profile import region_provider
    from aliyunsdkcore.request import RoaRequest

    green_client = client.AcsClient(
        celery.conf.app_config["SAFE_ACCESS_KEY_ID"],
        celery.conf.app_config["SAFE_ACCESS_KEY_SECRET"],
        "cn-shanghai",
    )
    region_provider.modify_point(
        "Green", "cn-shanghai", "green.cn-shanghai.aliyuncs.com"
    )
    request = RoaRequest("Green", "2017-08-25", action, "green")
    request.set_uri_pattern(uri)
    request.set_method("POST")
    request.set_accept_format("JSON")
    return green_client, request


@celery.task(name="tasks.safe_task", bind=True, max_retries=3)
def safe_task(self, file_id, expected_save_name=None):
    """处理遗留机器检测请求，不覆盖已经重传或人工审核的图片。"""
    from app.models.file import File

    connect_db(celery.conf.app_config)
    file = File.objects(id=file_id, type=FileType.IMAGE).first()
    if (
        file is None
        or not file.save_name
        or (expected_save_name is not None and file.save_name != expected_save_name)
        or file.file_not_exist_reason == FileNotExistReason.BLOCK
        or file.safe_status not in (
            FileSafeStatus.NEED_MACHINE_CHECK,
            FileSafeStatus.QUEUING,
        )
    ):
        return f"跳过：图片已变更或不需机器检测，File <{file_id}>"
    image = File.objects(id=file.id, type=FileType.IMAGE, save_name=file.save_name)
    status = Q(safe_status=file.safe_status)
    if file.safe_status == FileSafeStatus.NEED_MACHINE_CHECK:
        status |= Q(safe_status=None)
    version = image.filter(status, file_not_exist_reason__ne=FileNotExistReason.BLOCK)
    oss_file_prefix = celery.conf.app_config["OSS_FILE_PREFIX"]
    oss.init(celery.conf.app_config)
    green_client, request = _green_request("ImageAsyncScan", "/green/image/asyncscan")
    # 异步支持多张图片，最多50张
    tasks = [
        {
            "dataId": str(uuid.uuid1()),
            "url": oss.sign_url(
                oss_file_prefix,
                file.save_name,
                bucket_name=file.storage_bucket or None,
            ),
            "time": datetime.datetime.utcnow().microsecond,
        }
    ]
    request.set_content(json.dumps({"tasks": tasks, "scenes": ["porn"]}))
    try:
        response = green_client.do_action_with_exception(request)
        data = json.loads(response)
        if data["code"] == 200:
            task_id = data["data"][0]["taskId"]
            if not version.update_one(
                safe_status=FileSafeStatus.WAIT_RESULT,
                safe_result_id=task_id,
                safe_start_time=datetime.datetime.utcnow(),
                unset__safe_task_id=1,
            ):
                return f"跳过：图片已变更，File <{file_id}>"
            waiting = image.filter(
                safe_status=FileSafeStatus.WAIT_RESULT, safe_result_id=task_id
            )
            try:
                result = safe_result_task.apply_async(
                    args=(file_id, file.save_name, task_id), countdown=120
                )
            except Exception:
                waiting.update_one(
                    safe_status=file.safe_status,
                    unset__safe_result_id=1,
                    unset__safe_start_time=1,
                )
                raise
            waiting.update_one(safe_task_id=result.task_id)
            return "成功：稍后查询结果"
        else:
            raise Exception(f"阿里云绿网code非200：{data}")
    except Exception as e:
        # 尝试重新访问
        try:
            self.retry(countdown=5, args=(file_id, file.save_name), kwargs={})
            return f"失败：重试，错误内容：({e})"
        except MaxRetriesExceededError:
            version.update_one(
                safe_status=FileSafeStatus.NEED_MACHINE_CHECK,
                unset__safe_result_id=1,
                unset__safe_start_time=1,
                unset__safe_task_id=1,
            )
            return f"失败：超过最大重试次数，错误内容：({e})"


def safe(file_id, expected_save_name=None):
    return safe_task.delay(file_id, expected_save_name)


@celery.task(name="tasks.safe_result_task", bind=True, max_retries=10)
def safe_result_task(self, file_id, expected_save_name=None, expected_result_id=None):
    """仅把遗留检测结果应用到当时排队的存储对象。"""
    from app.models.file import File

    connect_db(celery.conf.app_config)
    file = File.objects(id=file_id, type=FileType.IMAGE).first()
    if (
        file is None
        or not file.save_name
        or file.safe_status != FileSafeStatus.WAIT_RESULT
        or not file.safe_result_id
        or file.file_not_exist_reason == FileNotExistReason.BLOCK
        or (expected_save_name is not None and file.save_name != expected_save_name)
        or (expected_result_id is not None and file.safe_result_id != expected_result_id)
        # 上一版本的消息只有 file_id，校验其 Celery ID，避免认领其他检测。
        or (
            expected_save_name is None
            and self.request.id
            and file.safe_task_id != self.request.id
        )
    ):
        return f"跳过：图片或检测请求已变更，File <{file_id}>"
    version = File.objects(
        id=file.id,
        type=FileType.IMAGE,
        save_name=file.save_name,
        safe_status=FileSafeStatus.WAIT_RESULT,
        safe_result_id=file.safe_result_id,
        file_not_exist_reason__ne=FileNotExistReason.BLOCK,
    )
    oss.init(celery.conf.app_config)
    green_client, request = _green_request("ImageAsyncScanResults", "/green/image/results")
    request.set_content(json.dumps([file.safe_result_id]))
    try:
        response = green_client.do_action_with_exception(request)
        result = json.loads(response)
        if result["code"] == 200:
            task_results = result["data"]
            for task_result in task_results:
                if task_result["code"] == 200:
                    scene_results = task_result["results"]
                    for scene_result in scene_results:
                        scene = scene_result["scene"]
                        suggestion = scene_result["suggestion"]
                        if scene == "porn":
                            changes = dict(
                                unset__safe_result_id=1,
                                unset__safe_start_time=1,
                                unset__safe_task_id=1,
                            )
                            if suggestion == "pass":
                                changes["safe_status"] = FileSafeStatus.SAFE
                            elif suggestion == "block":
                                changes["safe_status"] = FileSafeStatus.BLOCK
                            else:
                                changes["safe_status"] = FileSafeStatus.NEED_HUMAN_CHECK
                            if not version.update_one(**changes):
                                return f"跳过：图片或检测请求已变更，File <{file_id}>"
                            if suggestion == "block":
                                # 先屏蔽，再删除旧存储对象；删除失败仍保留清理所需的键。
                                File._delete_stored_file(file.save_name, file.storage_bucket)
                                blocked = File.objects(
                                    id=file.id,
                                    save_name=file.save_name,
                                    safe_status=FileSafeStatus.BLOCK,
                                ).modify(
                                    new=False,
                                    set__save_name="",
                                    set__md5="",
                                    set__file_size=0,
                                    set__file_not_exist_reason=FileNotExistReason.BLOCK,
                                )
                                if blocked is not None and blocked.activated:
                                    blocked.inc_cache(
                                        "file_size", -blocked.file_size, update_self=False
                                    )
                    return f"成功：Image <{file_id}>，详细内容：{task_results}"
                else:
                    raise Exception(f"阿里云绿网内task数组code非200：{result}")
        else:
            raise Exception(f"阿里云绿网code非200：{result}")
    except Exception as e:
        logger.error(e)
        # 尝试重新访问
        try:
            self.retry(
                countdown=30,
                args=(file_id, file.save_name, file.safe_result_id),
                kwargs={},
            )
            return f"失败：重试，错误内容：{e}"
        except MaxRetriesExceededError:
            version.update_one(
                safe_status=FileSafeStatus.NEED_MACHINE_CHECK,
                unset__safe_result_id=1,
                unset__safe_start_time=1,
                unset__safe_task_id=1,
            )
            return f"失败：超过最大尝试次数，错误内容：{e}"


@celery.task(name="tasks.find_terms_task", time_limit=1200)
def find_terms_task(file_id):
    """
    为文件的source寻找术语

    :param file_id: 传入File的Id(str or ObjectId)
    :return:
    """
    from app.models.file import File
    from app.models.project import Project
    from app.models.team import Team
    from app.models.term import Term
    from app.models.user import User

    (Project, Team, Term, User)
    # 配置
    connect_db(celery.conf.app_config)
    # 获取file
    file = File.objects(id=file_id, type=FileType.TEXT).first()
    if file is None:
        return f"跳过：文件不存在，File <{file_id}>"
    # 如果术语寻找中则跳过
    if file.find_terms_status == FindTermsStatus.FINDING:
        return f"跳过：文件寻找术语中，File <{file_id}>"
    # 将所有File设置成寻找术语中，并设置开始时间
    file.update(
        find_terms_status=FindTermsStatus.FINDING,
        find_terms_start_time=datetime.datetime.utcnow(),
    )
    for source in file.sources():
        if source.kind == SourceKind.AUTHOR:
            continue
        source.find_terms()
    # 将File设置成处理成功，并清理task_id/开始时间/解析次数
    file.update(
        find_terms_status=FindTermsStatus.FINISHED,
        unset__find_terms_task_id=1,
        unset__find_terms_start_time=1,
    )
    return f"成功：File<{file_id}>"


def find_terms(file_id, /, *, run_sync=False):
    if run_sync:
        # 同步执行
        find_terms_task(file_id)
        return SyncResult()
    else:
        # 异步执行
        return find_terms_task.delay(file_id)
