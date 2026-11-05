"""
Video Generation API Endpoints for Presenton
POST /api/v1/media/generate-video  – Generate a short MP4 clip from a text prompt
GET  /api/v1/media/comfyui-status  – Check if the local ComfyUI server is reachable
"""

import os
import uuid
from io import BytesIO
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from typing import Optional

from services.video_generation_service import VideoGenerationService
from utils.get_env import get_comfyui_url_env
from utils.asset_directory_utils import absolute_fastapi_asset_url, get_exports_directory, get_images_directory, filesystem_image_path_to_app_data_url

router = APIRouter(prefix="/media", tags=["media"])


# ─── Request / Response models ────────────────────────────────────────────────


class VideoGenerationRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=2000, description="Text prompt")
    workflow_json: Optional[str] = Field(
        None, description="Custom ComfyUI workflow JSON (API format). Leave empty to use the built-in AnimateDiff workflow."
    )
    width: int = Field(256, ge=256, le=2048, multiple_of=64, description="Output width in pixels")
    height: int = Field(256, ge=256, le=2048, multiple_of=64, description="Output height in pixels")
    num_frames: int = Field(8, ge=8, le=128, description="Number of video frames")
    fps: int = Field(8, ge=1, le=60, description="Frames per second")


class VideoGenerationResponse(BaseModel):
    video_url: str
    local_path: str


class ComfyUIStatusResponse(BaseModel):
    available: bool
    url: str
    message: str
    image_ready: bool = False
    video_ready: bool = False
    missing: list[str] = Field(default_factory=list)


def _comfyui_input_options(input_spec) -> list:
    """Return the options from ComfyUI's input schema across API versions."""
    if not isinstance(input_spec, (list, tuple)) or not input_spec:
        return []
    # ComfyUI commonly returns ["COMBO", {"options": [...]}], but some
    # node versions return the choices list directly as the first item.
    if len(input_spec) > 1 and isinstance(input_spec[1], dict):
        options = input_spec[1].get("options")
        if isinstance(options, list):
            return options
    return input_spec[0] if isinstance(input_spec[0], list) else []


# ─── Routes ──────────────────────────────────────────────────────────────────


@router.post("/generate-video", response_model=VideoGenerationResponse)
async def generate_video(request: VideoGenerationRequest):
    """
    Generate a short video clip using ComfyUI + AnimateDiff.
    Requires ComfyUI to be running (either installed locally by Presenton,
    or at the URL set in COMFYUI_URL).
    """
    app_data_dir = os.getenv("APP_DATA_DIRECTORY", "/tmp")
    video_output_dir = os.path.join(get_exports_directory(), "videos")
    os.makedirs(video_output_dir, exist_ok=True)

    service = VideoGenerationService(output_directory=video_output_dir)

    try:
        local_path = await service.generate_video(
            prompt=request.prompt,
            workflow_json=request.workflow_json,
            width=request.width,
            height=request.height,
            num_frames=request.num_frames,
            fps=request.fps,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except TimeoutError as exc:
        raise HTTPException(
            status_code=504,
            detail=f"Video generation timed out: {exc}",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Video generation failed: {exc}",
        ) from exc

    # Build a URL the frontend can use
    rel_path = os.path.relpath(local_path, app_data_dir)
    video_url = absolute_fastapi_asset_url(f"/app_data/{rel_path.replace(os.sep, '/')}")

    return VideoGenerationResponse(video_url=video_url, local_path=local_path)


@router.get("/comfyui-status", response_model=ComfyUIStatusResponse)
async def comfyui_status():
    """Check whether the ComfyUI server is reachable."""
    import aiohttp

    url = (get_comfyui_url_env() or "http://127.0.0.1:8188").rstrip("/")
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{url}/system_stats",
                timeout=aiohttp.ClientTimeout(total=5),
            ) as resp:
                if resp.status == 200:
                    async with session.get(f"{url}/object_info", timeout=aiohttp.ClientTimeout(total=10)) as info_response:
                        info_response.raise_for_status()
                        info = await info_response.json()
                    required_checkpoint = info.get("CheckpointLoaderSimple", {}).get("input", {}).get("required", {})
                    required_motion = info.get("ADE_AnimateDiffLoaderGen1", {}).get("input", {}).get("required", {})
                    checkpoint = _comfyui_input_options(required_checkpoint.get("ckpt_name"))
                    motion = _comfyui_input_options(required_motion.get("model_name"))
                    missing = []
                    has_checkpoint = "v1-5-pruned-emaonly.safetensors" in checkpoint
                    if not has_checkpoint:
                        missing.append("SD 1.5 checkpoint: v1-5-pruned-emaonly.safetensors")
                    if "ADE_AnimateDiffLoaderGen1" not in info:
                        missing.append("ComfyUI-AnimateDiff-Evolved nodes")
                    if "VHS_VideoCombine" not in info:
                        missing.append("ComfyUI-VideoHelperSuite nodes")
                    if "mm_sd_v15_v2.ckpt" not in motion:
                        missing.append("AnimateDiff motion model: mm_sd_v15_v2.ckpt")
                    return ComfyUIStatusResponse(
                        available=True,
                        url=url,
                        message="ComfyUI is running",
                        image_ready=has_checkpoint,
                        video_ready=not missing,
                        missing=missing,
                    )
    except Exception as exc:
        return ComfyUIStatusResponse(
            available=False,
            url=url,
            message=f"ComfyUI not reachable: {exc}",
        )

    return ComfyUIStatusResponse(
        available=False, url=url, message="ComfyUI returned unexpected status"
    )


