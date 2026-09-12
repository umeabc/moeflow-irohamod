"""
导出项目
"""

import os
from PIL import Image, ImageOps

from oss2.exceptions import NoSuchKey

from app import STORAGE_PATH, celery
from app.constants.storage import StorageType
from app.exceptions.file import FileNotExistError
from app import oss

from app.models import connect_db
from . import SyncResult
from celery.utils.log import get_task_logger

logger = get_task_logger(__name__)


@celery.task(name="tasks.create_thumbnail_task")
def create_thumbnail_task(image_id: str):
    """
    压缩整个项目

    :param project_id: 项目ID
    :return:
    """
    from app.models.file import File
    from app.models.project import Project
    from app.models.output import Output
    from app.models.team import Team
    from app.models.target import Target
    from app.models.user import User

    (File, Project, Team, Target, User, Output)

    oss_file_prefix = celery.conf.app_config["OSS_FILE_PREFIX"]
    connect_db(celery.conf.app_config)
    oss.init(celery.conf.app_config)
    storage_type = celery.conf.app_config["STORAGE_TYPE"]
    if storage_type not in (
        StorageType.LOCAL_STORAGE,
        StorageType.R2,
        StorageType.REMOTE_HTTP,
    ):
        return f"失败：创建缩略图失败，不支持的存储模式 {image_id}"
    try:
        image = File.by_id(image_id)
        image_bucket = image.storage_bucket or None
        cover_name = celery.conf.app_config["OSS_PROCESS_COVER_NAME"] + "-" + image.save_name
        safe_check_name = (
            celery.conf.app_config["OSS_PROCESS_SAFE_CHECK_NAME"] + "-" + image.save_name
        )
        if storage_type == StorageType.LOCAL_STORAGE:
            image_path = os.path.join(STORAGE_PATH, oss_file_prefix, image.save_name)
            cover_image_path = os.path.join(STORAGE_PATH, oss_file_prefix, cover_name)
            safe_check_image_path = os.path.join(
                STORAGE_PATH, oss_file_prefix, safe_check_name
            )
            original = Image.open(image_path)
            thumbnail = ImageOps.fit(original, (180, 140), Image.ANTIALIAS)
            original.close()
            thumbnail.save(cover_image_path)
            thumbnail2 = Image.open(image_path)
            thumbnail2.thumbnail((400, 500))
            thumbnail2.save(safe_check_image_path)
            thumbnail2.close()
        else:  # R2 / REMOTE_HTTP：内存生成缩略图后上传（与原文件同前缀）
            from io import BytesIO

            # 注意：不能用 oss.is_exist() 判断原图存在性——它走列表缓存（60s），
            # 批量导入时 celery 进程可能命中旧缓存（只含部分文件）而误判"原图不存在"。
            # 这里直接实时 download：成功=存在并复用为缩略图数据源，404 报未找到。
            try:
                buf = BytesIO(
                    oss.download(
                        oss_file_prefix, image.save_name, bucket_name=image_bucket
                    ).read()
                )
            except NoSuchKey:
                return f"失败：创建缩略图失败，原图文件未找到 {image_id}"
            original = Image.open(buf)

            def _to_rgb(img):
                """JPEG 不支持 RGBA/P 模式，需转为 RGB（透明区填白底）。"""
                if img.mode == "RGBA":
                    bg = Image.new("RGB", img.size, (255, 255, 255))
                    bg.paste(img, mask=img.split()[3])
                    return bg
                if img.mode not in ("RGB", "L"):
                    return img.convert("RGB")
                return img

            cover = ImageOps.fit(original, (180, 140), Image.ANTIALIAS)
            cover_buf = BytesIO()
            _to_rgb(cover).convert("RGB").save(cover_buf, format="JPEG", quality=85)
            cover_buf.seek(0)
            oss.upload(
                oss_file_prefix, cover_name, cover_buf, bucket_name=image_bucket
            )
            safe = original.copy()
            safe.thumbnail((400, 500))
            safe_buf = BytesIO()
            _to_rgb(safe).convert("RGB").save(safe_buf, format="JPEG", quality=85)
            safe_buf.seek(0)
            oss.upload(
                oss_file_prefix, safe_check_name, safe_buf, bucket_name=image_bucket
            )
            original.close()
    except FileNotExistError:
        return f"失败：创建缩略图失败，原图不存在 {image_id}"
    except Exception:
        logger.exception(Exception)
        return f"失败：创建缩略图失败 {image_id}"
    return f"成功：创建缩略图成功 {image_id}"


def create_thumbnail(image_id, /, *, run_sync=False):
    alive_workers = celery.control.ping()
    if len(alive_workers) == 0 or run_sync:
        # 同步执行
        create_thumbnail_task(image_id)
        return SyncResult()
    else:
        # 异步执行
        return create_thumbnail_task.delay(image_id)
