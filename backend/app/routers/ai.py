from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from app.models.schemas import AIChatRequest
from app.services.ai_service import ai_service

router = APIRouter(
    prefix="/api/ai",
    tags=["AI"]
)

@router.post("/chat")
async def chat_with_ai(request: AIChatRequest):
    return StreamingResponse(
        ai_service.ask_stream(request.message),
        media_type="text/plain"
    )
