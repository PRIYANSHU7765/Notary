#!/usr/bin/env python3
"""Signature detection using YOLOv8 model from Hugging Face.

Input (stdin JSON):
{
  "dataUrl": "data:application/pdf;base64,..." | "data:image/png;base64,...",
  "pageNumber": 1,
  "confidence": 0.25,
  "iou": 0.45,
  "maxDetections": 15
}

Output (stdout JSON):
{
  "ok": true,
  "pageNumber": 1,
  "totalPages": 3,
  "pageImageDataUrl": "data:image/png;base64,...",
  "candidates": [
    {"x": 12, "y": 34, "width": 200, "height": 80, "confidence": 0.91, "label": "signature"}
  ],
  "model": "tech4humans/yolov8s-signature-detector"
}
"""

import base64
import json
import math
import os
import sys

import numpy as np

try:
    from huggingface_hub import InferenceClient, hf_hub_download
except ImportError as exc:
    raise ImportError(
        "huggingface_hub is not installed. Run: python -m pip install huggingface-hub"
    ) from exc

MODEL_REPO_ID = "tech4humans/yolov8s-signature-detector"
MODEL_FILENAME = "yolov8s.pt"
PNG_MIME = "image/png"
DEFAULT_PROVIDER = os.getenv("SIGNATURE_INFERENCE_PROVIDER", "local").strip().lower() or "local"
HF_API_MODEL = os.getenv("SIGNATURE_HF_API_MODEL", MODEL_REPO_ID).strip() or MODEL_REPO_ID


class InputError(Exception):
    pass


def _read_stdin_json():
    raw = sys.stdin.read()
    if not raw or not raw.strip():
        raise InputError("Missing JSON payload on stdin")

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise InputError(f"Invalid JSON payload: {exc}") from exc

    if not isinstance(payload, dict):
        raise InputError("Payload must be a JSON object")

    return payload


def _parse_data_url(data_url):
    if not isinstance(data_url, str) or not data_url.startswith("data:"):
        raise InputError("dataUrl must be a valid data URL string")

    header, sep, payload = data_url.partition(",")
    if not sep or not payload:
        raise InputError("Invalid data URL payload")

    mime = "application/octet-stream"
    if ";" in header:
        mime = header[5:].split(";")[0].strip().lower() or mime
    else:
        mime = header[5:].strip().lower() or mime

    try:
        binary = base64.b64decode(payload, validate=False)
    except Exception as exc:
        raise InputError("Invalid base64 data in dataUrl") from exc

    return mime, binary


def _pdf_page_to_bgr(pdf_bytes, page_number):
    try:
        import fitz
    except ImportError as exc:
        raise RuntimeError("PDF conversion requires pymupdf (fitz). Install it or use image input.") from exc
    
    try:
        import cv2
    except ImportError as exc:
        raise RuntimeError("PDF rendering requires opencv-python (cv2). Install it.") from exc

    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as exc:
        raise InputError("Unable to read PDF document") from exc

    if doc.page_count <= 0:
        raise InputError("PDF has no pages")

    safe_page = int(page_number) if page_number else 1
    safe_page = max(1, min(safe_page, doc.page_count))

    sys.stderr.write(f"DEBUG: PDF page_count: {doc.page_count}, rendering page {safe_page}\n")
    page = doc.load_page(safe_page - 1)
    # Render at 2x for better detection quality.
    matrix = fitz.Matrix(2.0, 2.0)
    pix = page.get_pixmap(matrix=matrix, alpha=False)

    image_bytes = pix.tobytes("png")
    np_buf = np.frombuffer(image_bytes, dtype=np.uint8)
    bgr = cv2.imdecode(np_buf, cv2.IMREAD_COLOR)

    if bgr is None:
        raise InputError("Failed to render PDF page to image")

    sys.stderr.write(f"DEBUG: Rendered image shape: {bgr.shape}\n")
    return bgr, safe_page, doc.page_count


def _image_bytes_to_bgr(image_bytes):
    try:
        import cv2
    except ImportError as exc:
        raise RuntimeError("Image decode requires opencv-python (cv2). Install it or use hf_api provider.") from exc

    np_buf = np.frombuffer(image_bytes, dtype=np.uint8)
    bgr = cv2.imdecode(np_buf, cv2.IMREAD_COLOR)
    if bgr is None:
        raise InputError("Unable to decode image input")
    return bgr


