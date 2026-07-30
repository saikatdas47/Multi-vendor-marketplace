"""Generates product images locally with Pillow.

Why generated rather than fetched from a stock-photo API:

- It works offline and in CI, with no key and no rate limit.
- It exercises the real pipeline — ImageField → MEDIA_ROOT → /media/ URL — which
  is the part that actually has bugs. Hot-linking a CDN tests nothing.
- Every product gets a *distinct, deterministic* image: colour and glyph derive
  from a hash of the name, so the same product always looks the same and a
  catalogue page doesn't read as one repeated grey box.

They are not photographs and don't pretend to be. The goal is a catalogue that
looks intentional in screenshots.
"""

import hashlib
import math
from io import BytesIO

from django.core.files.base import ContentFile

try:
    from PIL import Image, ImageDraw, ImageFilter, ImageFont
except ImportError:  # pragma: no cover
    Image = None


# (background, mid, ink) — mid is used for the shape, ink for text.
PALETTES = [
    ((238, 242, 255), (165, 180, 252), (49, 46, 129)),   # indigo
    ((236, 253, 245), (110, 231, 183), (6, 78, 59)),     # emerald
    ((255, 251, 235), (252, 211, 77), (120, 53, 15)),    # amber
    ((255, 241, 242), (253, 164, 175), (136, 19, 55)),   # rose
    ((240, 249, 255), (125, 211, 252), (12, 74, 110)),   # sky
    ((250, 245, 255), (216, 180, 254), (88, 28, 135)),   # purple
    ((240, 253, 250), (94, 234, 212), (19, 78, 74)),     # teal
    ((248, 250, 252), (203, 213, 225), (15, 23, 42)),    # slate
]

# Category keyword → a simple line drawing. Matching on keywords rather than
# exact names so "Gaming Laptops" and "Laptops" both resolve.
GLYPHS = {
    ("laptop", "computer", "notebook", "macbook"): "laptop",
    ("phone", "mobile", "smartphone"): "phone",
    ("audio", "headphone", "earbud", "speaker", "sound"): "headphones",
    ("camera", "photo", "lens"): "camera",
    ("watch", "wearable"): "watch",
    ("book", "fiction", "read"): "book",
    ("shoe", "footwear", "sneaker", "boot"): "shoe",
    ("shirt", "fashion", "cloth", "wear", "apparel", "men", "women"): "shirt",
    ("kitchen", "cook", "home", "living", "furniture", "decor"): "home",
    ("game", "gaming", "console", "mouse", "keyboard"): "controller",
    ("business", "tech", "technology", "office"): "box",
}


def _pick_glyph(category, name):
    haystack = f"{category} {name}".lower()
    for keywords, glyph in GLYPHS.items():
        if any(word in haystack for word in keywords):
            return glyph
    return "box"


def _font(size, bold=True):
    candidates = (
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    )
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except (OSError, AttributeError):
            continue
    return ImageFont.load_default()


def _wrap(draw, text, font, max_width, max_lines=2):
    words, lines, current = text.split(), [], ""
    for word in words:
        trial = f"{current} {word}".strip()
        if draw.textlength(trial, font=font) <= max_width:
            current = trial
        else:
            if current:
                lines.append(current)
            current = word
            if len(lines) == max_lines:
                break
    if current and len(lines) < max_lines:
        lines.append(current)
    if len(lines) == max_lines and len(words) > sum(len(l.split()) for l in lines):
        lines[-1] = lines[-1].rstrip(" .,") + "…"
    return lines


