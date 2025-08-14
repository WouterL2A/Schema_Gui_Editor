from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional
from .ai import suggest_definition

app = FastAPI(title="Schema GUI AI API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # dev; tighten for prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SuggestReq(BaseModel):
    instruction: str = Field(..., description="Natural language request")
    mode: str = Field("new_definition", pattern="^(new_definition|extend_entity)$")
    schema_ctx: Dict[str, Any] = Field(default_factory=dict, description="Current full schema.json")
    target_entity: Optional[str] = None
    temperature: float = 0.2

@app.post("/ai/suggest")
async def ai_suggest(req: SuggestReq) -> Dict[str, Any]:
    return await suggest_definition(
        instruction=req.instruction,
        mode=req.mode,
        schema_ctx=req.schema_ctx or {},
        target=req.target_entity,
        temperature=req.temperature,
    )