def _bgr_to_png_data_url(image_bgr):
    try:
        import cv2
    except ImportError as exc:
        raise RuntimeError("Image encoding requires opencv-python (cv2). Install it or use hf_api provider.") from exc

    ok, encoded = cv2.imencode(".png", image_bgr)
    if not ok:
        raise RuntimeError("Failed to encode image to PNG")
    b64 = base64.b64encode(encoded.tobytes()).decode("ascii")
    return f"data:{PNG_MIME};base64,{b64}"


def _bgr_to_png_bytes(image_bgr):
    try:
        import cv2
    except ImportError as exc:
        raise RuntimeError("Image encoding requires opencv-python (cv2). Install it or use hf_api provider.") from exc

    ok, encoded = cv2.imencode(".png", image_bgr)
    if not ok:
        raise RuntimeError("Failed to encode image to PNG bytes")
    return encoded.tobytes()


def _pdf_page_to_png_bytes(pdf_bytes, page_number):
    """Convert a PDF page to PNG bytes for HuggingFace API."""
    page_bgr, safe_page, total_pages = _pdf_page_to_bgr(pdf_bytes, page_number)
    image_bytes = _bgr_to_png_bytes(page_bgr)
    return image_bytes, safe_page, total_pages


def _load_model_local():
    try:
        from ultralytics import YOLO
    except Exception as exc:
        raise RuntimeError(
            "Local provider requires ultralytics. Install it or set SIGNATURE_INFERENCE_PROVIDER=hf_api"
        ) from exc

    sys.stderr.write(f"DEBUG: Downloading model from {MODEL_REPO_ID}...\n")
    model_path = hf_hub_download(repo_id=MODEL_REPO_ID, filename=MODEL_FILENAME)
    sys.stderr.write(f"DEBUG: Model path: {model_path}\n")
    sys.stderr.write(f"DEBUG: Loading YOLO model...\n")
    model = YOLO(model_path)
    sys.stderr.write(f"DEBUG: YOLO model loaded successfully\n")
    return model


def _extract_candidates_local(results, max_detections):
    if not results:
        return []

    first = results[0]
    boxes = getattr(first, "boxes", None)
    if boxes is None:
        return []

    xyxy = boxes.xyxy.cpu().numpy() if boxes.xyxy is not None else []
    confs = boxes.conf.cpu().numpy() if boxes.conf is not None else []
    classes = boxes.cls.cpu().numpy() if boxes.cls is not None else []
    names = getattr(first, "names", {}) or {}

    candidates = []
    for i, rect in enumerate(xyxy):
        x1, y1, x2, y2 = [float(v) for v in rect]
        width = max(1.0, x2 - x1)
        height = max(1.0, y2 - y1)

        class_id = int(classes[i]) if i < len(classes) else -1
        label = names.get(class_id, "signature") if isinstance(names, dict) else "signature"
        confidence = float(confs[i]) if i < len(confs) else 0.0

        candidates.append(
            {
                "x": round(max(0.0, x1), 2),
                "y": round(max(0.0, y1), 2),
                "width": round(width, 2),
                "height": round(height, 2),
                "confidence": round(confidence, 5),
                "label": str(label or "signature"),
            }
        )

    candidates.sort(key=lambda item: item.get("confidence", 0.0), reverse=True)
    if isinstance(max_detections, int) and max_detections > 0:
        candidates = candidates[:max_detections]

    return candidates


def _extract_candidates_from_result(result, offset_x=0.0, offset_y=0.0):
    if result is None:
        return []

    boxes = getattr(result, "boxes", None)
    if boxes is None:
        return []

    xyxy = boxes.xyxy.cpu().numpy() if boxes.xyxy is not None else []
    confs = boxes.conf.cpu().numpy() if boxes.conf is not None else []
    classes = boxes.cls.cpu().numpy() if boxes.cls is not None else []
    names = getattr(result, "names", {}) or {}

    candidates = []
    for i, rect in enumerate(xyxy):
        x1, y1, x2, y2 = [float(v) for v in rect]
        width = max(1.0, x2 - x1)
        height = max(1.0, y2 - y1)

        class_id = int(classes[i]) if i < len(classes) else -1
        label = names.get(class_id, "signature") if isinstance(names, dict) else "signature"
        confidence = float(confs[i]) if i < len(confs) else 0.0

        candidates.append(
            {
                "x": round(max(0.0, x1 + offset_x), 2),
                "y": round(max(0.0, y1 + offset_y), 2),
                "width": round(width, 2),
                "height": round(height, 2),
                "confidence": round(confidence, 5),
                "label": str(label or "signature"),
            }
        )

    return candidates


