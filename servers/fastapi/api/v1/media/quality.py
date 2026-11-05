import asyncio
import os
import uuid

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from services.presentation_quality import analyze_presentation
from utils.asset_directory_utils import absolute_fastapi_asset_url, get_exports_directory
from utils.get_env import get_app_data_directory_env

router = APIRouter(prefix="/quality", tags=["Quality analysis"])


async def _read_pptx(file: UploadFile) -> bytes:
    if not (file.filename or "").lower().endswith(".pptx"):
        raise HTTPException(400, "Please upload a .pptx file")
    content = await file.read(40 * 1024 * 1024 + 1)
    if len(content) > 40 * 1024 * 1024:
        raise HTTPException(413, "Maximum file size is 40 MB")
    return content


@router.post("/analyze")
async def analyze(file: UploadFile = File(...), approved_template: UploadFile | None = File(None), fix: bool = Form(False)):
    content = await _read_pptx(file)
    approved = await _read_pptx(approved_template) if approved_template else None
    try:
        report, corrected = await asyncio.to_thread(analyze_presentation, content, approved, fix)
    except (ValueError, TypeError) as exc:
        raise HTTPException(400, str(exc)) from exc
    report["filename"] = file.filename
    if corrected:
        path = os.path.join(get_exports_directory(), f"quality-{uuid.uuid4()}.pptx")
        with open(path, "wb") as output:
            output.write(corrected)
        relative = os.path.relpath(path, get_app_data_directory_env()).replace(os.sep, "/")
        report["corrected_url"] = absolute_fastapi_asset_url(f"/app_data/{relative}")
    return report
