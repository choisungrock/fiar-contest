# K-라이스페스타 품평회 시스템의 메인 FastAPI 진입점 및 API 요청 처리 파일
import os
from fastapi import FastAPI, HTTPException, Header, Depends, Request
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError

# 분리된 API 라우터 임포트
from api.admin.router import router as admin_router
from api.user.router import router as user_router

from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html
from fastapi.openapi.utils import get_openapi

app = FastAPI(title="K-Rice Festa Evaluation System API", docs_url=None, redoc_url=None, openapi_url=None)

# ALLOWED_ORIGINS 환경 변수 파싱 및 보정
origins_env = os.getenv("ALLOWED_ORIGINS", "")
allow_origins_list = []
if origins_env:
    parts = origins_env.split(",")
    for p in parts:
        p = p.strip()
        if not p:
            continue
        # 오타 부분 보정: "http://127.0.0.1:18001://127.0.0.1:18002" 형태로 결합된 항목 분리
        if "://" in p:
            proto, rest = p.split("://", 1)
            if "://" in rest:
                subparts = rest.split("://")
                allow_origins_list.append(f"{proto}://{subparts[0]}")
                allow_origins_list.append(f"{proto}://{subparts[1]}")
            else:
                allow_origins_list.append(p)
        else:
            allow_origins_list.append(p)
else:
    allow_origins_list = ["*"]

# CORS 미들웨어 등록
app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import logging

# 기본 logging 설정 및 오리지널 IP 수집을 위한 로거 구성
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("api_access")

@app.middleware("http")
async def log_requests(request: Request, call_next):
    # Cloudflare의 CF-Connecting-IP 헤더가 있으면 사용하고, 없으면 일반 client.host 사용
    real_ip = request.headers.get("cf-connecting-ip") or (request.client.host if request.client else "unknown")
    
    response = await call_next(request)
    
    logger.info(f"IP: {real_ip} | Method: {request.method} | Path: {request.url.path} | Status: {response.status_code}")
    return response

def verify_admin_api_secret(x_admin_api_secret: Optional[str] = Header(None)):
    secret = os.getenv("ADMIN_API_SECRET", "").strip()
    if not secret:
        return
    if x_admin_api_secret != secret:
        raise HTTPException(status_code=403, detail="Invalid Admin API Secret")

# 라우터 등록 및 경로 접두사(Prefix) 분리 (관리자 API에는 Secret 검증 종속성 추가)
app.include_router(admin_router, prefix="/api/admin", tags=["Admin"], dependencies=[Depends(verify_admin_api_secret)])
app.include_router(user_router, prefix="/api/user", tags=["User"])

def is_localhost(request: Request) -> bool:
    # Cloudflare의 CF-Connecting-IP 헤더가 있다면, 이는 외부 프록시를 거쳐 온 실제 외부 사용자이므로 localhost가 아님
    cf_ip = request.headers.get("cf-connecting-ip")
    if cf_ip:
        if cf_ip not in ("127.0.0.1", "::1"):
            return False
            
    client_host = request.client.host if request.client else ""
    if client_host in ("127.0.0.1", "::1"):
        return True
    host_header = request.headers.get("host", "").strip().lower()
    if host_header.startswith("localhost") or host_header.startswith("127.0.0.1"):
        return True
    return False

@app.get("/docs", include_in_schema=False)
def custom_swagger_ui_html(request: Request):
    if not is_localhost(request):
        raise HTTPException(status_code=403, detail="Access Denied: API Docs are only accessible from localhost.")
    return get_swagger_ui_html(
        openapi_url="/openapi.json",
        title=app.title + " - Swagger UI",
        oauth2_redirect_url=app.swagger_ui_oauth2_redirect_url,
        swagger_js_url="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js",
        swagger_css_url="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css",
    )

@app.get("/openapi.json", include_in_schema=False)
def get_open_api_endpoint(request: Request):
    if not is_localhost(request):
        raise HTTPException(status_code=403, detail="Access Denied: API Docs are only accessible from localhost.")
    return get_openapi(title=app.title, version="1.0.0", routes=app.routes)

@app.get("/redoc", include_in_schema=False)
def custom_redoc_html(request: Request):
    if not is_localhost(request):
        raise HTTPException(status_code=403, detail="Access Denied: API Docs are only accessible from localhost.")
    return get_redoc_html(
        openapi_url="/openapi.json",
        title=app.title + " - ReDoc",
        redoc_js_url="https://cdn.jsdelivr.net/npm/redoc@next/bundles/redoc.standalone.js",
    )

# 환경변수로부터 데이터베이스 URL 정보 획득
DATABASE_URL = os.getenv("DATABASE_URL", "mysql+pymysql://fair_user:fair_password@db:3306/fair_db")

# SQLAlchemy DB 엔진 초기화
try:
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
except Exception as e:
    engine = None
    print(f"데이터베이스 연결 설정 실패: {e}")

@app.get("/")
def read_root():
    """기본 서버 헬스체크 API"""
    return {
        "status": "healthy",
        "message": "K-라이스페스타 품평회 평가 API 서버가 정상 동작 중입니다."
    }

@app.get("/db-check")
def check_db_connection():
    """MySQL 데이터베이스 접속 상태 확인 API"""
    if not engine:
        raise HTTPException(status_code=500, detail="데이터베이스 엔진이 활성화되지 않았습니다.")
    
    try:
        # SELECT 1 쿼리를 통해 연결 검증
        with engine.connect() as connection:
            result = connection.execute(text("SELECT 1"))
            val = result.scalar()
            if val == 1:
                return {
                    "database": "connected",
                    "message": "MySQL 데이터베이스(fair_db) 연결에 성공하였습니다."
                }
            else:
                raise HTTPException(status_code=500, detail="데이터베이스 연결 응답이 정상적이지 않습니다.")
    except SQLAlchemyError as e:
        raise HTTPException(status_code=500, detail=f"데이터베이스 연결 오류 발생: {str(e)}")