def _candidate_iou(a, b):
    ax1 = float(a.get("x", 0.0))
    ay1 = float(a.get("y", 0.0))
    ax2 = ax1 + max(1.0, float(a.get("width", 0.0)))
    ay2 = ay1 + max(1.0, float(a.get("height", 0.0)))

    bx1 = float(b.get("x", 0.0))
    by1 = float(b.get("y", 0.0))
    bx2 = bx1 + max(1.0, float(b.get("width", 0.0)))
    by2 = by1 + max(1.0, float(b.get("height", 0.0)))

    inter_x1 = max(ax1, bx1)
    inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)

    inter_w = max(0.0, inter_x2 - inter_x1)
    inter_h = max(0.0, inter_y2 - inter_y1)
    inter_area = inter_w * inter_h
    if inter_area <= 0.0:
        return 0.0

    area_a = max(1.0, (ax2 - ax1) * (ay2 - ay1))
    area_b = max(1.0, (bx2 - bx1) * (by2 - by1))
    union = area_a + area_b - inter_area
    if union <= 0.0:
        return 0.0
    return inter_area / union


def _dedupe_candidates(candidates, iou_threshold=0.35):
    if not candidates:
        return []

    ordered = sorted(candidates, key=lambda item: item.get("confidence", 0.0), reverse=True)
    kept = []
    for candidate in ordered:
        should_keep = True
        for existing in kept:
            if _candidate_iou(candidate, existing) >= iou_threshold:
                should_keep = False
                break
        if should_keep:
            kept.append(candidate)
    return kept


def _filter_signature_like_candidates(candidates, image_shape):
    if not candidates:
        return []

    page_height, page_width = image_shape[:2]
    page_area = float(max(1, page_width * page_height))
    min_area = max(36.0, page_area * 0.000003)
    max_area = page_area * 0.45

    filtered = []
    for candidate in candidates:
        width = float(candidate.get("width", 0.0) or 0.0)
        height = float(candidate.get("height", 0.0) or 0.0)
        area = width * height

        if width < 8.0 or height < 4.0:
            continue
        if area < min_area or area > max_area:
            continue

        aspect = width / max(1.0, height)
        # Signatures are usually wider than tall, but keep this broad to avoid false negatives.
        if aspect < 0.45 or aspect > 40.0:
            continue

        filtered.append(candidate)

    return filtered


def _enhance_image_for_signatures(image_bgr):
    try:
        import cv2
    except ImportError as exc:
        raise RuntimeError("Image enhancement requires opencv-python (cv2).") from exc

    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    boosted = clahe.apply(gray)

    sharpen_kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]], dtype=np.float32)
    sharpened = cv2.filter2D(boosted, -1, sharpen_kernel)
    return cv2.cvtColor(sharpened, cv2.COLOR_GRAY2BGR)


def _iter_tiles(width, height, grid_cols, grid_rows, overlap_ratio=0.15):
    tile_w = math.ceil(width / max(1, grid_cols))
    tile_h = math.ceil(height / max(1, grid_rows))
    overlap_x = int(tile_w * overlap_ratio)
    overlap_y = int(tile_h * overlap_ratio)

    for row in range(grid_rows):
        for col in range(grid_cols):
            base_x1 = col * tile_w
            base_y1 = row * tile_h
            base_x2 = min(width, (col + 1) * tile_w)
            base_y2 = min(height, (row + 1) * tile_h)

            x1 = max(0, base_x1 - overlap_x)
            y1 = max(0, base_y1 - overlap_y)
            x2 = min(width, base_x2 + overlap_x)
            y2 = min(height, base_y2 + overlap_y)

            if x2 - x1 < 32 or y2 - y1 < 32:
                continue

            yield x1, y1, x2, y2


