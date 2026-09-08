"""
从外部链接 / 社交媒体下载图片（供「从社交媒体获取图片」功能使用）。

- download_external: 直接下载图片 URL（可配 HTTP 代理）。
- download_twitter: 参考 https://github.com/unkmonster/tmd 的实现思路，
  用 Twitter 账号的 auth_token / ct0 cookie 请求推文页，解析其中的图片 URL 再下载。
"""
import datetime
import io
import os
import re
from typing import List, Optional, Tuple

import requests
from flask_babel import gettext

from app.exceptions import MoeError  # noqa: F401  (保留类型引用)
from app.utils.filename import EMOJI_RE
from app.utils.logging import logger

IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".webp", ".gif")
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)


class ImageDownloadError(Exception):
    """下载图片失败（message 为面向用户的提示）"""


def build_proxies(proxy: str) -> Optional[dict]:
    """把代理配置转为 requests 的 proxies；空串/None 返回 None（直连）。"""
    proxy = (proxy or "").strip()
    if not proxy:
        return None
    return {"http": proxy, "https": proxy}


def _session(proxy: Optional[dict], headers: Optional[dict] = None):
    s = requests.Session()
    s.headers.update(
        {"User-Agent": UA, **({"Accept": "text/html,application/xhtml+xml"} or {})}
    )
    if headers:
        s.headers.update(headers)
    if proxy:
        s.proxies.update(proxy)
    return s


def _guess_filename(url: str, content_type: str, fallback: str) -> str:
    """从 URL 末段 / content-type 推断文件名。"""
    base = os.path.basename(url.split("?")[0])
    name, ext = os.path.splitext(base)
    if name and ext.lower() in IMAGE_EXTENSIONS:
        return base
    # 无扩展名：按 content-type 补
    ct_ext = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
    }.get((content_type or "").split(";")[0].strip().lower())
    stem = re.sub(r"[^A-Za-z0-9_.-]+", "_", name or fallback)[:80] or fallback
    return stem + (ct_ext or ".jpg")


def download_external(
    url: str, proxy: str = "", timeout: int = 60
) -> List[Tuple[bytes, str]]:
    """下载外部图片链接，返回单元素列表 [(bytes, filename)]。"""
    url = (url or "").strip()
    if not url.lower().startswith(("http://", "https://")):
        raise ImageDownloadError(gettext("链接必须以 http/https 开头"))
    try:
        resp = requests.get(
            url,
            timeout=timeout,
            headers={"User-Agent": UA},
            proxies=build_proxies(proxy),
            stream=True,
        )
        resp.raise_for_status()
    except requests.RequestException as e:
        logger.error("download external image failed: %s", e)
        raise ImageDownloadError(gettext("下载图片失败，请检查链接是否有效"))
    content = resp.content
    if not content:
        raise ImageDownloadError(gettext("下载内容为空"))
    ctype = resp.headers.get("Content-Type", "")
    if ctype and not ctype.split(";")[0].strip().lower().startswith("image/"):
        raise ImageDownloadError(gettext("该链接不是图片"))
    filename = _guess_filename(resp.url or url, ctype, "image")
    return [(content, filename)]


# 推文地址形如 https://x.com/<user>/status/<id> 或 https://twitter.com/<user>/status/<id>
TWEET_URL_RE = re.compile(r"/(?:status|statuses)/(\d+)")

# Bluesky 贴文地址形如 https://bsky.app/profile/<handle>/post/<rkey>
BSKY_POST_URL_RE = re.compile(r"bsky\.app/profile/([^/?#]+)/post/([^/?#]+)")

# Pixiv 作品地址形如 https://www.pixiv.net/artworks/<id>（也兼容 /i/<id>）
PIXIV_ARTWORK_RE = re.compile(r"pixiv\.net/(?:artworks|i)/?(\d+)")

# 图片 URL 常见域名
_TWITTER_PIC_RE = re.compile(
    r"https?://(?:pbs\.twimg\.com|ton\.x\.com|pbs\.twimg\.com)[^\s\"'<>()\\]+"
)


def _extract_tweet_id(url: str) -> str:
    m = TWEET_URL_RE.search(url)
    if not m:
        raise ImageDownloadError(gettext("无法解析推文地址，请确认是 https://x.com/.../status/<id> 格式"))
    return m.group(1)


