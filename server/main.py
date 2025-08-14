from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any
from .ai import suggest_definition

app = FastAPI(title="Schema GUI AI API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # dev-friendly; tighten for prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SuggestReq(BaseModel):
    instruction: str

@app.post("/ai/suggest")
async def ai_suggest(req: SuggestReq) -> Dict[str, Any]:
    return await suggest_definition(req.instruction)
