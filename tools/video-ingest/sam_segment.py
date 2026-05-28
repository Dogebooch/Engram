"""SAM-assisted symbol outlines for the video pipeline.

Claude authors a rough prompt per symbol (the required bbox, plus an optional
foreground point / negative points) in backdrop-frame pixel space. This helper
runs a SAM image predictor, turns each mask into a simplified polygon in the
SAME backdrop-frame pixel space, and merges it back into draft_symbols.json as
the optional `polygon` field that make_bundle() already consumes -> zero bundler
change. Pair with the overlay verification loop before building the bundle.

Backend notes (gfx1100 / ROCm 7.10 nightly, verified 2026-05-28): SAM2's Hiera
image encoder SDPA produces garbage masks / crashes on the GPU, so the default
device is CPU (correct, pixel-perfect; ~50s set_image once per video, instant
per-symbol predicts). `--device cuda` is left available for when ROCm matures.

mask_to_polygon / choose_prompt / render_overlay are torch-free (unit-tested);
torch + sam2 are imported lazily inside the predictor functions.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import cv2
import numpy as np

DEFAULT_CHECKPOINT = "tools/video-ingest/models/sam2/sam2.1_hiera_large.pt"
DEFAULT_CONFIG = "configs/sam2.1/sam2.1_hiera_l.yaml"

# --model alias -> (checkpoint, config). "large" = best masks; "small"/"tiny" are
# ~3-4x faster to encode on CPU with slightly looser masks (good for iterating).
_MODELS = "tools/video-ingest/models/sam2"
MODEL_ALIASES = {
    "large": (f"{_MODELS}/sam2.1_hiera_large.pt", "configs/sam2.1/sam2.1_hiera_l.yaml"),
    "base": (
        f"{_MODELS}/sam2.1_hiera_base_plus.pt",
        "configs/sam2.1/sam2.1_hiera_b+.yaml",
    ),
    "small": (f"{_MODELS}/sam2.1_hiera_small.pt", "configs/sam2.1/sam2.1_hiera_s.yaml"),
    "tiny": (f"{_MODELS}/sam2.1_hiera_tiny.pt", "configs/sam2.1/sam2.1_hiera_t.yaml"),
}


# --------------------------------------------------------------------------- #
# Pure geometry helpers (no torch)
# --------------------------------------------------------------------------- #
def choose_prompt(symbol: dict[str, Any]) -> str:
    explicit = symbol.get("sam_prompt")
    if explicit in ("box", "point", "box+point"):
        return explicit
    return "box+point" if isinstance(symbol.get("point"), dict) else "box"


def bbox_to_xyxy(bbox: dict[str, Any]) -> list[float]:
    x = float(bbox.get("x", 0) or 0)
    y = float(bbox.get("y", 0) or 0)
    w = float(bbox.get("width", 0) or 0)
    h = float(bbox.get("height", 0) or 0)
    return [x, y, x + w, y + h]


def mask_to_polygon(
    mask: Any,
    min_vertices: int = 8,
    max_vertices: int = 24,
    min_area_frac: float = 0.0005,
    pad_px: int = 0,
) -> list[list[int]] | None:
    """Largest external contour of a binary mask, simplified (approxPolyDP) to
    the most detail that fits the vertex budget. Concavity is preserved (no
    convex hull). `pad_px` dilates the silhouette outward first, so a slightly
    under-segmented mask still fully contains the object (a small safety halo).
    Returns [[x,y],...] in mask pixel space, or None for an empty / speck /
    degenerate mask."""
    m = (np.asarray(mask) > 0).astype(np.uint8)
    if m.ndim != 2:
        return None
    total = m.shape[0] * m.shape[1]
    if total == 0 or m.sum() == 0 or (m.sum() / total) < min_area_frac:
        return None

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, kernel)
    if pad_px > 0:
        d = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE, (2 * pad_px + 1, 2 * pad_px + 1)
        )
        m = cv2.dilate(m, d)
    contours, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    contour = max(contours, key=cv2.contourArea)
    if cv2.contourArea(contour) <= 0:
        return None

    peri = cv2.arcLength(contour, True)
    # Binary-search epsilon: larger epsilon -> fewer vertices. Aim for
    # [min,max]; otherwise settle on the finest result within the budget.
    lo, hi = 0.0, 0.1
    for _ in range(24):
        mid = (lo + hi) / 2
        n = len(cv2.approxPolyDP(contour, mid * peri, True))
        if n > max_vertices:
            lo = mid
        elif n < min_vertices:
            hi = mid
        else:
            hi = mid
            break
    pts = cv2.approxPolyDP(contour, hi * peri, True).reshape(-1, 2)
    if len(pts) < 3:
        pts = cv2.approxPolyDP(contour, 0.01 * peri, True).reshape(-1, 2)
    if len(pts) < 3:
        return None
    return [[int(p[0]), int(p[1])] for p in pts]


def render_overlay(
    backdrop_path: Path,
    draft: dict[str, Any],
    out_path: Path,
    show_bbox: bool = True,
) -> Path:
    """Draw every merged polygon (+ prompt point/box + label) onto the backdrop
    so Claude can read it and confirm each outline hugs its object."""
    image = cv2.imread(str(backdrop_path))
    palette = [
        (0, 255, 0),
        (0, 200, 255),
        (255, 0, 255),
        (0, 165, 255),
        (255, 255, 0),
        (255, 0, 0),
        (0, 0, 255),
        (128, 255, 0),
    ]
    for i, symbol in enumerate(draft.get("symbols", [])):
        color = palette[i % len(palette)]
        poly = symbol.get("polygon")
        sam = symbol.get("sam") or {}
        if poly and len(poly) >= 3:
            pts = np.array([[int(p[0]), int(p[1])] for p in poly], dtype=np.int32)
            cv2.polylines(image, [pts], True, color, 2)
            cx, cy = int(pts[:, 0].mean()), int(pts[:, 1].mean())
        else:
            box = symbol.get("bbox") or {}
            cx, cy = int(box.get("x", 0)), int(box.get("y", 0))
        if show_bbox and symbol.get("bbox"):
            x0, y0, x1, y1 = (int(v) for v in bbox_to_xyxy(symbol["bbox"]))
            cv2.rectangle(image, (x0, y0), (x1, y1), color, 1)
        point = symbol.get("point")
        if isinstance(point, dict):
            cv2.circle(image, (int(point["x"]), int(point["y"])), 5, color, -1)
        for neg in symbol.get("neg_points") or []:
            nx, ny = int(neg["x"]), int(neg["y"])
            cv2.drawMarker(image, (nx, ny), color, cv2.MARKER_TILTED_CROSS, 12, 2)
        label = f"{symbol.get('order', i)}:{symbol.get('symbol_key', '?')}"
        score = sam.get("mask_score")
        if score is not None:
            label += f" [{float(score):.2f}]"
        cv2.putText(
            image, label, (cx + 4, cy), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 3
        )
        cv2.putText(image, label, (cx + 4, cy), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)
    cv2.imwrite(str(out_path), image)
    return out_path


# --------------------------------------------------------------------------- #
# Predictor (torch + sam2, imported lazily)
# --------------------------------------------------------------------------- #
def load_predictor(backend: str, checkpoint: str, config: str, device: str):
    if backend == "sam2":
        from sam2.build_sam import build_sam2
        from sam2.sam2_image_predictor import SAM2ImagePredictor

        model = build_sam2(config, checkpoint, device=device)
        return SAM2ImagePredictor(model)
    if backend == "mobilesam":
        from mobile_sam import SamPredictor, sam_model_registry

        sam = sam_model_registry["vit_t"](checkpoint=checkpoint)
        sam.to(device=device)
        sam.eval()
        return SamPredictor(sam)
    raise ValueError(f"unknown backend: {backend}")


def predict_mask(
    predictor,
    point: dict[str, Any] | None,
    neg_points: list[dict[str, Any]] | None,
    box: list[float] | None,
) -> tuple[np.ndarray, float]:
    coords: list[list[float]] = []
    labels: list[int] = []
    if point:
        coords.append([float(point["x"]), float(point["y"])])
        labels.append(1)
    for neg in neg_points or []:
        coords.append([float(neg["x"]), float(neg["y"])])
        labels.append(0)
    masks, scores, _ = predictor.predict(
        point_coords=np.array(coords) if coords else None,
        point_labels=np.array(labels) if labels else None,
        box=np.array(box) if box is not None else None,
        multimask_output=True,
    )
    best = int(np.argmax(scores))
    return (masks[best] > 0).astype(np.uint8), float(scores[best])


def segment_symbol(
    predictor,
    symbol: dict[str, Any],
    backend: str,
    min_vertices: int,
    max_vertices: int,
    min_score: float,
    pad_px: int = 0,
) -> dict[str, Any]:
    prompt = choose_prompt(symbol)
    point = symbol.get("point") if prompt in ("point", "box+point") else None
    neg = symbol.get("neg_points") if point else None
    box = bbox_to_xyxy(symbol["bbox"]) if prompt in ("box", "box+point") else None
    try:
        mask, score = predict_mask(predictor, point, neg, box)
    except Exception as exc:  # boundary: model call
        return {
            "sam": {
                "backend": backend,
                "prompt_used": prompt,
                "status": "error",
                "error": str(exc),
            }
        }

    polygon = mask_to_polygon(mask, min_vertices, max_vertices, pad_px=pad_px)
    if polygon is None:
        return {
            "sam": {
                "backend": backend,
                "prompt_used": prompt,
                "mask_score": round(score, 4),
                "status": "empty_mask",
            }
        }
    status = "ok" if score >= min_score else "low_score"
    return {
        "polygon": polygon,
        "sam": {
            "backend": backend,
            "prompt_used": prompt,
            "mask_score": round(score, 4),
            "n_vertices": len(polygon),
            "area_frac": round(float((mask > 0).sum()) / mask.size, 4),
            "status": status,
        },
    }


def _cache_path(backdrop_path: Path) -> Path:
    return Path(str(backdrop_path) + ".samfeat")


def set_image_cached(
    predictor,
    rgb: np.ndarray,
    backend: str,
    device: str,
    checkpoint: str,
    backdrop_path: Path,
    use_cache: bool,
) -> str:
    """Encode the backdrop once and cache SAM2's image features to disk so the
    verification-loop re-runs (--only-orders) skip the slow encoder. Returns
    "cache" or "computed". Falls back to a fresh encode on any cache miss/error.
    Only sam2's features are cached (mobilesam internals differ)."""
    import torch

    cache = _cache_path(backdrop_path)
    ckpt_name = Path(checkpoint).name
    if use_cache and backend == "sam2" and cache.exists():
        try:
            blob = torch.load(cache, map_location=device, weights_only=False)
            if blob.get("checkpoint") == ckpt_name:
                feats = blob["features"]
                predictor._features = {
                    "image_embed": feats["image_embed"].to(device),
                    "high_res_feats": [t.to(device) for t in feats["high_res_feats"]],
                }
                predictor._orig_hw = blob["orig_hw"]
                predictor._is_image_set = True
                predictor._is_batch = False
                return "cache"
        except Exception:
            pass
    predictor.set_image(rgb)
    if use_cache and backend == "sam2":
        try:
            torch.save(
                {
                    "checkpoint": ckpt_name,
                    "features": predictor._features,
                    "orig_hw": predictor._orig_hw,
                },
                cache,
            )
        except Exception:
            pass
    return "computed"