def _find_image_url(html: str) -> Optional[str]:
    """从推文 HTML 中解析图片 URL。"""
    # og:image / twitter:image
    for pat in (
        r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
        r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)["\']',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
    ):
        m = re.search(pat, html)
        if m:
            return m.group(1)
    # 嵌入 JSON 中的 media_url_https
    m = re.search(r'"media_url_https"\s*:\s*"([^"]+)"', html)
    if m:
        return m.group(1)
    m = _TWITTER_PIC_RE.search(html)
    if m:
        return m.group(0)
    return None


# 推文文本中不允许出现在文件名的字符（Windows 非法 + 控制/emoji 等）
_FILENAME_BAD_RE = re.compile(r'[\\/:*?"<>|\r\n\t：；（）“”‘’「」『』]+')


def _clean_tweet_text(text: str) -> str:
    """清洗推文文本：去除链接与非法字符、多余空白，用于文件名。"""
    t = (text or "").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    # 去除 URL（https://...、http://...、www.…），避免链接混入文件名
    t = re.sub(r"https?://[^\s]+", " ", t)
    t = re.sub(r"www\.[^\s]+", " ", t)
    t = _FILENAME_BAD_RE.sub(" ", t)
    t = re.sub(r"\s+", " ", t).strip(" ._")
    return t


def _parse_tweet_time(created_at: str) -> str:
    """把 tweet-result 的 created_at（如 'Mon Aug 24 09:32:00 +0000 2026'）解析为 YYYYMMDDHHMM。"""
    if not created_at:
        return ""
    for fmt in (
        "%a %b %d %H:%M:%S %z %Y",
        "%a %b %d %H:%M:%S +0000 %Y",
        "%Y-%m-%dT%H:%M:%S.%fZ",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%dT%H:%M:%S%z",  # Pixiv createDate 形如 2024-05-09T01:00:00+00:00
    ):
        try:
            dt = datetime.datetime.strptime(created_at.strip(), fmt)
            return dt.strftime("%Y%m%d%H%M")
        except ValueError:
            continue
    return ""


def _build_twitter_filename(
    text: str, created_at: str, ext: str, page: Optional[int] = None
) -> str:
    """构造入库文件名：内容前 40 字符 + '-' + 时间 + 扩展名。

    例：推文 'Just as Eve was created to be with Adam'（2026-08-24 09:32）
        -> 'Just as Eve was created to be with Adam-202608240932.jpg'
    多张图时页码追加在时间戳后：-202608240932P1.jpg、-202608240932P2.jpg ...
    """
    clean = _clean_tweet_text(text)
    if not clean:
        clean = "twitter"
    # 与普通上传一致：去掉 emoji（含零宽/变体选择符），防止残留空名
    clean = EMOJI_RE.sub("", clean).strip(" .-_") or "twitter"
    stem = clean[:40].rstrip(" .-_") or "twitter"
    ts = _parse_tweet_time(created_at)
    if ts and page:
        return f"{stem}-{ts}P{page}{ext}"
    return f"{stem}-{ts}{ext}" if ts else f"{stem}{ext}"


