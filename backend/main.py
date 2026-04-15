from __future__ import annotations

import base64
import io
import logging
import os
import time
from pathlib import Path
from typing import Sequence

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from dotenv import load_dotenv
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

load_dotenv(dotenv_path=Path(__file__).with_name(".env"))

app = FastAPI(title="CreAItive Studio API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class GeminiServiceError(RuntimeError):
    pass


class GeminiImageOutputError(GeminiServiceError):
    pass


def _to_png_bytes(image_bytes: bytes) -> bytes:
    with Image.open(io.BytesIO(image_bytes)) as im:
        im = im.convert("RGBA")
        out = io.BytesIO()
        im.save(out, format="PNG")
        return out.getvalue()


def _detect_mime_type(image_bytes: bytes) -> str:
    with Image.open(io.BytesIO(image_bytes)) as im:
        fmt = (im.format or "").upper()
    if fmt == "PNG":
        return "image/png"
    if fmt in ("JPG", "JPEG"):
        return "image/jpeg"
    if fmt == "WEBP":
        return "image/webp"
    return "application/octet-stream"


def _extract_image_part(response) -> tuple[bytes, str]:
    candidates = getattr(response, "candidates", []) or []
    for cand in candidates:
        parts = getattr(getattr(cand, "content", None), "parts", []) or []
        for part in parts:
            inline_data = getattr(part, "inline_data", None)
            if inline_data and getattr(inline_data, "mime_type", "").startswith("image/"):
                return inline_data.data, inline_data.mime_type
    raise GeminiImageOutputError(
        "Gemini response did not include image output. Verify model access and response_modalities support."
    )


def generate_images(
    *,
    image_bytes: bytes,
    prompt: str,
    num_images: int,
    api_key: str,
    model: str,
) -> Sequence[bytes]:
    if not api_key:
        raise GeminiServiceError("GEMINI_API_KEY is missing. Put it in .env or your environment.")
    if not model:
        raise GeminiServiceError("GEMINI_MODEL is missing (suggested: gemini-2.5-flash-image).")

    out: list[bytes] = []
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        input_mime = _detect_mime_type(image_bytes)
        if input_mime == "application/octet-stream":
            raise GeminiServiceError("Unsupported input image format")

        input_part = types.Part.from_bytes(data=image_bytes, mime_type=input_mime)

        start = time.perf_counter()
        last_error: Exception | None = None
        for idx in range(num_images):
            last_error = None
            for attempt in range(1, 4):
                try:
                    resp = client.models.generate_content(
                        model=model,
                        contents=[input_part, prompt],
                        config=types.GenerateContentConfig(
                            response_modalities=["IMAGE"],
                        ),
                    )
                    output_bytes, output_mime = _extract_image_part(resp)
                    if output_mime != "image/png":
                        output_bytes = _to_png_bytes(output_bytes)
                    out.append(output_bytes)
                    break
                except Exception as e:
                    last_error = e
                    logger.warning(
                        "Gemini image attempt %d failed (image %d/%d): %s",
                        attempt,
                        idx + 1,
                        num_images,
                        e,
                    )
                    if attempt < 3:
                        time.sleep(2**attempt)
            if last_error is not None and len(out) != idx + 1:
                raise last_error

        logger.info("Gemini generated %d image(s) in %dms", len(out), int((time.perf_counter() - start) * 1000))
        return out
    except Exception as e:
        logger.exception("Gemini generation failed")
        raise GeminiServiceError(str(e)) from e


class GenerateResponse(BaseModel):
    images_b64: list[str] = Field(description="PNG images as standard base64 strings")
    mime_type: str = Field(default="image/png")


@app.post("/api/generate", response_model=GenerateResponse)
async def api_generate(
    image: UploadFile = File(..., description="Input image from the browser (PNG, JPEG, or WebP)"),
    prompt: str = Form(..., min_length=1),
    num_images: int = Form(1, ge=1, le=4),
    model: str | None = Form(
        None,
        description="Optional Gemini model id (e.g. gemini-2.5-flash-image); defaults to GEMINI_MODEL in .env",
    ),
) -> GenerateResponse:
    """
    Accepts the same file the user picked in the UI (`multipart/form-data`),
    runs Gemini image generation, returns PNGs as base64 for display or download.
    """
    raw = await image.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file upload.")

    api_key = (os.getenv("GEMINI_API_KEY") or "").strip().strip('"')
    resolved_model = (model or os.getenv("GEMINI_MODEL") or "gemini-2.5-flash-image").strip().strip('"')

    try:
        pngs = generate_images(
            image_bytes=raw,
            prompt=prompt.strip(),
            num_images=num_images,
            api_key=api_key,
            model=resolved_model,
        )
    except GeminiServiceError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    return GenerateResponse(
        images_b64=[base64.standard_b64encode(p).decode("ascii") for p in pngs],
        mime_type="image/png",
    )


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