def _unique_confidence_levels(base_confidence):
    requested = float(base_confidence)
    levels = [requested, max(0.1, requested * 0.7), 0.08, 0.05]

    unique = []
    for conf in levels:
        clamped = round(min(max(conf, 0.01), 0.99), 4)
        if clamped not in unique:
            unique.append(clamped)
    return unique


def _detect_local_with_fallback(model, page_bgr, confidence, iou, max_detections):
    all_candidates = []
    conf_levels = _unique_confidence_levels(confidence)
    enhanced_bgr = _enhance_image_for_signatures(page_bgr)

    # Pass 1: full-page inference over raw + enhanced image using adaptive confidence.
    for conf in conf_levels:
        for variant_name, image in (("raw", page_bgr), ("enhanced", enhanced_bgr)):
            sys.stderr.write(f"DEBUG: Full-page pass variant={variant_name} conf={conf}\\n")
            results = model(image, conf=conf, iou=iou, verbose=False)
            if not results:
                continue
            all_candidates.extend(_extract_candidates_from_result(results[0]))

        filtered = _filter_signature_like_candidates(_dedupe_candidates(all_candidates), page_bgr.shape)
        if filtered:
            all_candidates = filtered
            break

    if all_candidates:
        final_candidates = _dedupe_candidates(all_candidates)
        final_candidates = _filter_signature_like_candidates(final_candidates, page_bgr.shape)
        final_candidates.sort(key=lambda item: item.get("confidence", 0.0), reverse=True)
        if isinstance(max_detections, int) and max_detections > 0:
            final_candidates = final_candidates[:max_detections]
        return final_candidates

    # Pass 2: tiled fallback helps when signatures are tiny in a full-page render.
    height, width = page_bgr.shape[:2]
    tile_conf = min(conf_levels[-1], max(0.03, min(confidence, 0.08)))
    for grid_cols, grid_rows in ((2, 2), (3, 2), (3, 3)):
        for x1, y1, x2, y2 in _iter_tiles(width, height, grid_cols, grid_rows):
            tile = page_bgr[y1:y2, x1:x2]
            if tile.size == 0:
                continue

            for variant_name, image in (("raw", tile), ("enhanced", _enhance_image_for_signatures(tile))):
                sys.stderr.write(
                    f"DEBUG: Tile pass grid={grid_cols}x{grid_rows} variant={variant_name} conf={tile_conf} rect=({x1},{y1},{x2},{y2})\\n"
                )
                results = model(image, conf=tile_conf, iou=iou, verbose=False)
                if not results:
                    continue
                tile_candidates = _extract_candidates_from_result(results[0], offset_x=x1, offset_y=y1)
                all_candidates.extend(tile_candidates)

        deduped = _dedupe_candidates(all_candidates)
        filtered = _filter_signature_like_candidates(deduped, page_bgr.shape)
        if filtered:
            all_candidates = filtered
            break

    final_candidates = _dedupe_candidates(all_candidates)
    final_candidates = _filter_signature_like_candidates(final_candidates, page_bgr.shape)
    final_candidates.sort(key=lambda item: item.get("confidence", 0.0), reverse=True)
    if isinstance(max_detections, int) and max_detections > 0:
        final_candidates = final_candidates[:max_detections]
    return final_candidates


def _as_dict_object(value):
    if isinstance(value, dict):
        return value
    if hasattr(value, "__dict__"):
        return value.__dict__
    return {}


