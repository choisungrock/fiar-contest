# K-라이스페스타 품평회 시스템의 메인 FastAPI 진입점 및 API 요청 처리 파일
import os
from fastapi import FastAPI, HTTPException, Header, Depends, Request
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError

# 분리된 API 라우터 임포트
from api.admin.router import router as admin_router
from api.user.router import router as user_router

from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from typing import Optional
from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html
from fastapi.openapi.utils import get_openapi

app = FastAPI(title="K-Rice Festa Evaluation System API", docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(GZipMiddleware, minimum_size=1000)

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

# SQLAlchemy DB 엔진 초기화 및 스키마 자동 마이그레이션
try:
    engine = create_engine(DATABASE_URL, pool_size=20, max_overflow=30, pool_pre_ping=True, pool_recycle=3600)
except Exception as e:
    engine = None
    print(f"데이터베이스 연결 설정 실패: {e}")

def init_db_schema():
    """서버 시작 시 필요 신규 테이블 및 마이그레이션 자동 실행 (운영 서버 deploy.sh 실행 시 자동 처리)"""
    if not engine:
        return
    
    # 1. fair_judge_buman 매핑 테이블 독립 자동 생성
    try:
        with engine.connect() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS fair_judge_buman (
                  fjb_id INT AUTO_INCREMENT PRIMARY KEY,
                  fjb_fb_id INT NOT NULL,
                  fjb_fj_id INT NOT NULL,
                  FOREIGN KEY (fjb_fb_id) REFERENCES fair_buman(fb_id) ON DELETE CASCADE,
                  FOREIGN KEY (fjb_fj_id) REFERENCES fair_judge(fj_id) ON DELETE CASCADE,
                  UNIQUE KEY uq_fjb (fjb_fb_id, fjb_fj_id)
                ) ENGINE=InnoDB;
            """))
            conn.commit()
            print("✅ [DB Schema Init] fair_judge_buman 테이블 생성 완료")
    except Exception as ex1:
        print(f"⚠️ [DB Schema Init] fair_judge_buman 생성 알림: {ex1}")

    # 2. fair_score_record 컬럼 타입 VARCHAR(50) 지원 변경 (독립 수행)
    try:
        with engine.connect() as conn:
            try:
                conn.execute(text("ALTER TABLE fair_score_record DROP FOREIGN KEY fair_score_record_ibfk_3;"))
                conn.commit()
            except Exception:
                pass
            try:
                conn.execute(text("ALTER TABLE fair_score_record MODIFY fsr_fei_id VARCHAR(50) NOT NULL;"))
                conn.commit()
            except Exception as alter_ex:
                print(f"fsr_fei_id ALTER NOTICE: {alter_ex}")
    except Exception as ex2:
        print(f"⚠️ [DB Schema Init] score record alter 알림: {ex2}")

    # 3. 기존 심사위원 백필 매핑 (독립 수행)
    try:
        with engine.connect() as conn:
            check_count = conn.execute(text("SELECT COUNT(*) FROM fair_judge_buman")).scalar() or 0
            if check_count == 0:
                conn.execute(text("""
                    INSERT IGNORE INTO fair_judge_buman (fjb_fb_id, fjb_fj_id)
                    SELECT b.fb_id, j.fj_id
                    FROM fair_buman b
                    JOIN fair_judge j ON b.fb_fg_id = j.fj_fg_id
                """))
                conn.commit()
    except Exception as b_ex:
        print(f"backfill NOTICE: {b_ex}")

    print("✅ [DB Schema Init] 초기 마이그레이션 확인 완료")



@app.on_event("startup")
def on_startup():
    init_db_schema()

# 앱 로딩 시 즉시 DB 스키마 검증 및 생성 강제 실행
init_db_schema()

@app.get("/api/system/init-schema")
def trigger_db_schema_init():
    """DB 스키마 마이그레이션을 즉시 수동 실행하는 관리용 API"""
    try:
        init_db_schema()
        return {"status": "success", "message": "fair_judge_buman 테이블 스키마 검증 및 마이그레이션이 완료되었습니다."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
