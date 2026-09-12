from app.constants.base import StrType


class StorageType(StrType):
    OSS = "OSS"
    LOCAL_STORAGE = "LOCAL_STORAGE"
    R2 = "R2"  # Cloudflare R2（S3 兼容 API + 公开桶直读）
    REMOTE_HTTP = "REMOTE_HTTP"  # 轻量图片存储服务（HTTP API + 外链直读，如 imgstore）