def download_twitter(
    tweet_url: str,
    auth_token: str,
    ct0: str,
    proxy: str = "",
    timeout: int = 60,
) -> List[Tuple[bytes, str]]:
    """用 auth_token/ct0 下载 Twitter 推文图片，返回所有图片的 (bytes, filename) 列表。"""
    tweet_url = (tweet_url or "").strip()
    tweet_id = _extract_tweet_id(tweet_url)
    if not (auth_token and ct0):
        raise ImageDownloadError(gettext("未配置 Twitter 的 auth/ct0，请在站点设置-下载图片设置中填写"))
    headers = {
        "User-Agent": UA,
        "X-Twitter-Active-Team": "x",
        "X-Twitter-Client-Language": "en",
        "Referer": "https://x.com/",
    }
    cookies = {"auth_token": auth_token, "ct0": ct0}
    proxies = build_proxies(proxy)
    try:
        with _session(proxies, headers) as s:
            s.cookies.update(cookies)
            # 用 tweet-result 接口（tmd 亦使用），无需 GraphQL query_id
            api_url = f"https://cdn.syndication.twimg.com/tweet-result?id={tweet_id}&lang=en&token=x"
            r = s.get(api_url, timeout=timeout)
            if r.ok:
                data = r.json()
                if isinstance(data, dict):
                    text = data.get("text") or ""
                    created_at = data.get("created_at") or ""
                    img_urls: List[str] = []
                    media = data.get("mediaDetails") or []
                    img_urls = [
                        m.get("media_url_https")
                        for m in media
                        if m.get("media_url_https")
                    ]
                    if not img_urls:
                        # 部分推文 mediaDetails 缺失，尝试扩展实体
                        extended = data.get("extended_entities") or {}
                        media2 = extended.get("media") or []
                        img_urls = [
                            m.get("media_url_https")
                            for m in media2
                            if m.get("media_url_https")
                        ]
                    if img_urls:
                        multi = len(img_urls) > 1
                        results = []
                        for i, img in enumerate(img_urls, 1):
                            results.append(
                                _download_twitter_pic(
                                    img,
                                    proxy,
                                    timeout,
                                    text=text,
                                    created_at=created_at,
                                    page=i if multi else None,
                                )
                            )
                        return results
            # 回退：请求推文页解析 og:image
            resp = s.get(tweet_url, timeout=timeout)
            if resp.ok:
                img = _find_image_url(resp.text)
                if img:
                    return [_download_twitter_pic(img, proxy, timeout)]
    except requests.RequestException as e:
        logger.error("download twitter image failed: %s", e)
        raise ImageDownloadError(gettext("下载推文图片失败，请检查网络/代理或 auth/ct0 是否有效"))
    raise ImageDownloadError(gettext("该推文中未找到图片"))


def _download_twitter_pic(
    img_url: str,
    proxy: str,
    timeout: int,
    text: str = "",
    created_at: str = "",
    page: Optional[int] = None,
) -> Tuple[bytes, str]:
    # 取最大尺寸（?format=...&name=orig）
    best = img_url
    if "name=" not in best:
        best = best + "?format=jpg&name=orig" if "?" not in best else best
    resp = requests.get(
        best,
        timeout=timeout,
        headers={"User-Agent": UA},
        proxies=build_proxies(proxy),
        stream=True,
    )
    resp.raise_for_status()
    content = resp.content
    if not content:
        raise ImageDownloadError(gettext("下载内容为空"))
    ctype = resp.headers.get("Content-Type", "")
    ct_ext = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
    }.get(ctype.split(";")[0].strip().lower(), ".jpg")
    # 优先用「推文内容前 40 字符 + 时间」命名
    if text:
        return content, _build_twitter_filename(text, created_at, ct_ext, page=page)
    # 回退：取 twimg 图片 id（形如 .../<id>?format=...），避免重复扩展名
    m = re.search(r"pbs\.twimg\.com/media/([^?/]+)", img_url)
    stem = m.group(1) if m else f"twitter_{os.path.basename(img_url).split('?')[0]}"
    stem = re.sub(r"[^A-Za-z0-9_.-]+", "_", stem) or "twitter"
    if os.path.splitext(stem)[1].lower() in IMAGE_EXTENSIONS:
        return content, stem
    return content, stem + ct_ext


def _download_bluesky_pic(
    img_url: str,
    proxy: str,
    timeout: int,
    text: str = "",
    created_at: str = "",
    page: Optional[int] = None,
) -> Tuple[bytes, str]:
    # Bluesky CDN 的 fullsize 已是原图，无需像 Twitter 那样追加尺寸参数
    resp = requests.get(
        img_url,
        timeout=timeout,
        headers={"User-Agent": UA},
        proxies=build_proxies(proxy),
        stream=True,
    )
    resp.raise_for_status()
    content = resp.content
    if not content:
        raise ImageDownloadError(gettext("下载内容为空"))
    ctype = resp.headers.get("Content-Type", "")
    ct_ext = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
    }.get(ctype.split(";")[0].strip().lower(), ".jpg")
    # 与 Twitter 一致：贴文内容前 40 字符 + 时间戳命名
    if text:
        return content, _build_twitter_filename(text, created_at, ct_ext, page=page)
    # 回退：取 CDN 路径末段图片 id
    m = re.search(r"plain/([^/?]+)", img_url)
    stem = m.group(1) if m else f"bluesky_{os.path.basename(img_url).split('?')[0]}"
    stem = re.sub(r"[^A-Za-z0-9_.-]+", "_", stem) or "bluesky"
    if os.path.splitext(stem)[1].lower() in IMAGE_EXTENSIONS:
        return content, stem
    return content, stem + ct_ext


