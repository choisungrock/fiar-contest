# K-라이스페스타 품평회 시스템의 메인 FastAPI 진입점 및 API 요청 처리 파일
import os
from fastapi import FastAPI, HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError

# 분리된 API 라우터 임포트
from api.admin.router import router as admin_router
from api.user.router import router as user_router

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="K-Rice Festa Evaluation System API")

# CORS 미들웨어 등록 (개발 편의를 위해 모든 Origin 허용, 실 배포 시 특정 도메인으로 축소 가능)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 라우터 등록 및 경로 접두사(Prefix) 분리
app.include_router(admin_router, prefix="/api/admin", tags=["Admin"])
app.include_router(user_router, prefix="/api/user", tags=["User"])

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
