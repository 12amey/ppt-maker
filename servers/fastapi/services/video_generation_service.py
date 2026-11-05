"""
Video Generation Service for Presenton
Integrates with ComfyUI to generate short video clips from text prompts.
Supports AnimateDiff (SD1.5-based) and CogVideoX workflows.
"""

import asyncio
import json
import os
import uuid
import aiohttp
from typing import Optional

from utils.get_env import get_comfyui_url_env, get_comfyui_video_workflow_env


# ─── Default AnimateDiff workflow ────────────────────────────────────────────

DEFAULT_VIDEO_WORKFLOW = {
    "1": {
        "inputs": {"ckpt_name": "v1-5-pruned-emaonly.safetensors"},
        "class_type": "CheckpointLoaderSimple",
        "_meta": {"title": "Load Checkpoint"},
    },
    "2": {
        "inputs": {
            "text": "A beautiful smooth cinematic scene",
            "clip": ["1", 1],
        },
        "class_type": "CLIPTextEncode",
        "_meta": {"title": "Input Prompt"},
    },
    "3": {
        "inputs": {
            "text": "blurry, static, low quality, text, watermark",
            "clip": ["1", 1],
        },
        "class_type": "CLIPTextEncode",
        "_meta": {"title": "Negative Prompt"},
    },
    "4": {
        "inputs": {
            "model_name": "mm_sd_v15_v2.ckpt",
            "beta_schedule": "autoselect",
            "model": ["1", 0],
        },
        "class_type": "ADE_AnimateDiffLoaderGen1",
        "_meta": {"title": "AnimateDiff Loader"},
    },
    "6": {
        "inputs": {"width": 512, "height": 512, "batch_size": 16},
        "class_type": "EmptyLatentImage",
        "_meta": {"title": "Empty Latent Image"},
    },
    "7": {
        "inputs": {
            "seed": 42,
            "steps": 20,
            "cfg": 7.5,
            "sampler_name": "euler_ancestral",
            "scheduler": "normal",
            "denoise": 1.0,
            "model": ["4", 0],
            "positive": ["2", 0],
            "negative": ["3", 0],
            "latent_image": ["6", 0],
        },
        "class_type": "KSampler",
        "_meta": {"title": "KSampler"},
    },
    "8": {
        "inputs": {"samples": ["7", 0], "vae": ["1", 2]},
        "class_type": "VAEDecode",
        "_meta": {"title": "VAE Decode"},
    },
    "9": {
        "inputs": {
            "frame_rate": 8,
            "loop_count": 0,
            "pingpong": False,
            "save_output": True,
            "filename_prefix": "presenton_video",
            "format": "video/h264-mp4",
            "pix_fmt": "yuv420p",
            "crf": 19,
            "save_metadata": True,
            "images": ["8", 0],
        },
        "class_type": "VHS_VideoCombine",
        "_meta": {"title": "Video Combine"},
    },
}


