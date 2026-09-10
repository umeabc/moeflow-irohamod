"""
对接阿里云OSS储存服务
"""

from io import BufferedReader, BytesIO, FileIO
import os
import re
import shutil
import time
import hashlib
import logging
from typing import Union, Optional
from urllib import parse

import oss2
from oss2 import to_string
from oss2.exceptions import NoSuchKey

from app.constants.storage import StorageType

logger = logging.getLogger(__name__)


def md5sum(src):
    m = hashlib.md5()
    m.update(src)
    return m.hexdigest()


def aliyun_cdn_url_auth_c(uri, key, exp):
    """阿里云 CDN 鉴权方式 C"""
    p = re.compile("^(http://|https://)?([^/?]+)(/[^?]*)?(\\?.*)?$")
    if not p:
        return None
    m = p.match(uri)
    scheme, host, path, args = m.groups()
    if not scheme:
        scheme = "http://"
    if not path:
        path = "/"
    if not args:
        args = ""
    hexexp = "%x" % exp
    sstring = key + path + hexexp
    hashvalue = md5sum(sstring.encode("utf-8"))
    return "%s%s/%s/%s%s%s" % (scheme, host, hashvalue, hexexp, path, args)


class OSS:
    def __init__(self, config=None):
        if config:
            self.init(config)
        else:
            self.storage_type = None
            self.auth = None
            self.bucket = None
            self.oss_domain = None
            self.oss_via_cdn = None
            self.cdn_url_key = None

    def init(self, config):
        """配置初始化"""
        self.storage_type = config["STORAGE_TYPE"]
        if self.storage_type == StorageType.OSS:
            self.auth = oss2.Auth(
                config["OSS_ACCESS_KEY_ID"],
                config["OSS_ACCESS_KEY_SECRET"],
            )
            self.bucket = oss2.Bucket(
                self.auth,
                config["OSS_ENDPOINT"],
                config["OSS_BUCKET_NAME"],
            )

            self.oss_domain = config["STORAGE_DOMAIN"]
            self.oss_via_cdn = config["OSS_VIA_CDN"]
            self.cdn_url_key = config["CDN_URL_KEY_A"]
        elif self.storage_type == StorageType.R2:
            # Cloudflare R2：S3 兼容 API（AWS SigV4），用 boto3 访问
            import boto3
            import json as _json

            self.r2_cf_api_token = config.get("R2_CF_API_TOKEN", "")
            self.r2_buckets: list[dict] = []
            buckets_json = config.get("R2_BUCKETS", "") or ""
            if buckets_json.strip():
                try:
                    items = _json.loads(buckets_json)
                except Exception:  # noqa: BLE001 JSON 解析失败则回退单桶
                    items = []
                for item in items or []:
                    conf = self._make_r2_conf(
                        account_id=item.get("account_id") or "",
                        access_key_id=item.get("access_key_id") or "",
                        secret_access_key=item.get("secret_access_key") or "",
                        bucket=item.get("bucket") or "",
                        domain=item.get("domain") or "",
                        quota_gb=float(item.get("quota_gb") or 10),
                        cf_api_token=item.get("cf_api_token") or self.r2_cf_api_token,
                    )
                    if conf:
                        self.r2_buckets.append(conf)
            # 回退：单桶配置
            if not self.r2_buckets:
                conf = self._make_r2_conf(
                    account_id=config.get("R2_ACCOUNT_ID", ""),
                    access_key_id=config.get("R2_ACCESS_KEY_ID", ""),
                    secret_access_key=config.get("R2_SECRET_ACCESS_KEY", ""),
                    bucket=config.get("R2_BUCKET_NAME", ""),
                    domain=config.get("STORAGE_DOMAIN", ""),
                    quota_gb=10,
                    cf_api_token=self.r2_cf_api_token,
                )
                if conf:
                    self.r2_buckets.append(conf)
            self.oss_via_cdn = False
            self.cdn_url_key = ""
            if self.r2_buckets:
                self.oss_domain = self.r2_buckets[0]["domain"]
        else:
            from app import STORAGE_PATH

            self.oss_domain = config["STORAGE_DOMAIN"]
            self.STORAGE_PATH = STORAGE_PATH

    @staticmethod
    def _make_r2_conf(
        *,
        account_id: str,
        access_key_id: str,
        secret_access_key: str,
        bucket: str,
        domain: str,
        quota_gb: float,
        cf_api_token: str,
    ) -> Optional[dict]:
        """构造单个 R2 桶配置（含 boto3 client）。缺必要字段返回 None。"""
        import boto3

        if not (account_id and access_key_id and secret_access_key and bucket):
            return None
        client = boto3.client(
            "s3",
            endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
            region_name="auto",
        )
        return {
            "name": bucket,
            "account_id": account_id,
            "access_key_id": access_key_id,
            "secret_access_key": secret_access_key,
            "bucket": bucket,
            "domain": domain or f"https://{bucket}.r2.dev/",
            "quota_gb": quota_gb,
            "quota_bytes": quota_gb * 1024 * 1024 * 1024,
            "client": client,
            "cf_api_token": cf_api_token,
        }

    def _r2_conf_by_bucket(self, bucket_name: Optional[str] = None) -> Optional[dict]:
        """按桶名取配置；None 或空返回第一个（默认桶）。"""
        if not self.r2_buckets:
            return None
        if bucket_name:
            for b in self.r2_buckets:
                if b["bucket"] == bucket_name:
                    return b
        return self.r2_buckets[0]

    def default_bucket_name(self) -> str:
        """返回默认（第一个）桶名；非 R2 或无配置返回空串。"""
        if self.r2_buckets:
            return self.r2_buckets[0]["bucket"]
        return ""

    def select_r2_bucket(self) -> str:
        """按剩余容量选择桶（剩余最大）。单桶直接返回。"""
        if not self.r2_buckets:
            return ""
        if len(self.r2_buckets) == 1:
            return self.r2_buckets[0]["bucket"]
        best = None
        best_free = -1
        for b in self.r2_buckets:
            used = self._get_bucket_used_bytes(b)
            free = b["quota_bytes"] - used
            if free > best_free:
                best_free = free
                best = b
        return best["bucket"] if best else self.r2_buckets[0]["bucket"]

    def _get_bucket_used_bytes(self, conf: dict) -> int:
        """查询单桶已用字节数：优先 CF API，失败回退 0（无法获取时视为配额未用）。"""
        token = conf.get("cf_api_token") or ""
        if token:
            try:
                import requests as _req

                url = (
                    f"https://api.cloudflare.com/client/v4/accounts/"
                    f"{conf['account_id']}/r2/buckets/{conf['bucket']}/usage"
                )
                r = _req.get(
                    url,
                    headers={"Authorization": f"Bearer {token}"},
                    timeout=15,
                )
                if r.status_code == 200:
                    data = (r.json() or {}).get("result") or {}
                    return int(data.get("payloadSize") or 0)
            except Exception as e:  # noqa: BLE001
                logging.warning("R2 usage query failed for %s: %s", conf["bucket"], e)
        return 0

    def list_buckets_usage(self) -> list[dict]:
        """返回所有桶用量概览（admin 用）。"""
        result = []
        for b in self.r2_buckets or []:
            used = self._get_bucket_used_bytes(b)
            result.append(
                {
                    "name": b["bucket"],
                    "account_id": b["account_id"],
                    "quota_bytes": b["quota_bytes"],
                    "used_bytes": used,
                    "free_bytes": max(b["quota_bytes"] - used, 0),
                    "domain": b["domain"],
                }
            )
        return result

    def upload(
        self,
        path: str,
        filename: str,
        file: Union[str, BufferedReader, FileIO],
        headers=None,
        progress_callback=None,
        bucket_name: Optional[str] = None,
    ):
        """上传文件。

        R2 多桶模式下 bucket_name=None 时按剩余容量自动选桶；
        返回 (result, bucket)——bucket 为实际写入的桶名（供调用方记录到 File.storage_bucket）。
        OSS / LOCAL_STORAGE 返回 (result, None)。
        """
        if self.storage_type == StorageType.OSS:
            return (
                self.bucket.put_object(
                    path + filename,
                    file,
                    headers=headers,
                    progress_callback=progress_callback,
                ),
                None,
            )
        elif self.storage_type == StorageType.R2:
            conf = self._r2_conf_by_bucket(bucket_name)
            if conf is None:
                raise ValueError("R2 bucket 未配置")
            if bucket_name is None:
                # 多桶负载均衡：按剩余容量选桶
                bucket = self.select_r2_bucket()
                conf = self._r2_conf_by_bucket(bucket)
            body = file
            if isinstance(body, str):
                body = body.encode("utf-8")
            elif hasattr(body, "read") and not isinstance(body, (BufferedReader, FileIO)):
                body = body.read()
            result = conf["client"].put_object(
                Bucket=conf["bucket"],
                Key=path + filename,
                Body=body,
            )
            return result, conf["bucket"]
        else:
            folder_path = os.path.join(self.STORAGE_PATH, path)
            os.makedirs(folder_path, exist_ok=True)
            if isinstance(file, BufferedReader):
                with open(os.path.join(folder_path, filename), "wb") as saved_file:
                    saved_file.write(file.read())
            elif isinstance(file, str):
                with open(os.path.join(folder_path, filename), "w") as saved_file:
                    saved_file.write(file)
            elif hasattr(file, "save"):
                file.save(
                    os.path.join(folder_path, filename)
                )  # XXX: what's the type of file here?
            else:
                # 兼容任意可读流（如 BytesIO），读取写入
                with open(os.path.join(folder_path, filename), "wb") as saved_file:
                    saved_file.write(file.read())
        logging.debug("saved file : %s / %s", folder_path, filename)
        return None, None

    def download(self, path, filename: str, /, *, local_path=None, bucket_name: Optional[str] = None):
        """下载文件"""
        # 如果提供local_path，则下载到本地
        if self.storage_type == StorageType.OSS:
            if local_path:
                self.bucket.get_object_to_file(path + filename, local_path)
            else:
                return self.bucket.get_object(path + filename)
        elif self.storage_type == StorageType.R2:
            conf = self._r2_conf_by_bucket(bucket_name)
            if conf is None:
                raise ValueError("R2 bucket 未配置")
            if local_path:
                conf["client"].download_file(conf["bucket"], path + filename, local_path)
            else:
                obj = conf["client"].get_object(
                    Bucket=conf["bucket"], Key=path + filename
                )
                return BytesIO(obj["Body"].read())
        else:
            folder_path = os.path.join(self.STORAGE_PATH, path)
            file_path = os.path.join(folder_path, filename)
            if local_path:
                if self.is_exist(folder_path, filename):
                    shutil.copy2(file_path, local_path)
                else:
                    raise NoSuchKey(status=404, headers={}, body={}, details={})
            else:
                with open(file_path, "rb") as file:
                    return BytesIO(file.read())

    def _r2_list_keys(self, conf: dict, prefix: str) -> set:
        """列出某桶某前缀下所有对象 key（进程内缓存，TTL 60s）。

        用于替代逐文件 head_object（R2 head 单次约数百 ms，列表渲染会累加到数十秒）。
        """
        import time as _time

        cache_key = conf["bucket"] + "|" + prefix
        if not hasattr(self, "_r2_keys_cache"):
            self._r2_keys_cache = {}
        cached = self._r2_keys_cache.get(cache_key)
        now = _time.time()
        if cached and now - cached["ts"] < 60:
            return cached["keys"]
        keys: set = set()
        try:
            paginator = conf["client"].get_paginator("list_objects_v2")
            for page in paginator.paginate(Bucket=conf["bucket"], Prefix=prefix):
                for obj in page.get("Contents", []):
                    keys.add(obj["Key"])
        except Exception as e:  # noqa: BLE001 列举失败则回退（不缓存）
            logging.warning("R2 list_objects failed for %s: %s", conf["bucket"], e)
            return keys
        self._r2_keys_cache[cache_key] = {"keys": keys, "ts": now}
        return keys

    def is_exist(self, path, filename, process_name=None, bucket_name: Optional[str] = None):
        """检查文件是否存在"""
        if self.storage_type == StorageType.OSS:
            return self.bucket.object_exists(path + filename)
        elif self.storage_type == StorageType.R2:
            conf = self._r2_conf_by_bucket(bucket_name)
            if conf is None:
                return False
            key = (
                path
                + (process_name + "-" if process_name is not None else "")
                + filename
            )
            # 用前缀列举 + 内存缓存判断，避免逐文件 head_object 的网络往返
            return key in self._r2_list_keys(conf, path)
        else:
            if os.path.isabs(path):
                return os.path.isfile(
                    os.path.join(
                        path,
                        (process_name + "-" if process_name is not None else "")
                        + filename,
                    )
                )
            else:
                return os.path.isfile(
                    os.path.join(
                        self.STORAGE_PATH,
                        path,
                        (process_name + "-" if process_name is not None else "")
                        + filename,
                    )
                )

    def delete(self, path, filename: Union[str, list[str]], bucket_name: Optional[str] = None):
        """（批量）删除文件"""
        if self.storage_type == StorageType.OSS:
            # 如果给予列表，则批量删除
            if isinstance(filename, list):
                if len(filename) == 0:
                    return
                result = self.bucket.batch_delete_objects(
                    [path + name for name in filename]
                )
            else:
                result = self.bucket.delete_object(path + filename)
            return result
        elif self.storage_type == StorageType.R2:
            conf = self._r2_conf_by_bucket(bucket_name)
            if conf is None:
                return None
            if isinstance(filename, list):
                if len(filename) == 0:
                    return
                return conf["client"].delete_objects(
                    Bucket=conf["bucket"],
                    Delete={"Objects": [{"Key": path + name} for name in filename]},
                )
            return conf["client"].delete_object(
                Bucket=conf["bucket"], Key=path + filename
            )
        else:
            folder_path = os.path.join(self.STORAGE_PATH, path)
            # 如果给予列表，则批量删除
            if isinstance(filename, list):
                for name in filename:
                    if self.is_exist(folder_path, name):
                        os.remove(os.path.join(folder_path, name))
            else:
                if self.is_exist(folder_path, filename):
                    os.remove(os.path.join(folder_path, filename))

    def rmdir(self, path, bucket_name: Optional[str] = None):
        """（批量）删除文件夹，仅本地储存"""
        if self.storage_type == StorageType.R2:
            # R2 无目录概念：按前缀列出并批量删除
            conf = self._r2_conf_by_bucket(bucket_name)
            if conf is None:
                return
            try:
                paginator = conf["client"].get_paginator("list_objects_v2")
                keys = []
                for page in paginator.paginate(
                    Bucket=conf["bucket"], Prefix=path
                ):
                    for obj in page.get("Contents", []):
                        keys.append({"Key": obj["Key"]})
                if keys:
                    conf["client"].delete_objects(
                        Bucket=conf["bucket"], Delete={"Objects": keys}
                    )
            except Exception:  # noqa: BLE001 删除失败不阻断
                pass
        elif self.storage_type == StorageType.LOCAL_STORAGE:
            # 如果给予列表，则批量删除
            if isinstance(path, list):
                for p in path:
                    folder_path = os.path.join(self.STORAGE_PATH, p)
                    if os.path.isdir(folder_path) and len(os.listdir(folder_path)) == 0:
                        os.rmdir(folder_path)
            else:
                folder_path = os.path.join(self.STORAGE_PATH, path)
                if os.path.isdir(folder_path) and len(os.listdir(folder_path)) == 0:
                    os.rmdir(folder_path)

    def sign_url(self, *args, **kwargs):
        if self.storage_type == StorageType.OSS:
            if self.oss_via_cdn:
                return self._sign_cdn_url(*args, **kwargs)
            else:
                return self._sign_oss_url(*args, **kwargs)
        elif self.storage_type == StorageType.R2:
            # R2 公开桶：无需签名，直接拼 URL（与 LOCAL_STORAGE 一致）
            # 多桶时按 bucket_name 使用对应桶的公网域名
            bucket_name = kwargs.get("bucket_name")
            if bucket_name:
                conf = self._r2_conf_by_bucket(bucket_name)
                if conf:
                    kwargs["oss_domain"] = conf["domain"]
            return self._sign_local_url(*args, **kwargs)
        else:
            return self._sign_local_url(*args, **kwargs)

    def _sign_local_url(
        self,
        path,
        filename,
        expires=604800,
        oss_domain=None,
        process_name=None,
        **kwargs,
    ):
        if oss_domain is None:
            oss_domain = self.oss_domain
        return (
            oss_domain
            + path
            + (process_name + "-" if process_name is not None else "")
            + filename
        )

    def _sign_cdn_url(
        self,
        path,
        filename,
        expires=604800,
        oss_domain=None,
        process_name=None,
        **kwargs,
    ):
        """
        通过 CDN 的 URL 鉴权生成可以访问的 URL，此时 oss_domain 需要是绑定于 CDN 的域名
        """
        # 验证失效时间为1-8天，缓存失效时间为0-7天
        # 过期时间对齐到下一个expires，以使用http缓存，过期时间最长为设置的时间的两倍
        now = int(time.time())
        delta = expires - now % expires
        expires = delta + 86400  # 失效时间加一天，以免获取到url，下一秒就失效了
        # 如果没有指定oss_domain，则使用配置中的STORAGE_DOMAIN
        if oss_domain is None:
            oss_domain = self.oss_domain
        uri = oss_domain + path + parse.quote(filename)
        url = aliyun_cdn_url_auth_c(uri=uri, key=self.cdn_url_key, exp=now + expires)
        if process_name:
            url += f"?x-oss-process=style/{process_name}"
        return url

    def _sign_oss_url(
        self,
        path,
        filename,
        expires=604800,
        headers=None,
        params=None,
        method="GET",
        oss_domain=None,
        download=False,
        process_name=None,
    ):
        """
        通过 OSS 的 URL 签名生成可以访问的 URL，默认使用配置中用户自定义的 OSS 域名
        """
        # 验证失效时间为1-8天，缓存失效时间为0-7天
        # 过期时间对齐到下一个expires，以使用http缓存，过期时间最长为设置的时间的两倍
        delta = expires - int(time.time()) % expires
        expires = delta + 86400  # 失效时间加一天，以免获取到url，下一秒就失效了
        # 如果没有指定oss_domain，则使用配置中的STORAGE_DOMAIN
        if oss_domain is None:
            oss_domain = self.oss_domain
        if params is None:
            params = {}
        if download:
            params["response-content-disposition"] = "attachment"
        if process_name:
            params["x-oss-process"] = f"style/{process_name}"
        key = to_string(path + filename)
        req = oss2.http.Request(
            method, oss_domain + parse.quote(key), headers=headers, params=params
        )
        return self.bucket.auth._sign_url(req, self.bucket.bucket_name, key, expires)