def _draw_glyph(draw, glyph, box, colour, width):
    """Simple outline drawings, scaled into `box` = (x0, y0, x1, y1)."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    cx, cy = x0 + w / 2, y0 + h / 2
    line = {"fill": colour, "width": width, "joint": "curve"}

    if glyph == "laptop":
        draw.rounded_rectangle([x0 + w * 0.12, y0 + h * 0.18, x1 - w * 0.12, y0 + h * 0.66],
                               radius=w * 0.04, outline=colour, width=width)
        draw.line([x0 + w * 0.02, y0 + h * 0.74, x1 - w * 0.02, y0 + h * 0.74], **line)
        draw.line([x0 + w * 0.12, y0 + h * 0.66, x0 + w * 0.02, y0 + h * 0.74], **line)
        draw.line([x1 - w * 0.12, y0 + h * 0.66, x1 - w * 0.02, y0 + h * 0.74], **line)

    elif glyph == "phone":
        draw.rounded_rectangle([cx - w * 0.22, y0 + h * 0.08, cx + w * 0.22, y1 - h * 0.08],
                               radius=w * 0.07, outline=colour, width=width)
        draw.line([cx - w * 0.07, y0 + h * 0.16, cx + w * 0.07, y0 + h * 0.16], **line)
        draw.ellipse([cx - w * 0.04, y1 - h * 0.2, cx + w * 0.04, y1 - h * 0.12],
                     outline=colour, width=width)

    elif glyph == "headphones":
        draw.arc([x0 + w * 0.12, y0 + h * 0.12, x1 - w * 0.12, y0 + h * 0.78],
                 start=180, end=360, fill=colour, width=width)
        draw.rounded_rectangle([x0 + w * 0.08, y0 + h * 0.44, x0 + w * 0.26, y1 - h * 0.16],
                               radius=w * 0.06, outline=colour, width=width)
        draw.rounded_rectangle([x1 - w * 0.26, y0 + h * 0.44, x1 - w * 0.08, y1 - h * 0.16],
                               radius=w * 0.06, outline=colour, width=width)

    elif glyph == "camera":
        draw.rounded_rectangle([x0 + w * 0.08, y0 + h * 0.28, x1 - w * 0.08, y1 - h * 0.18],
                               radius=w * 0.06, outline=colour, width=width)
        draw.ellipse([cx - w * 0.16, cy - h * 0.13, cx + w * 0.16, cy + h * 0.19],
                     outline=colour, width=width)
        draw.rounded_rectangle([cx - w * 0.12, y0 + h * 0.18, cx + w * 0.02, y0 + h * 0.28],
                               radius=w * 0.02, outline=colour, width=width)

    elif glyph == "watch":
        draw.rounded_rectangle([cx - w * 0.19, cy - h * 0.2, cx + w * 0.19, cy + h * 0.2],
                               radius=w * 0.06, outline=colour, width=width)
        draw.line([cx - w * 0.1, cy - h * 0.2, cx - w * 0.1, y0 + h * 0.1], **line)
        draw.line([cx + w * 0.1, cy - h * 0.2, cx + w * 0.1, y0 + h * 0.1], **line)
        draw.line([cx - w * 0.1, cy + h * 0.2, cx - w * 0.1, y1 - h * 0.1], **line)
        draw.line([cx + w * 0.1, cy + h * 0.2, cx + w * 0.1, y1 - h * 0.1], **line)
        draw.line([cx, cy, cx, cy - h * 0.1], **line)

    elif glyph == "book":
        # Open book: a spine with two rectangular pages splayed outward. Drawn
        # as straight polygons — arcs read as an hourglass at this size.
        top, bottom = y0 + h * 0.2, y1 - h * 0.16
        lift = h * 0.06
        draw.polygon(
            [(cx, top + lift), (x0 + w * 0.1, top), (x0 + w * 0.1, bottom - lift),
             (cx, bottom)],
            outline=colour,
        )
        draw.polygon(
            [(cx, top + lift), (x1 - w * 0.1, top), (x1 - w * 0.1, bottom - lift),
             (cx, bottom)],
            outline=colour,
        )
        draw.line([cx, top + lift, cx, bottom], **line)
        # A couple of text rules so it reads as pages rather than two panels.
        for offset in (0.32, 0.46):
            draw.line([x0 + w * 0.18, top + h * offset, cx - w * 0.06,
                       top + h * offset + lift * 0.5], fill=colour, width=max(1, width // 2))
            draw.line([cx + w * 0.06, top + h * offset + lift * 0.5, x1 - w * 0.18,
                       top + h * offset], fill=colour, width=max(1, width // 2))

    elif glyph == "shoe":
        draw.line([x0 + w * 0.1, y1 - h * 0.3, x0 + w * 0.1, cy], **line)
        draw.arc([x0 + w * 0.1, cy - h * 0.1, x1 - w * 0.1, y1 - h * 0.1],
                 start=0, end=180, fill=colour, width=width)
        draw.line([x0 + w * 0.1, y1 - h * 0.2, x1 - w * 0.1, y1 - h * 0.2], **line)

    elif glyph == "shirt":
        draw.polygon(
            [
                (cx - w * 0.2, y0 + h * 0.2), (cx - w * 0.06, y0 + h * 0.14),
                (cx, y0 + h * 0.22), (cx + w * 0.06, y0 + h * 0.14),
                (cx + w * 0.2, y0 + h * 0.2), (cx + w * 0.26, y0 + h * 0.42),
                (cx + w * 0.18, y0 + h * 0.44), (cx + w * 0.18, y1 - h * 0.14),
                (cx - w * 0.18, y1 - h * 0.14), (cx - w * 0.18, y0 + h * 0.44),
                (cx - w * 0.26, y0 + h * 0.42),
            ],
            outline=colour,
        )

    elif glyph == "home":
        draw.line([cx - w * 0.24, cy, cx, y0 + h * 0.16], **line)
        draw.line([cx, y0 + h * 0.16, cx + w * 0.24, cy], **line)
        draw.rounded_rectangle([cx - w * 0.18, cy, cx + w * 0.18, y1 - h * 0.16],
                               radius=w * 0.02, outline=colour, width=width)

    elif glyph == "controller":
        draw.rounded_rectangle([x0 + w * 0.06, cy - h * 0.13, x1 - w * 0.06, cy + h * 0.17],
                               radius=h * 0.14, outline=colour, width=width)
        draw.line([x0 + w * 0.2, cy, x0 + w * 0.32, cy], **line)
        draw.line([x0 + w * 0.26, cy - h * 0.06, x0 + w * 0.26, cy + h * 0.06], **line)
        draw.ellipse([x1 - w * 0.32, cy - h * 0.05, x1 - w * 0.26, cy + h * 0.01],
                     outline=colour, width=width)
        draw.ellipse([x1 - w * 0.24, cy + h * 0.02, x1 - w * 0.18, cy + h * 0.08],
                     outline=colour, width=width)

    else:  # box
        draw.polygon(
            [(cx, y0 + h * 0.14), (x1 - w * 0.12, y0 + h * 0.3),
             (x1 - w * 0.12, y1 - h * 0.22), (cx, y1 - h * 0.08),
             (x0 + w * 0.12, y1 - h * 0.22), (x0 + w * 0.12, y0 + h * 0.3)],
            outline=colour,
        )
        draw.line([x0 + w * 0.12, y0 + h * 0.3, cx, y0 + h * 0.46], **line)
        draw.line([x1 - w * 0.12, y0 + h * 0.3, cx, y0 + h * 0.46], **line)
        draw.line([cx, y0 + h * 0.46, cx, y1 - h * 0.08], **line)


def build_placeholder(text, subtitle="", category="", size=800, variant=0):
    """Returns a ContentFile PNG, or None if Pillow isn't installed."""
    if Image is None:
        return None

    # Deterministic per product, so re-running the seed doesn't reshuffle the
    # catalogue's appearance. `variant` shifts the gallery images of one product.
    seed = int(hashlib.md5(f"{text}{variant}".encode()).hexdigest(), 16)
    background, mid, ink = PALETTES[seed % len(PALETTES)]

    canvas = Image.new("RGB", (size, size), background)

    # Soft diagonal wash, drawn on its own layer then blurred — a flat fill
    # looks like a broken image, a gradient reads as a studio backdrop.
    wash = Image.new("RGB", (size, size), background)
    wash_draw = ImageDraw.Draw(wash)
    for i in range(0, size, 4):
        ratio = i / size
        wash_draw.line(
            [(0, i), (size, i - size * 0.35)],
            fill=tuple(
                int(background[c] + (mid[c] - background[c]) * ratio * 0.55)
                for c in range(3)
            ),
            width=5,
        )
    canvas = Image.blend(canvas, wash.filter(ImageFilter.GaussianBlur(size * 0.02)), 0.9)

    draw = ImageDraw.Draw(canvas)

    # Offset accent circle, rotated by the hash so products differ.
    angle = (seed % 360) * math.pi / 180
    radius = size * 0.3
    ox, oy = size / 2 + math.cos(angle) * size * 0.08, size * 0.42 + math.sin(angle) * size * 0.05
    draw.ellipse(
        [ox - radius, oy - radius, ox + radius, oy + radius],
        fill=tuple(int(mid[c] * 0.35 + background[c] * 0.65) for c in range(3)),
    )

    glyph = _pick_glyph(category, text)
    inset = size * 0.28
    _draw_glyph(
        draw,
        glyph,
        (inset, size * 0.16, size - inset, size * 0.58),
        ink,
        max(3, int(size * 0.008)),
    )

    # Caption band at the bottom keeps text off the artwork.
    band_top = int(size * 0.7)
    draw.rectangle([0, band_top, size, size], fill=background)
    draw.line([0, band_top, size, band_top], fill=mid, width=max(2, int(size * 0.004)))

    title_font = _font(int(size * 0.062))
    small_font = _font(int(size * 0.034), bold=False)

    y = band_top + size * 0.045
    for line in _wrap(draw, text, title_font, size * 0.84):
        width = draw.textlength(line, font=title_font)
        draw.text(((size - width) / 2, y), line, font=title_font, fill=ink)
        y += size * 0.072

    if subtitle:
        width = draw.textlength(subtitle, font=small_font)
        draw.text(
            ((size - width) / 2, size - size * 0.075),
            subtitle,
            font=small_font,
            fill=tuple(int(ink[c] * 0.45 + background[c] * 0.55) for c in range(3)),
        )

    buffer = BytesIO()
    canvas.save(buffer, format="JPEG", quality=88, optimize=True)
    return ContentFile(buffer.getvalue())