class VideoGenerationService:
    """Generates short video clips via ComfyUI (AnimateDiff workflow)."""

    def __init__(self, output_directory: str):
        self.output_directory = output_directory

    # ── Public API ────────────────────────────────────────────────────────────

    async def generate_video(
        self,
        prompt: str,
        workflow_json: Optional[str] = None,
        width: int = 512,
        height: int = 512,
        num_frames: int = 16,
        fps: int = 8,
    ) -> str:
        """
        Generate a video clip from a text prompt using ComfyUI.

        Args:
            prompt: Text description of the video.
            workflow_json: Optional custom ComfyUI workflow JSON string.
                           Falls back to the bundled AnimateDiff workflow.
            width: Output width in pixels.
            height: Output height in pixels.
            num_frames: Number of frames (default 16 ≈ 2 s at 8 fps).
            fps: Frames per second for the output video.

        Returns:
            Absolute path to the generated MP4 file.
        """
        comfyui_url = (get_comfyui_url_env() or "http://127.0.0.1:8188").rstrip("/")

        # Load workflow
        workflow_json = workflow_json or get_comfyui_video_workflow_env()
        if workflow_json:
            try:
                workflow = json.loads(workflow_json)
            except json.JSONDecodeError as exc:
                raise ValueError(f"Invalid workflow JSON: {exc}") from exc
        else:
            import copy
            workflow = copy.deepcopy(DEFAULT_VIDEO_WORKFLOW)

        if not isinstance(workflow, dict) or not workflow or any(
            not isinstance(node, dict) or not isinstance(node.get("class_type"), str)
            for node in workflow.values()
        ):
            raise ValueError("Use an API-format workflow exported by ComfyUI (no comments or UI nodes).")

        # Inject prompt
        workflow = self._inject_prompt(workflow, prompt)

        # Inject size and frame count
        self._inject_latent_size(workflow, width, height, num_frames)

        # Inject FPS
        self._inject_fps(workflow, fps)

        # Randomize seed
        self._randomize_seeds(workflow)

        async with aiohttp.ClientSession(trust_env=True) as session:
            prompt_id = await self._submit_workflow(session, comfyui_url, workflow)
            history = await self._wait_for_completion(session, comfyui_url, prompt_id)
            video_path = await self._download_output(
                session, comfyui_url, history, prompt_id
            )

        return video_path

    # ── Workflow Manipulation ─────────────────────────────────────────────────

    def _inject_prompt(self, workflow: dict, prompt: str) -> dict:
        """Inject the text prompt into the 'Input Prompt' node."""
        for node in workflow.values():
            if not isinstance(node, dict):
                continue
            meta = node.get("_meta", {})
            if isinstance(meta, dict) and meta.get("title", "").lower() == "input prompt":
                inputs = node.get("inputs", {})
                for key in ("text", "value", "prompt", "string"):
                    if key in inputs and isinstance(inputs[key], str):
                        inputs[key] = prompt
                        return workflow
        raise ValueError(
            "No 'Input Prompt' node found in workflow. "
            "Rename your prompt text node title to 'Input Prompt'."
        )

    def _inject_latent_size(
        self, workflow: dict, width: int, height: int, batch_size: int
    ) -> None:
        """Set width, height, batch_size on EmptyLatentImage nodes."""
        for node in workflow.values():
            if not isinstance(node, dict):
                continue
            class_type = str(node.get("class_type", ""))
            if "EmptyLatentImage" in class_type or "EmptySD3LatentImage" in class_type:
                inputs = node.get("inputs", {})
                if isinstance(inputs, dict):
                    if isinstance(inputs.get("width"), int):
                        inputs["width"] = width
                    if isinstance(inputs.get("height"), int):
                        inputs["height"] = height
                    if isinstance(inputs.get("batch_size"), int):
                        inputs["batch_size"] = batch_size

    def _inject_fps(self, workflow: dict, fps: int) -> None:
        """Set frame_rate on VHS_VideoCombine nodes."""
        for node in workflow.values():
            if not isinstance(node, dict):
                continue
            if node.get("class_type") == "VHS_VideoCombine":
                inputs = node.get("inputs", {})
                if isinstance(inputs, dict):
                    inputs["frame_rate"] = fps

    def _randomize_seeds(self, workflow: dict) -> None:
        """Randomize all seed inputs for unique outputs."""
        import secrets
        for node in workflow.values():
            if not isinstance(node, dict):
                continue
            inputs = node.get("inputs", {})
            if isinstance(inputs, dict):
                for key in list(inputs.keys()):
                    if "seed" in key.lower() and isinstance(inputs[key], int):
                        inputs[key] = secrets.randbelow(0xFFFFFFFF)

    # ── ComfyUI HTTP Client ───────────────────────────────────────────────────

    async def _submit_workflow(
        self, session: aiohttp.ClientSession, base_url: str, workflow: dict
    ) -> str:
        client_id = str(uuid.uuid4())
        payload = {"prompt": workflow, "client_id": client_id}
        async with session.post(
            f"{base_url}/prompt",
            json=payload,
            timeout=aiohttp.ClientTimeout(total=30),
        ) as resp:
            if resp.status != 200:
                text = await resp.text()
                raise RuntimeError(f"ComfyUI /prompt returned {resp.status}: {text}")
            body = await resp.json()
            prompt_id = body.get("prompt_id")
            if not prompt_id:
                raise RuntimeError(f"No prompt_id in response: {body}")
            return prompt_id

    async def _wait_for_completion(
        self,
        session: aiohttp.ClientSession,
        base_url: str,
        prompt_id: str,
        timeout_s: int = 600,
        poll_interval_s: float = 2.0,
    ) -> dict:
        deadline = asyncio.get_event_loop().time() + timeout_s
        while asyncio.get_event_loop().time() < deadline:
            async with session.get(
                f"{base_url}/history/{prompt_id}",
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status == 200:
                    history = await resp.json()
                    if prompt_id in history:
                        entry = history[prompt_id]
                        status = entry.get("status", {})
                        if status.get("status_str") == "error":
                            msgs = status.get("messages", [])
                            raise RuntimeError(f"ComfyUI workflow error: {msgs}")
                        if status.get("completed"):
                            return entry
            await asyncio.sleep(poll_interval_s)
        raise TimeoutError(f"ComfyUI video generation timed out after {timeout_s}s")

    async def _download_output(
        self,
        session: aiohttp.ClientSession,
        base_url: str,
        history_entry: dict,
        prompt_id: str,
    ) -> str:
        """Find the video output in history and download it locally."""
        outputs = history_entry.get("outputs", {})
        for node_id, node_output in outputs.items():
            # VHS_VideoCombine outputs under "gifs" or "videos"
            for key in ("gifs", "videos", "images"):
                items = node_output.get(key, [])
                for item in items:
                    filename = item.get("filename", "")
                    subfolder = item.get("subfolder", "")
                    filetype = item.get("type", "output")
                    if filename.lower().endswith((".mp4", ".webm", ".mov")):
                        return await self._download_file(
                            session, base_url, filename, subfolder, filetype
                        )

        raise RuntimeError("No video output found in ComfyUI history.")

    async def _download_file(
        self,
        session: aiohttp.ClientSession,
        base_url: str,
        filename: str,
        subfolder: str,
        filetype: str,
    ) -> str:
        params = {"filename": filename, "subfolder": subfolder, "type": filetype}
        async with session.get(
            f"{base_url}/view",
            params=params,
            timeout=aiohttp.ClientTimeout(total=120),
        ) as resp:
            if resp.status != 200:
                text = await resp.text()
                raise RuntimeError(
                    f"Failed to download video from ComfyUI: {resp.status} {text}"
                )
            ext = os.path.splitext(filename)[1] or ".mp4"
            local_path = os.path.join(self.output_directory, f"{uuid.uuid4()}{ext}")
            os.makedirs(self.output_directory, exist_ok=True)
            with open(local_path, "wb") as f:
                async for chunk in resp.content.iter_chunked(65536):
                    f.write(chunk)
            return local_path