def download_bluesky(
    post_url: str,
    proxy: str = "",
    timeout: int = 60,
) -> List[Tuple[bytes, str]]:
    """从 Bluesky 贴文下载图片（无需登录），返回所有图片的 (bytes, filename) 列表。

    流程：解析贴文地址 → resolveHandle 拿 DID → getPostThread 拿贴文
    → 取 view 的 fullsize 图片 URL 下载全部图片。
    """
    post_url = (post_url or "").strip()
    m = BSKY_POST_URL_RE.search(post_url)
    if not m:
        raise ImageDownloadError(
            gettext("无法解析 Bluesky 贴文地址，请确认是 https://bsky.app/profile/<用户名>/post/<id> 格式")
        )
    handle, rkey = m.group(1), m.group(2)
    proxies = build_proxies(proxy)
    try:
        with _session(proxies) as s:
            # 1. handle → DID
            hr = s.get(
                "https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle",
                params={"handle": handle},
                timeout=timeout,
            )
            hr.raise_for_status()
            did = (hr.json() or {}).get("did")
            if not did:
                raise ImageDownloadError(gettext("无法解析该 Bluesky 用户名"))
            # 2. 拿贴文详情
            uri = f"at://{did}/app.bsky.feed.post/{rkey}"
            tr = s.get(
                "https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread",
                params={"uri": uri},
                timeout=timeout,
            )
            tr.raise_for_status()
            thread = (tr.json() or {}).get("thread") or {}
            post = thread.get("post") or {}
            record = post.get("record") or {}
            text = record.get("text") or ""
            created_at = record.get("createdAt") or ""
            # 3. 图片 URL：优先 AppView 的 embed view（fullsize），其次 record 的 blob ref 拼 CDN
            img_urls: List[str] = []
            images_view = (post.get("embed") or {}).get("images") or []
            img_urls = [
                iv.get("fullsize")
                for iv in images_view
                if iv.get("fullsize")
            ]
            if not img_urls:
                images_rec = (record.get("embed") or {}).get("images") or []
                for im in images_rec:
                    cid = ((im.get("image") or {}).get("ref") or {}).get("$link")
                    if cid:
                        img_urls.append(
                            f"https://cdn.bsky.app/img/feed_fullsize/plain/{did}/{cid}"
                        )
            if not img_urls:
                raise ImageDownloadError(gettext("该贴文中未找到图片"))
            # CDN 默认可能返回 webp（系统不支持 webp 入库），用 @jpeg 强制输出 JPEG 原图
            multi = len(img_urls) > 1
            results = []
            for i, img_url in enumerate(img_urls, 1):
                if "@" not in img_url:
                    img_url = img_url + "@jpeg"
                results.append(
                    _download_bluesky_pic(
                        img_url,
                        proxy,
                        timeout,
                        text=text,
                        created_at=created_at,
                        page=i if multi else None,
                    )
                )
            return results
    except requests.RequestException as e:
        logger.error("download bluesky image failed: %s", e)
        raise ImageDownloadError(gettext("下载 Bluesky 贴文图片失败，请检查网络/代理"))


def _download_pixiv_pic(
    img_url: str,
    proxy: str,
    timeout: int,
    session: str = "",
    text: str = "",
    created_at: str = "",
    page: Optional[int] = None,
) -> Tuple[bytes, str]:
    # i.pximg.net 必须带 Referer，否则 403
    headers = {"User-Agent": UA, "Referer": "https://www.pixiv.net/"}
    cookies = {"PHPSESSID": session} if (session or "").strip() else {}
    resp = requests.get(
        img_url,
        timeout=timeout,
        headers=headers,
        cookies=cookies,
        proxies=build_proxies(proxy),
        stream=True,
    )
    resp.raise_for_status()
    content = resp.content
    if not content:
        raise ImageDownloadError(gettext("下载内容为空"))
    ctype = resp.headers.get("Content-Type", "")
    ct_ext = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
    }.get(ctype.split(";")[0].strip().lower(), ".jpg")
    # 与 Twitter/Bluesky 一致：作品标题前 40 字符 + 时间戳命名
    if text:
        return content, _build_twitter_filename(text, created_at, ct_ext, page=page)
    # 回退：取 URL 末段原始文件名（如 118567594_p0.jpg）
    stem = os.path.basename(img_url.split("?")[0])
    stem = re.sub(r"[^A-Za-z0-9_.-]+", "_", stem) or "pixiv"
    if os.path.splitext(stem)[1].lower() in IMAGE_EXTENSIONS:
        return content, stem
    return content, stem + ct_ext