@router.post("/generate-image")
async def generate_local_image(
    prompt: str = Form(..., min_length=1, max_length=2000),
    width: int = Form(512, ge=256, le=768, multiple_of=64),
    height: int = Form(512, ge=256, le=768, multiple_of=64),
    strength: float = Form(0.65, ge=0.1, le=0.9),
    image: UploadFile | None = File(None),
):
    """Generate an image or edit an uploaded image with the local ComfyUI workflow."""
    import aiohttp
    from PIL import Image, ImageOps
    from services.image_generation_service import ImageGenerationService
    from services.local_media_workflows import image_workflow

    directory = get_images_directory()
    service = ImageGenerationService(directory)
    url = (get_comfyui_url_env() or "http://127.0.0.1:8188").rstrip("/")
    image_name = None
    if image is not None:
        upload = await image.read(12 * 1024 * 1024 + 1)
        if len(upload) > 12 * 1024 * 1024:
            raise HTTPException(413, "Choose an image smaller than 12 MB.")
        try:
            with Image.open(BytesIO(upload)) as source:
                if source.width * source.height > 40_000_000:
                    raise HTTPException(413, "The uploaded image is too large to edit locally.")
                source = ImageOps.exif_transpose(source)
                if source.mode == "RGBA":
                    background = Image.new("RGB", source.size, "white")
                    background.paste(source, mask=source.getchannel("A"))
                    source = background
                else:
                    source = source.convert("RGB")
                scale = min(1, 512 / max(source.size))
                resized = (max(64, int(source.width * scale) // 8 * 8), max(64, int(source.height * scale) // 8 * 8))
                if source.size != resized:
                    source = source.resize(resized, Image.Resampling.LANCZOS)
                prepared = BytesIO()
                source.save(prepared, format="PNG")
                upload = prepared.getvalue()
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(400, "Upload a valid PNG, JPEG, or WebP image.") from exc

    try:
        async with aiohttp.ClientSession() as session:
            if image is not None:
                form = aiohttp.FormData()
                form.add_field("image", upload, filename=f"presenton-edit-{uuid.uuid4().hex}.png", content_type="image/png")
                form.add_field("overwrite", "false")
                async with session.post(f"{url}/upload/image", data=form, timeout=aiohttp.ClientTimeout(total=60)) as response:
                    if response.status != 200:
                        raise RuntimeError(f"ComfyUI image upload returned {response.status}: {await response.text()}")
                    uploaded = await response.json()
                image_name = uploaded.get("name")
                if uploaded.get("subfolder"):
                    image_name = f"{uploaded['subfolder']}/{image_name}"
                if not image_name:
                    raise RuntimeError("ComfyUI did not return the uploaded image name")
            workflow = image_workflow(prompt.strip(), width, height, image_name, strength)
            prompt_id = await service._submit_comfyui_workflow(session, url, workflow)
            history = await service._wait_for_comfyui_completion(session, url, prompt_id)
            path = await service._download_comfyui_image(session, url, history, prompt_id, directory)
    except Exception as exc:
        raise HTTPException(502, f"Local image generation failed: {exc}") from exc
    return {"image_url": filesystem_image_path_to_app_data_url(path)}
