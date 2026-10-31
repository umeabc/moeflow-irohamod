from app.constants.base import IntType, StrType


class SourcePositionType(IntType):
    """原文（标记）位置类型"""

    IN = 1  # 框内标记
    OUT = 2  # 框外标记


class SourceKind(StrType):
    """原文（标记）类型"""

    TEXT = "text"  # 普通标号
    AUTHOR = "author"  # 原作者署名标号（文件级唯一）


# LabelPlus 标签分组编号（导出时写入 [x,y,group] 的第三个值）。
# 1 / 2 由 SourcePositionType 决定，作者信息固定为第 3 组。
AUTHOR_LABEL_GROUP = 3

