from __future__ import annotations

import base64
import io
import logging
import os
import time
import asyncio
import concurrent.futures
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


class AzureImageServiceError(RuntimeError):
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

    try:
        from google import genai
        from google.genai import types

        input_mime = _detect_mime_type(image_bytes)
        if input_mime == "application/octet-stream":
            raise GeminiServiceError("Unsupported input image format")

        input_part = types.Part.from_bytes(data=image_bytes, mime_type=input_mime)

        def _generate_one(image_idx: int) -> bytes:
            # Keep a per-thread client to avoid cross-thread SDK state issues.
            client = genai.Client(api_key=api_key)
            last_error: Exception | None = None
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
                    return output_bytes
                except Exception as e:
                    last_error = e
                    logger.warning(
                        "Gemini image attempt %d failed (image %d/%d): %s",
                        attempt,
                        image_idx + 1,
                        num_images,
                        e,
                    )
                    if attempt < 3:
                        time.sleep(2**attempt)
            if last_error is not None:
                raise last_error
            raise GeminiServiceError("Gemini generation failed with unknown error")

        start = time.perf_counter()
        out: list[bytes] = []
        max_workers = min(num_images, 4)
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = [executor.submit(_generate_one, idx) for idx in range(num_images)]
            for fut in futures:
                out.append(fut.result())

        logger.info("Gemini generated %d image(s) in %dms", len(out), int((time.perf_counter() - start) * 1000))
        return out
    except Exception as e:
        logger.exception("Gemini generation failed")
        raise GeminiServiceError(str(e)) from e


def edit_images_azure(
    *,
    image_bytes: bytes,
    prompt: str,
    num_images: int,
    endpoint: str,
    api_key: str,
    api_version: str,
    model: str,
) -> Sequence[bytes]:
    if not endpoint:
        raise AzureImageServiceError("AZURE_OPENAI_ENDPOINT is missing. Put it in .env or your environment.")
    if not api_key:
        raise AzureImageServiceError("AZURE_OPENAI_API_KEY is missing. Put it in .env or your environment.")
    if not api_version:
        raise AzureImageServiceError("AZURE_OPENAI_API_VERSION is missing (example: 2025-04-01-preview).")
    if not model:
        raise AzureImageServiceError("AZURE_OPENAI_IMAGE_MODEL is missing (example: gpt-image-1.5).")

    try:
        from openai import AzureOpenAI  # type: ignore
    except Exception as e:
        raise AzureImageServiceError("Python package 'openai' is not installed in backend env.") from e

    # The SDK expects file-like objects. Ensure the bytes have a filename.
    class _NamedBytes(io.BytesIO):
        name = "input.png"

    def _run_once() -> Sequence[bytes]:
        client = AzureOpenAI(
            azure_endpoint=endpoint,
            api_key=api_key,
            api_version=api_version,
        )
        f = _NamedBytes(image_bytes)
        # Azure image edit returns base64 JSON strings in b64_json
        resp = client.images.edit(
            model=model,
            image=[f],
            prompt=prompt,
            n=num_images,
            quality="high",
            input_fidelity="high",
        )
        out: list[bytes] = []
        for item in getattr(resp, "data", []) or []:
            b64 = getattr(item, "b64_json", None)
            if not b64:
                continue
            out.append(base64.b64decode(b64))
        if not out:
            raise AzureImageServiceError("Azure returned no image data.")
        return out

    start = time.perf_counter()
    try:
        out = _run_once()
        logger.info("Azure image edit returned %d image(s) in %dms", len(out), int((time.perf_counter() - start) * 1000))
        # The model already returns PNG bytes for b64_json; keep output as PNG
        return out
    except Exception as e:
        logger.exception("Azure image edit failed")
        raise AzureImageServiceError(str(e)) from e


class GenerateResponse(BaseModel):
    images_b64: list[str] = Field(description="PNG images as standard base64 strings")
    mime_type: str = Field(default="image/png")


@app.post("/api/generate", response_model=GenerateResponse)
async def api_generate(
    image: UploadFile = File(..., description="Input image from the browser (PNG, JPEG, or WebP)"),
    prompt: str = Form(..., min_length=1),
    num_images: int = Form(1, ge=1, le=4),
    provider_id: str | None = Form(
        None,
        description="App provider id (e.g. gpt-image or gemini-flash). When omitted, defaults to Gemini.",
    ),
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

    requested = (provider_id or "").strip()
    try:
        if requested == "gpt-image":
            endpoint = (os.getenv("AZURE_OPENAI_ENDPOINT") or "").strip().strip('"')
            api_key = (os.getenv("AZURE_OPENAI_API_KEY") or "").strip().strip('"')
            api_version = (os.getenv("AZURE_OPENAI_API_VERSION") or "").strip().strip('"')
            az_model = (os.getenv("AZURE_OPENAI_IMAGE_MODEL") or "gpt-image-1.5").strip().strip('"')
            pngs = await asyncio.to_thread(
                edit_images_azure,
                image_bytes=raw,
                prompt=prompt.strip(),
                num_images=num_images,
                endpoint=endpoint,
                api_key=api_key,
                api_version=api_version,
                model=az_model,
            )
        else:
            api_key = (os.getenv("GEMINI_API_KEY") or "").strip().strip('"')
            resolved_model = (model or os.getenv("GEMINI_MODEL") or "gemini-2.5-flash-image").strip().strip('"')
            pngs = await asyncio.to_thread(
                generate_images,
                image_bytes=raw,
                prompt=prompt.strip(),
                num_images=num_images,
                api_key=api_key,
                model=resolved_model,
            )
    except (GeminiServiceError, AzureImageServiceError) as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    return GenerateResponse(
        images_b64=[base64.standard_b64encode(p).decode("ascii") for p in pngs],
        mime_type="image/png",
    )


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
