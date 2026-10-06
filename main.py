import os
import sys
import time
import logging
import asyncio
from urllib.parse import urlparse

# Windows 환경에서 psycopg async 이벤트 루프 호환성 설정
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from datetime import datetime, timezone, timedelta
from fastapi import FastAPI, HTTPException, Request, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict, Any
import httpx
from dotenv import load_dotenv
import psycopg
from psycopg.rows import dict_row
import bcrypt
import jwt

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
    description="Ultra-Low Latency Speech-to-Speech Realtime Agent Backend with Supabase DB",
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

def get_masked_db_url(url: str) -> str:
    if not url:
        return "미설정 (Not Set)"
    try:
        parsed = urlparse(url)
        netloc = ""
        if parsed.username:
            netloc += parsed.username
            if parsed.password:
                netloc += ":****"
            netloc += "@"
        if parsed.hostname:
            netloc += parsed.hostname
        if parsed.port:
            netloc += f":{parsed.port}"
        return f"{parsed.scheme}://{netloc}{parsed.path}"
    except Exception:
        return "설정됨 (마스킹 처리됨)"

def get_db_url() -> str:
    # SUPABASE_BASE_URL(postgresql://), SUPABASE_DB_URL, DATABASE_URL, POSTGRES_URL 모두 지원
    candidate_urls = [
        os.getenv("SUPABASE_BASE_URL", ""),
        os.getenv("SUPABASE_DB_URL", ""),
        os.getenv("DATABASE_URL", ""),
        os.getenv("POSTGRES_URL", ""),
        os.getenv("PUBLIC_SUPABASE_DB_URL", "")
    ]
    # postgresql:// 로 시작하는 URI 우선 탐색
    for u in candidate_urls:
        val = u.strip()
        if val and (val.startswith("postgres://") or val.startswith("postgresql://")):
            return val
    # 일반 candidate 반환
    for u in candidate_urls:
        val = u.strip()
        if val:
            return val
    return ""

def get_db_connection():
    db_url = get_db_url()
    if not db_url:
        raise HTTPException(
            status_code=400,
            detail="SUPABASE_BASE_URL(또는 SUPABASE_DB_URL/DATABASE_URL)이 환경 변수에 설정되지 않았습니다."
        )
    if db_url.startswith("http://") or db_url.startswith("https://"):
        raise HTTPException(
            status_code=400,
            detail="현재 설정된 URL은 Supabase REST API 주소(https://...)입니다. PostgreSQL DB 직접 접속을 위해서는 'postgresql://postgres:[PASSWORD]@...' 형태의 URI를 입력해야 합니다."
        )
    return psycopg.connect(db_url, row_factory=dict_row)


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


# ==========================================
# Supabase PostgreSQL Database Test APIs
# ==========================================

class RecordCreateRequest(BaseModel):
    title: str
    content: Optional[str] = ""

@app.get("/api/db/status")
def get_db_status():
    """
    Supabase PostgreSQL 연결 상태를 테스트하고 기본 정보 및 public 테이블 목록을 반환합니다.
    """
    db_url = get_db_url()
    if not db_url:
        return {
            "connected": False,
            "error": "SUPABASE_DB_URL이 .env 파일에 설정되어 있지 않습니다.",
            "masked_url": "미설정"
        }

    start_time = time.perf_counter()
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # 1. DB 버전 및 현재 시간 확인
                cur.execute("SELECT version(), current_database(), now();")
                info = cur.fetchone()
                
                # 2. public 스키마 내의 사용자 테이블 목록 조회
                cur.execute("""
                    SELECT table_name 
                    FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    ORDER BY table_name;
                """)
                tables = [row["table_name"] for row in cur.fetchall()]
                
                # 3. test_records 테이블 존재 여부 및 레코드 수
                has_test_table = "test_records" in tables
                record_count = 0
                if has_test_table:
                    cur.execute("SELECT count(*) as cnt FROM public.test_records;")
                    count_row = cur.fetchone()
                    record_count = count_row["cnt"] if count_row else 0

        latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
        
        return {
            "connected": True,
            "masked_url": get_masked_db_url(db_url),
            "latency_ms": latency_ms,
            "database_name": info["current_database"] if info else "postgres",
            "server_time": str(info["now"]) if info else "",
            "version": info["version"] if info else "",
            "public_tables": tables,
            "has_test_records_table": has_test_table,
            "test_records_count": record_count
        }
    except Exception as e:
        latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
        logger.error(f"Supabase DB 연결 실패: {str(e)}")
        return {
            "connected": False,
            "masked_url": get_masked_db_url(db_url),
            "latency_ms": latency_ms,
            "error": str(e)
        }

