"""Image codecs and the JPEG conversion used by project exports."""

import logging
import mimetypes
from pathlib import PurePosixPath

from PIL import Image

try:
    from pillow_avif import AvifImagePlugin  # Registers AVIF with Pillow 9.5.

    if not AvifImagePlugin.SUPPORTED:
        raise ImportError("pillow-avif-plugin has no native AVIF codec")
except ImportError as exc:
    _AVIF_IMPORT_ERROR = exc
    logging.getLogger(__name__).warning(
        "AVIF support unavailable; install pillow-avif-plugin==1.5.5: %s", exc
    )
else:
    _AVIF_IMPORT_ERROR = None


JPEG_EXPORT_EXTENSIONS = {".webp", ".avif"}
# Windows and older system MIME databases may not know these extensions.
mimetypes.add_type("image/webp", ".webp")
mimetypes.add_type("image/avif", ".avif")


def needs_jpeg_export(filename):
    return PurePosixPath(filename).suffix.lower() in JPEG_EXPORT_EXTENSIONS


def ensure_image_codec(filename):
    """Keep other image formats usable, but fail explicitly without the AVIF codec."""
    if PurePosixPath(filename).suffix.lower() == ".avif" and _AVIF_IMPORT_ERROR:
        raise ImportError(
            "AVIF support requires pillow-avif-plugin==1.5.5"
        ) from _AVIF_IMPORT_ERROR


def to_rgb(image):
    """Flatten transparency onto white before encoding a JPEG."""
    if "A" in image.getbands() or "transparency" in image.info:
        rgba = image.convert("RGBA")
        background = Image.new("RGB", image.size, "white")
        background.paste(rgba, mask=rgba.getchannel("A"))
        return background
    return image.convert("RGB")


def convert_to_jpeg(source_path, destination_path, *, source_filename=None):
    ensure_image_codec(source_filename or source_path)
    with Image.open(source_path) as original:
        # JPEG exports contain the first frame, matching the static translation canvas.
        with to_rgb(original) as rgb:
            rgb.save(destination_path, format="JPEG", quality=95, subsampling=0)


def build_export_paths(files):
    """Give converted images paths shared by the ZIP and LabelPlus text.

    Reserve unchanged filenames first so, for example, page.jpg keeps its name
    when page.webp is also selected. Keep the legacy flat ZIP layout for other
    formats and compare without case for Windows consumers.
    """
    original_paths = {
        str(file.id): (
            PurePosixPath(*(ancestor.name for ancestor in file.ancestors), file.name)
            if needs_jpeg_export(file.name)
            else PurePosixPath(file.name)
        )
        for file in files
    }
    occupied = {
        str(path).casefold()
        for path in original_paths.values()
        if not needs_jpeg_export(path)
    }
    paths = {}
    for file in files:
        original = original_paths[str(file.id)]
        if not needs_jpeg_export(original):
            paths[str(file.id)] = str(original)
            continue
        candidate = original.with_suffix(".jpg")
        index = 2
        while str(candidate).casefold() in occupied:
            candidate = original.with_name(f"{original.stem} ({index}).jpg")
            index += 1
        occupied.add(str(candidate).casefold())
        paths[str(file.id)] = str(candidate)
    return paths
