import os
import re

# Unicode emoji 主区、修饰符、组合符、旗帜/符号区。
EMOJI_RE = re.compile(
    "["
    "\U0001F000-\U0001FAFF"
    "\U0001F300-\U0001F64F"
    "\U0001F680-\U0001F6FF"
    "☀-➿"
    "⬀-⯿"
    "️"
    "‍"
    "❤"
    "〰"
    "〽"
    "㊗"
    "㊙"
    "\U0001F1E6-\U0001F1FF"
    "←-⇿"
    "]"
)


def strip_filename_emoji(filename: str) -> str:
    """去掉上传文件名中的 emoji，保留原扩展名并防止空文件名。"""
    filename = filename or ""
    original_stem, original_ext = os.path.splitext(filename)
    clean_stem = EMOJI_RE.sub("", original_stem).strip()
    if clean_stem:
        return clean_stem + original_ext
    # 文件名仅包含 emoji 或清洗后无有效主体时，保留合理兜底。
    return "image" + original_ext
