import os
import sys
import logging
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import httpx
from dotenv import load_dotenv

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("speaking_ai")

# .env 파일 로드
load_dotenv(override=True)

app = FastAPI(
    title="Speaking AI - Realtime Voice Agent API",
    description="Ultra-Low Latency Speech-to-Speech Realtime Agent Backend",
    version="1.0.0"
)

# CORS 설정 (프론트엔드 연동)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_masked_key(key: str) -> str:
    if not key or key == "your_openai_api_key_here":
        return "미설정 (Not Set)"
    if len(key) <= 8:
        return "****"
    return f"{key[:6]}...{key[-4:]}"

@app.get("/")
def read_root():
    api_key = os.getenv("OPENAI_API_KEY", "")
    has_key = bool(api_key and api_key != "your_openai_api_key_here")
    return {
        "status": "online",
        "service": "Speaking AI - Realtime Voice API",
        "api_key_configured": has_key,
        "masked_key": get_masked_key(api_key),
        "docs_url": "/docs"
    }

@app.get("/api/health")
def health_check():
    """
    프론트엔드 디버그 도구에서 백엔드 및 API 키 상태를 즉시 진단하기 위한 엔드포인트
    """
    api_key = os.getenv("OPENAI_API_KEY", "")
    is_set = bool(api_key and api_key != "your_openai_api_key_here")
    is_valid_format = is_set and (api_key.startswith("sk-") or api_key.startswith("sk-proj-"))

    return {
        "backend_status": "healthy",
        "port": 8000,
        "api_key_status": {
            "is_configured": is_set,
            "is_valid_prefix": is_valid_format,
            "masked_key": get_masked_key(api_key),
            "hint": "정상 설정됨" if is_valid_format else (
                "키가 입력되지 않았습니다. .env 파일에 올바른 OPENAI_API_KEY를 입력해주세요."
                if not is_set else "API 키 형식이 올바르지 않습니다 ('sk-'로 시작해야 함)."
            )
        }
    }

class SessionRequest(BaseModel):
    voice: Optional[str] = "alloy"  # alloy, ash, ballad, coral, echo, sage, shimmer, verse
    instructions: Optional[str] = None
    silence_duration_ms: Optional[int] = 300  # 초저지연을 위해 기본값 300ms 설정

@app.post("/api/session")
async def create_realtime_session(req: Optional[SessionRequest] = None):
    """
    브라우저가 OpenAI Realtime WebRTC에 직접 연결할 수 있는 초저지연 임시 세션 토큰을 생성합니다.
    """
    api_key = os.getenv("OPENAI_API_KEY", "")
    if not api_key or api_key == "your_openai_api_key_here":
        logger.error("세션 생성 실패: OPENAI_API_KEY가 설정되지 않음")
        raise HTTPException(
            status_code=400,
            detail="OPENAI_API_KEY가 설정되지 않았습니다. 프로젝트 루트의 .env 파일에 유효한 OpenAI API 키를 입력해주세요."
        )

    voice = req.voice if req and req.voice else "alloy"
    silence_duration = req.silence_duration_ms if req and req.silence_duration_ms else 300
    
    logger.info(f"세션 요청 수신: voice={voice}, silence_duration_ms={silence_duration}ms")

    default_instructions = (
        "You are an encouraging, friendly, and natural native English tutor. "
        "Engage in ultra-responsive, realistic spoken conversation. "
        "Keep your spoken replies concise, conversational, and energetic (1-3 sentences) "
        "so the flow of conversation feels fast and natural. "
        "If the user makes a clear grammatical mistake, gently provide the correct phrasing before continuing the topic."
    )
    instructions = req.instructions if req and req.instructions else default_instructions

    url = "https://api.openai.com/v1/realtime/client_secrets"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    # 초저지연(Ultra-Low Latency) 세션 구성
    payload = {
        "session": {
            "type": "realtime",
            "model": "gpt-realtime-2.1",
            "audio": {
                "input": {
                    "format": {
                        "type": "audio/pcm",
                        "rate": 24000
                    },
                    "turn_detection": {
                        "type": "server_vad",
                        "threshold": 0.5,             # 음성 감지 민감도
                        "prefix_padding_ms": 200,     # 발화 시작 버퍼 (말머리 잘림 방지)
                        "silence_duration_ms": silence_duration,  # 초저지연: 말이 멈춘 뒤 300ms 만에 응답 시작
                        "create_response": True
                    }
                },
                "output": {
                    "format": {
                        "type": "audio/pcm",
                        "rate": 24000
                    },
                    "voice": voice
                }
            },
            "instructions": instructions
        }
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code != 200:
                error_detail = resp.text
                try:
                    error_json = resp.json()
                    error_detail = error_json.get("error", {}).get("message", resp.text)
                except Exception:
                    pass
                logger.error(f"OpenAI API 에러 (HTTP {resp.status_code}): {error_detail}")
                raise HTTPException(status_code=resp.status_code, detail=f"OpenAI API 에러 ({resp.status_code}): {error_detail}")
            
            data = resp.json()
            # 최신 client_secrets 포맷(data.value) 및 기존 포맷(data.client_secret.value) 호환성 보장
            if isinstance(data, dict) and "value" in data and "client_secret" not in data:
                data["client_secret"] = {"value": data["value"]}
            logger.info("OpenAI Realtime 임시 세션 토큰 발급 성공!")
            return data
    except httpx.RequestError as e:
        logger.error(f"OpenAI 통신 장애: {str(e)}")
        raise HTTPException(status_code=502, detail=f"OpenAI 서버와 통신할 수 없습니다: {str(e)}")