# 관리자 기능 관련 API 요청을 처리하는 APIRouter 정의 파일
import os
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

router = APIRouter()

class LoginRequest(BaseModel):
    username: str
    password: str

@router.post("/login")
def admin_login(req: LoginRequest):
    """관리자 콘솔 로그인 인증 API"""
    env_master = os.getenv("ADMIN_MASTER", "adminmaster").strip()
    env_password = os.getenv("ADMIN_PASSWORD", "rhksflwk)(*123").strip()
    
    # 디버그용 출력
    print(f"로그인 시도: {req.username} / 검증 대상 마스터: {env_master}")

    if req.username == env_master and req.password == env_password:
        return {
            "status": "success",
            "message": "로그인 인증에 성공하였습니다.",
            "token": "mock-admin-token-kricefesta-7788"
        }
    else:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="이메일(아이디) 또는 비밀번호가 올바르지 않습니다."
        )

from sqlalchemy import create_engine, text

DATABASE_URL = os.getenv("DATABASE_URL", "mysql+pymysql://fair_user:fair_password@db:3306/fair_db?charset=utf8mb4")
engine = create_engine(DATABASE_URL, pool_pre_ping=True)

class CreateGroupRequest(BaseModel):
    name: str
    period: str
    status: str

@router.get("/groups")
def get_groups():
    """등록된 대그룹(품평회 대회) 목록 조회 API"""
    try:
        with engine.connect() as conn:
            res_groups = conn.execute(text("SELECT fg_id, fg_name, fg_period, fg_status FROM fair_group ORDER BY fg_id ASC"))
            groups_list = []
            
            for row in res_groups:
                g_id = row[0]
                g_name = row[1]
                g_period = row[2]
                g_status = row[3]
                
                # 부문, 평가자, 제품 갯수 카운트
                buman_count = conn.execute(text("SELECT COUNT(*) FROM fair_buman WHERE fb_fg_id = :fg_id"), {"fg_id": g_id}).scalar() or 0
                judge_count = conn.execute(text("SELECT COUNT(*) FROM fair_judge WHERE fj_fg_id = :fg_id"), {"fg_id": g_id}).scalar() or 0
                product_count = conn.execute(text(
                    "SELECT COUNT(*) FROM fair_product p JOIN fair_buman b ON p.fp_fb_id = b.fb_id WHERE b.fb_fg_id = :fg_id"
                ), {"fg_id": g_id}).scalar() or 0
                
                # 진행률 기본 매칭값
                progress = 0
                if g_status == '진행중':
                    progress = 62
                elif g_status == '완료':
                    progress = 100
                
                groups_list.append({
                    "id": g_id,
                    "name": g_name,
                    "period": g_period,
                    "status": g_status,
                    "progress": progress,
                    "bumanCount": buman_count,
                    "judgeCount": judge_count,
                    "productCount": product_count
                })
                
            return {
                "status": "success",
                "message": "관리자용 품평회 대그룹 목록 조회 성공",
                "groups": groups_list
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"대그룹 조회 중 오류 발생: {str(e)}")

@router.post("/groups")
def create_group(req: CreateGroupRequest):
    """새 대그룹(품평회 대회) 추가 API"""
    try:
        with engine.connect() as conn:
            trans = conn.begin()
            try:
                conn.execute(
                    text("INSERT INTO fair_group (fg_name, fg_period, fg_status) VALUES (:name, :period, :status)"),
                    {"name": req.name, "period": req.period, "status": req.status}
                )
                trans.commit()
                return {
                    "status": "success",
                    "message": "새 대그룹이 정상적으로 추가되었습니다."
                }
            except Exception as insert_err:
                trans.rollback()
                raise insert_err
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"대그룹 추가 중 오류 발생: {str(e)}")

@router.get("/results")
def get_results():
    """심사위원 점수 집계 결과 및 순위 조회 API"""
    return {
        "message": "관리자용 최종 집계 결과 및 순위 조회 성공",
        "results": []
    }