@app.get("/api/db/records")
def get_records():
    """
    public.test_records 테이블의 모든 레코드를 조회합니다.
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # 테이블 존재 여부 확인
                cur.execute("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_schema = 'public' AND table_name = 'test_records'
                    );
                """)
                exists = cur.fetchone()["exists"]
                if not exists:
                    return {
                        "table_exists": False,
                        "message": "public.test_records 테이블이 아직 생성되지 않았습니다. 제공된 SQL을 Supabase에서 실행해주세요.",
                        "records": []
                    }

                cur.execute("SELECT id, title, content, created_at, updated_at FROM public.test_records ORDER BY created_at DESC;")
                rows = cur.fetchall()
                
                # datetime 객체를 ISO 문자열로 변환
                records = []
                for r in rows:
                    records.append({
                        "id": str(r["id"]),
                        "title": r["title"],
                        "content": r["content"],
                        "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                        "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None
                    })
                    
                return {
                    "table_exists": True,
                    "count": len(records),
                    "records": records
                }
    except Exception as e:
        logger.error(f"레코드 조회 실패: {str(e)}")
        raise HTTPException(status_code=500, detail=f"DB 조회 실패: {str(e)}")

@app.post("/api/db/records")
def create_record(req: RecordCreateRequest):
    """
    public.test_records 테이블에 새 테스트 레코드를 추가합니다.
    """
    if not req.title or not req.title.strip():
        raise HTTPException(status_code=400, detail="title은 필수 항목입니다.")
        
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO public.test_records (title, content)
                    VALUES (%s, %s)
                    RETURNING id, title, content, created_at;
                    """,
                    (req.title.strip(), req.content.strip() if req.content else "")
                )
                new_record = cur.fetchone()
                conn.commit()
                
                return {
                    "success": True,
                    "record": {
                        "id": str(new_record["id"]),
                        "title": new_record["title"],
                        "content": new_record["content"],
                        "created_at": new_record["created_at"].isoformat() if new_record["created_at"] else None
                    }
                }
    except Exception as e:
        logger.error(f"레코드 추가 실패: {str(e)}")
        raise HTTPException(status_code=500, detail=f"DB 저장 실패: {str(e)}")

@app.delete("/api/db/records/{record_id}")
def delete_record(record_id: str):
    """
    public.test_records 테이블의 특정 레코드를 삭제합니다.
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM public.test_records WHERE id = %s RETURNING id;",
                    (record_id,)
                )
                deleted = cur.fetchone()
                conn.commit()
                
                if not deleted:
                    raise HTTPException(status_code=404, detail="해당 ID의 레코드를 찾을 수 없습니다.")
                    
                return {"success": True, "deleted_id": str(deleted["id"])}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"레코드 삭제 실패: {str(e)}")
        raise HTTPException(status_code=500, detail=f"DB 삭제 실패: {str(e)}")

@app.post("/api/db/init-table")
def init_test_table():
    """
    웹 UI에서 원클릭으로 public.test_records 테이블을 직접 생성할 수 있는 엔드포인트입니다.
    """
    create_sql = """
    CREATE TABLE IF NOT EXISTS public.test_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(255) NOT NULL,
        content TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    INSERT INTO public.test_records (title, content)
    SELECT 'Supabase 연결 성공!', 'FastAPI와 Supabase PostgreSQL이 정상적으로 통신 중입니다.'
    WHERE NOT EXISTS (SELECT 1 FROM public.test_records LIMIT 1);
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(create_sql)
                conn.commit()
        return {"success": True, "message": "public.test_records 테이블이 성공적으로 생성되었습니다!"}
    except Exception as e:
        logger.error(f"테이블 생성 실패: {str(e)}")
        raise HTTPException(status_code=500, detail=f"테이블 생성 실패: {str(e)}")


# ==========================================
# Authentication & User Management APIs
# ==========================================

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "speaking-ai-secure-jwt-key-2026-super-secret-random-32bytes")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7

security = HTTPBearer(auto_error=False)

def init_users_table_if_needed():
    """앱 시작 시 또는 필요 시 users 테이블 자동 생성"""
    db_url = get_db_url()
    if not db_url or db_url.startswith("http"):
        return
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                CREATE TABLE IF NOT EXISTS public.users (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    email VARCHAR(255) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    name VARCHAR(100) NOT NULL,
                    avatar_url TEXT DEFAULT '',
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );
                """)
                conn.commit()
    except Exception as e:
        logger.warning(f"users 테이블 확인 중 경고: {str(e)}")

# 초기화 실행
try:
    init_users_table_if_needed()
except Exception:
    pass

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False

def create_access_token(user_id: str, email: str, name: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": user_id,
        "email": email,
        "name": name,
        "exp": expire,
        "iat": datetime.now(timezone.utc)
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)

def decode_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except Exception:
        return None

async def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> dict:
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="인증 토큰이 제공되지 않았습니다. 로그인 후 다시 시도해주세요.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = credentials.credentials
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="유효하지 않거나 만료된 인증 토큰입니다. 다시 로그인해주세요.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user_id = payload["sub"]
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, email, name, avatar_url, created_at FROM public.users WHERE id = %s;",
                    (user_id,)
                )
                user = cur.fetchone()
                if not user:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="존재하지 않는 사용자 계정입니다.",
                        headers={"WWW-Authenticate": "Bearer"},
                    )
                return {
                    "id": str(user["id"]),
                    "email": user["email"],
                    "name": user["name"],
                    "avatar_url": user["avatar_url"] or "",
                    "created_at": user["created_at"].isoformat() if user["created_at"] else None
                }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"사용자 인증 조회 실패: {str(e)}")
        raise HTTPException(status_code=500, detail="데이터베이스 조회 중 오류가 발생했습니다.")