def run(
    draft_path: Path,
    backdrop_path: Path,
    backend: str = "sam2",
    checkpoint: str = DEFAULT_CHECKPOINT,
    config: str = DEFAULT_CONFIG,
    device: str = "cpu",
    only_orders: set[int] | None = None,
    retighten_bbox: bool = False,
    out_overlay: Path | None = None,
    min_score: float = 0.5,
    min_vertices: int = 8,
    max_vertices: int = 24,
    pad_px: int = 3,
    use_cache: bool = True,
) -> dict[str, Any]:
    import torch

    draft = json.loads(Path(draft_path).read_text(encoding="utf-8"))
    symbols = draft.get("symbols", [])
    bgr = cv2.imread(str(backdrop_path))
    if bgr is None:
        raise FileNotFoundError(backdrop_path)
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)

    predictor = load_predictor(backend, checkpoint, config, device)
    n_ok = n_failed = 0
    with torch.inference_mode():
        encode = set_image_cached(
            predictor, rgb, backend, device, checkpoint, backdrop_path, use_cache
        )
        for symbol in symbols:
            if (
                only_orders is not None
                and int(symbol.get("order", -1)) not in only_orders
            ):
                continue
            if not symbol.get("bbox"):
                continue
            patch = segment_symbol(
                predictor,
                symbol,
                backend,
                min_vertices,
                max_vertices,
                min_score,
                pad_px,
            )
            symbol.update(patch)
            if patch.get("sam", {}).get("status") == "ok":
                n_ok += 1
                if retighten_bbox and patch.get("polygon"):
                    xs = [p[0] for p in patch["polygon"]]
                    ys = [p[1] for p in patch["polygon"]]
                    symbol["bbox"] = {
                        "x": min(xs),
                        "y": min(ys),
                        "width": max(xs) - min(xs),
                        "height": max(ys) - min(ys),
                    }
            else:
                n_failed += 1

    draft["sam_run"] = {
        "backend": backend,
        "checkpoint": str(checkpoint),
        "device": device,
        "pad_px": pad_px,
        "encode": encode,
        "n_ok": n_ok,
        "n_failed": n_failed,
    }
    Path(draft_path).write_text(
        json.dumps(draft, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    if out_overlay is not None:
        render_overlay(backdrop_path, draft, out_overlay)
    return draft["sam_run"]


def main() -> int:
    parser = argparse.ArgumentParser(description="SAM-assisted symbol outlines.")
    parser.add_argument("--draft", required=True, type=Path)
    parser.add_argument("--backdrop", required=True, type=Path)
    parser.add_argument("--backend", choices=["sam2", "mobilesam"], default="sam2")
    parser.add_argument(
        "--model",
        choices=list(MODEL_ALIASES),
        default=None,
        help="SAM2 size alias (sets checkpoint+config). large=best masks; small/tiny=faster encode.",
    )
    parser.add_argument("--checkpoint", default=DEFAULT_CHECKPOINT)
    parser.add_argument("--config", default=DEFAULT_CONFIG)
    parser.add_argument(
        "--device",
        default="cpu",
        help="cpu (stable) or cuda (ROCm, currently unstable for SAM2)",
    )
    parser.add_argument(
        "--only-orders",
        default=None,
        help="comma-separated symbol orders to re-segment",
    )
    parser.add_argument("--retighten-bbox", action="store_true")
    parser.add_argument("--out-overlay", type=Path, default=None)
    parser.add_argument("--min-score", type=float, default=0.5)
    parser.add_argument("--min-vertices", type=int, default=8)
    parser.add_argument("--max-vertices", type=int, default=24)
    parser.add_argument(
        "--pad-px",
        type=int,
        default=3,
        help="Dilate each outline outward by N frame px (safety halo).",
    )
    parser.add_argument(
        "--no-cache", action="store_true", help="Disable the cached backdrop encoding."
    )
    args = parser.parse_args()

    checkpoint, config = args.checkpoint, args.config
    if args.model:
        checkpoint, config = MODEL_ALIASES[args.model]

    only = (
        {int(x) for x in str(args.only_orders).split(",") if x.strip() != ""}
        if args.only_orders
        else None
    )
    summary = run(
        draft_path=args.draft,
        backdrop_path=args.backdrop,
        backend=args.backend,
        checkpoint=checkpoint,
        config=config,
        device=args.device,
        only_orders=only,
        retighten_bbox=args.retighten_bbox,
        out_overlay=args.out_overlay,
        min_score=args.min_score,
        min_vertices=args.min_vertices,
        max_vertices=args.max_vertices,
        pad_px=args.pad_px,
        use_cache=not args.no_cache,
    )
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
