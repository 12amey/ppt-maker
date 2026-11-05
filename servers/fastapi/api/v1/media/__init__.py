from fastapi import APIRouter
from api.v1.media.router import router as media_router

router = APIRouter()
router.include_router(media_router)
