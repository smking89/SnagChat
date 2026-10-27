"""SnagChat metadata parser.

Turns raw media into the metadata the discovery matrix queries:

* a colour signature (three strongest buckets) sampled client-side on capture,
  or read out of SVG artwork, which is what seeded/fixture snags use;
* a dominant hue and colorway name, so `GET /api/flash?hue=` can filter;
* normalised tags.

Mirrors lib/metadata.ts and components/creative.ts (samplePalette).

Usage:
    python -m services.metadata_parser --svg artwork.svg --tags "Neon, HUD"
    python -m services.metadata_parser --palette "#8b5cf6,#ff2d78,#101017"
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any, Iterable, Sequence

HEX_RE = re.compile(r"#([0-9a-fA-F]{6})\b")

COLORWAYS: tuple[tuple[str, int], ...] = (
    ("ember", 12),
    ("citrus", 44),
    ("acid", 84),
    ("mint", 150),
    ("ocean", 205),
    ("ultraviolet", 265),
    ("magenta", 320),
)


def normalize_hex(value: str) -> str | None:
    match = HEX_RE.search(value.strip())
    return f"#{match.group(1).lower()}" if match else None


def hex_to_rgb(value: str) -> tuple[int, int, int] | None:
    normalized = normalize_hex(value)
    if not normalized:
        return None
    raw = normalized[1:]
    return int(raw[0:2], 16), int(raw[2:4], 16), int(raw[4:6], 16)


def hex_to_hue(value: str) -> int | None:
    """Hue in degrees, or None for greys where hue carries no signal."""
    rgb = hex_to_rgb(value)
    if rgb is None:
        return None
    r, g, b = (component / 255 for component in rgb)
    high, low = max(r, g, b), min(r, g, b)
    delta = high - low
    if delta < 0.04:
        return None

    if high == r:
        hue = ((g - b) / delta) % 6
    elif high == g:
        hue = (b - r) / delta + 2
    else:
        hue = (r - g) / delta + 4
    return int(round(hue * 60)) % 360


def dominant_hue(palette: Sequence[str]) -> int | None:
    """The first palette entry with real chroma defines the colorway."""
    for color in palette:
        hue = hex_to_hue(color)
        if hue is not None:
            return hue
    return None


def colorway_name(hue: int | None) -> str:
    if hue is None:
        return "mono"
    best_name, best_distance = COLORWAYS[0]
    for name, anchor in COLORWAYS:
        distance = min(abs(anchor - hue), 360 - abs(anchor - hue))
        if distance < best_distance:
            best_name, best_distance = name, distance
    return best_name


def normalize_tags(raw: str | Iterable[str]) -> list[str]:
    items = raw.split(",") if isinstance(raw, str) else list(raw)
    tags: list[str] = []
    for item in items:
        tag = re.sub(r"[^a-z0-9-]", "", str(item).strip().lower().lstrip("#"))[:20]
        if tag and tag not in tags:
            tags.append(tag)
    return tags[:8]


def palette_from_svg(svg: str, limit: int = 4) -> list[str]:
    """Reads colour stops from SVG artwork, keeping order and dropping greys last."""
    seen: list[str] = []
    for match in HEX_RE.finditer(svg):
        color = f"#{match.group(1).lower()}"
        if color not in seen:
            seen.append(color)
    chromatic = [color for color in seen if hex_to_hue(color) is not None]
    neutral = [color for color in seen if hex_to_hue(color) is None]
    return (chromatic + neutral)[:limit]


def describe(palette: Sequence[str], tags: str | Iterable[str] = "") -> dict[str, Any]:
    cleaned = [normalize_hex(color) for color in palette]
    colors = [color for color in cleaned if color][:5]
    hue = dominant_hue(colors)
    return {
        "palette": colors,
        "dominantHue": hue,
        "colorway": colorway_name(hue),
        "tags": normalize_tags(tags) if tags else [],
        "isEphemeral": True,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Extract SnagChat metadata from media or a palette")
    parser.add_argument("--svg", help="path to an SVG capture")
    parser.add_argument("--palette", help="comma separated hex colours sampled from a capture")
    parser.add_argument("--tags", default="", help="comma separated free-form tags")
    parser.add_argument("--json", action="store_true", help="emit JSON (default)")
    args = parser.parse_args(argv)

    palette: list[str] = []
    if args.svg:
        palette = palette_from_svg(Path(args.svg).read_text(encoding="utf-8"))
    if args.palette:
        palette = [color for color in (normalize_hex(part) for part in args.palette.split(",")) if color]

    if not palette:
        parser.error("provide --svg or --palette")

    print(json.dumps(describe(palette, args.tags), indent=2))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