class UserRegisterRequest(BaseModel):
    email: str = Field(..., description="이메일 주소")
    password: str = Field(..., min_length=6, description="비밀번호 (6자 이상)")
    name: str = Field(..., min_length=1, max_length=50, description="사용자 이름 / 닉네임")

class UserLoginRequest(BaseModel):
    email: str = Field(..., description="이메일 주소")
    password: str = Field(..., description="비밀번호")


@app.post("/api/auth/register")
def register_user(req: UserRegisterRequest):
    """
    신규 회원가입 엔드포인트:
    - 이메일 중복 검사
    - bcrypt 비밀번호 암호화 저장
    - JWT 토큰 자동 발급
    """
    email = req.email.strip().lower()
    name = req.name.strip()
    password = req.password

    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="올바른 이메일 주소를 입력해주세요.")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="비밀번호는 최소 6자 이상이어야 합니다.")
    if not name:
        raise HTTPException(status_code=400, detail="이름(닉네임)을 입력해주세요.")

    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # 테이블 없을 시 자동 생성
                cur.execute("""
                CREATE TABLE IF NOT EXISTS public.users (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    email VARCHAR(255) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    name VARCHAR(100) NOT NULL,
                    avatar_url TEXT DEFAULT '',
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );
                """)

                # 1. 이메일 중복 확인
                cur.execute("SELECT id FROM public.users WHERE email = %s;", (email,))
                existing = cur.fetchone()
                if existing:
                    raise HTTPException(status_code=400, detail="이미 가입된 이메일 주소입니다. 로그인을 시도해주세요.")

                # 2. 비밀번호 암호화 및 유저 생성
                hashed_pw = hash_password(password)
                cur.execute(
                    """
                    INSERT INTO public.users (email, password_hash, name, avatar_url)
                    VALUES (%s, %s, %s, %s)
                    RETURNING id, email, name, avatar_url, created_at;
                    """,
                    (email, hashed_pw, name, "")
                )
                new_user = cur.fetchone()
                conn.commit()

                user_id = str(new_user["id"])
                token = create_access_token(user_id=user_id, email=email, name=name)

                return {
                    "success": True,
                    "message": "회원가입이 완료되었습니다!",
                    "token": token,
                    "user": {
                        "id": user_id,
                        "email": new_user["email"],
                        "name": new_user["name"],
                        "avatar_url": new_user["avatar_url"] or "",
                        "created_at": new_user["created_at"].isoformat() if new_user["created_at"] else None
                    }
                }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"회원가입 처리 실패: {str(e)}")
        raise HTTPException(status_code=500, detail=f"회원가입 처리 중 오류가 발생했습니다: {str(e)}")


@app.post("/api/auth/login")
def login_user(req: UserLoginRequest):
    """
    로그인 엔드포인트:
    - 이메일 존재 여부 확인
    - bcrypt 비밀번호 검증
    - JWT 토큰 발급
    """
    email = req.email.strip().lower()
    password = req.password

    if not email or not password:
        raise HTTPException(status_code=400, detail="이메일과 비밀번호를 모두 입력해주세요.")

    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # 유저 조회
                cur.execute(
                    "SELECT id, email, password_hash, name, avatar_url, created_at FROM public.users WHERE email = %s;",
                    (email,)
                )
                user = cur.fetchone()
                if not user:
                    raise HTTPException(status_code=400, detail="가입되지 않은 이메일이거나 비밀번호가 일치하지 않습니다.")

                if not verify_password(password, user["password_hash"]):
                    raise HTTPException(status_code=400, detail="가입되지 않은 이메일이거나 비밀번호가 일치하지 않습니다.")

                user_id = str(user["id"])
                token = create_access_token(user_id=user_id, email=user["email"], name=user["name"])

                return {
                    "success": True,
                    "message": f"{user['name']}님, 환영합니다!",
                    "token": token,
                    "user": {
                        "id": user_id,
                        "email": user["email"],
                        "name": user["name"],
                        "avatar_url": user["avatar_url"] or "",
                        "created_at": user["created_at"].isoformat() if user["created_at"] else None
                    }
                }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"로그인 처리 실패: {str(e)}")
        raise HTTPException(status_code=500, detail=f"로그인 처리 중 오류가 발생했습니다: {str(e)}")


@app.get("/api/auth/me")
def get_my_profile(current_user: dict = Depends(get_current_user)):
    """
    현재 로그인한 사용자 프로필 조회 (토큰 검증)
    """
    return {
        "success": True,
        "user": current_user
    }