def _extract_candidates_hf_api(image_bytes, max_detections, confidence):
    # Prefer dedicated API with token, fallback to local InferenceClient if available
    hf_token = os.getenv("HF_TOKEN") or None
    api_model = HF_API_MODEL

    response_json = None
    if hf_token:
        import requests

        api_url = os.getenv("SIGNATURE_HF_API_URL") or f"https://api-inference.huggingface.co/models/{api_model}"
        headers = {
            "Authorization": f"Bearer {hf_token}",
            "Accept": "application/json",
        }

        response = requests.post(api_url, headers=headers, files={"file": ("image.png", image_bytes, "image/png")})
        if response.status_code == 503:
            raise RuntimeError("Hugging Face model is loading; try again in a few seconds.")
        if response.status_code == 410:
            raise RuntimeError(
                "Model not available on Hugging Face inference endpoint (410 Gone). "
                "Switch SIGNATURE_INFERENCE_PROVIDER=local or use a different model ID."
            )
        response.raise_for_status()
        response_json = response.json()
    else:
        raise RuntimeError("HF_TOKEN is required for hf_api provider. Set HF_TOKEN in environment.")

    candidates = []
    for item in response_json or []:
        obj = _as_dict_object(item)
        box = obj.get("box")
        if box is None and hasattr(item, "box"):
            box = getattr(item, "box")
        box_obj = _as_dict_object(box)

        xmin = float(box_obj.get("xmin", 0.0) or 0.0)
        ymin = float(box_obj.get("ymin", 0.0) or 0.0)
        xmax = float(box_obj.get("xmax", xmin) or xmin)
        ymax = float(box_obj.get("ymax", ymin) or ymin)
        score = float(obj.get("score", 0.0) or 0.0)

        if score < confidence:
            continue

        width = max(1.0, xmax - xmin)
        height = max(1.0, ymax - ymin)
        label = str(obj.get("label") or "signature")

        candidates.append(
            {
                "x": round(max(0.0, xmin), 2),
                "y": round(max(0.0, ymin), 2),
                "width": round(width, 2),
                "height": round(height, 2),
                "confidence": round(score, 5),
                "label": label,
            }
        )

    candidates.sort(key=lambda item: item.get("confidence", 0.0), reverse=True)
    if isinstance(max_detections, int) and max_detections > 0:
        candidates = candidates[:max_detections]
    return candidates


def run():
    payload = _read_stdin_json()

    data_url = payload.get("dataUrl")
    page_number = int(payload.get("pageNumber") or 1)
    confidence = float(payload.get("confidence") or 0.25)
    iou = float(payload.get("iou") or 0.45)
    max_detections = int(payload.get("maxDetections") or 15)
    provider = str(payload.get("provider") or DEFAULT_PROVIDER).strip().lower() or "local"

    mime, blob = _parse_data_url(data_url)

    if provider == "hf_api":
        if mime == "application/pdf" or mime.endswith("/pdf"):
            page_bgr, safe_page, total_pages = _pdf_page_to_bgr(blob, page_number)
            image_bytes = _bgr_to_png_bytes(page_bgr)
        elif mime.startswith("image/"):
            image_bytes = blob
            page_bgr = _image_bytes_to_bgr(blob)
            safe_page = page_number if page_number >= 1 else 1
            total_pages = 1
        else:
            raise InputError(f"Unsupported MIME type: {mime}")

        candidates = _extract_candidates_hf_api(image_bytes, max_detections, confidence)
        model_name = HF_API_MODEL
        page_image_data_url = _bgr_to_png_data_url(page_bgr)
    else:
        if mime == "application/pdf" or mime.endswith("/pdf"):
            page_bgr, safe_page, total_pages = _pdf_page_to_bgr(blob, page_number)
        elif mime.startswith("image/"):
            page_bgr = _image_bytes_to_bgr(blob)
            safe_page = 1
            total_pages = 1
        else:
            raise InputError(f"Unsupported MIME type: {mime}")

        sys.stderr.write(f"DEBUG: Running YOLO inference with conf={confidence}, iou={iou}\n")
        model = _load_model_local()
        candidates = _detect_local_with_fallback(model, page_bgr, confidence, iou, max_detections)
        sys.stderr.write(f"DEBUG: Extracted {len(candidates)} candidates\n")
        model_name = MODEL_REPO_ID
        page_image_data_url = _bgr_to_png_data_url(page_bgr)

    response = {
        "ok": True,
        "pageNumber": safe_page,
        "totalPages": total_pages,
        "pageImageDataUrl": page_image_data_url,
        "candidates": candidates,
        "model": model_name,
        "provider": provider,
    }

    sys.stdout.write(json.dumps(response))


if __name__ == "__main__":
    try:
        run()
    except InputError as exc:
        sys.stderr.write(f"InputError: {exc}\n")
        sys.stdout.write(json.dumps({"ok": False, "error": str(exc)}))
        sys.exit(2)
    except Exception as exc:
        sys.stderr.write(f"Exception: {type(exc).__name__}: {exc}\n")
        sys.stderr.write("Traceback:\n")
        import traceback

        traceback.print_exc(file=sys.stderr)
        sys.stdout.write(json.dumps({"ok": False, "error": f"Internal extractor error: {repr(exc)}"}))
        sys.exit(1)