def download_pixiv(
    url: str,
    session: str = "",
    proxy: str = "",
    timeout: int = 60,
) -> List[Tuple[bytes, str]]:
    """从 Pixiv 作品下载全部原图（普通作品无需登录），返回所有图片的 (bytes, filename) 列表。

    流程：解析作品 ID → ajax/illust 接口拿标题与时间 → 多页时再调 pages 接口
    拿每页原图 URL → 带 Referer 下载全部图片。
    session 为可选 PHPSESSID cookie（R18 等受限作品需要）。
    """
    url = (url or "").strip()
    m = PIXIV_ARTWORK_RE.search(url)
    illust_id = m.group(1) if m else url
    if not illust_id.isdigit():
        raise ImageDownloadError(
            gettext("无法解析 Pixiv 作品地址，请确认是 https://www.pixiv.net/artworks/<id> 格式")
        )
    proxies = build_proxies(proxy)
    headers = {
        "User-Agent": UA,
        "Referer": "https://www.pixiv.net/",
        "Accept": "application/json",
    }
    cookies = {"PHPSESSID": session} if (session or "").strip() else {}
    try:
        with _session(proxies, headers) as s:
            if cookies:
                s.cookies.update(cookies)
            r = s.get(f"https://www.pixiv.net/ajax/illust/{illust_id}", timeout=timeout)
            r.raise_for_status()
            data = r.json() or {}
            if data.get("error") or not data.get("body"):
                raise ImageDownloadError(
                    gettext("获取 Pixiv 作品信息失败（可能已删除或需要登录）")
                )
            body = data["body"]
            title = body.get("illustTitle") or ""
            created_at = body.get("createDate") or ""
            # 单页时直接用 body.urls.original；多页时调 pages 接口拿全部页面原图 URL
            urls: List[str] = []
            first = (body.get("urls") or {}).get("original")
            if first:
                urls.append(first)
            page_count = int(body.get("pageCount") or 1)
            if page_count > 1:
                pr = s.get(
                    f"https://www.pixiv.net/ajax/illust/{illust_id}/pages",
                    timeout=timeout,
                )
                if pr.ok:
                    pdata = pr.json() or {}
                    if not pdata.get("error") and pdata.get("body"):
                        pages = [
                            pg
                            for pg in pdata["body"]
                            if pg.get("urls", {}).get("original")
                        ]
                        if pages:
                            urls = [pg["urls"]["original"] for pg in pages]
            if not urls:
                raise ImageDownloadError(gettext("该作品未找到原图"))
            multi = len(urls) > 1
            results = []
            for i, img_url in enumerate(urls, 1):
                results.append(
                    _download_pixiv_pic(
                        img_url,
                        proxy,
                        timeout,
                        session,
                        text=title,
                        created_at=created_at,
                        page=i if multi else None,
                    )
                )
            return results
    except requests.RequestException as e:
        logger.error("download pixiv image failed: %s", e)
        raise ImageDownloadError(gettext("下载 Pixiv 作品图片失败，请检查网络/代理"))


def download_image(source: str, url: str, settings) -> List[Tuple[bytes, str]]:
    """统一入口：按 source 分发，settings 提供各来源凭据/代理。返回图片列表。"""
    proxy = getattr(settings, "download_proxy", "") or ""
    if source == "twitter":
        return download_twitter(
            url,
            (getattr(settings, "twitter_auth", "") or "").strip(),
            (getattr(settings, "twitter_ct0", "") or "").strip(),
            proxy,
        )
    if source == "bluesky":
        return download_bluesky(url, proxy)
    if source == "pixiv":
        return download_pixiv(
            url,
            (getattr(settings, "pixiv_session", "") or "").strip(),
            proxy,
        )
    return download_external(url, proxy)
