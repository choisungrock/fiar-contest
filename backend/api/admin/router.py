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

@router.get("/groups")
def get_groups():
    """등록된 대그룹(품평회 대회) 목록 조회 API"""
    return {
        "message": "관리자용 품평회 대그룹 목록 조회 성공",
        "groups": [
            {
                "id": 1,
                "name": "2026 우리쌀·우리술 K-라이스페스타 품평회",
                "period": "2026.09.01 – 09.03",
                "status": "진행중",
                "progress": 62
            }
        ]
    }

@router.get("/results")
def get_results():
    """심사위원 점수 집계 결과 및 순위 조회 API"""
    return {
        "message": "관리자용 최종 집계 결과 및 순위 조회 성공",
        "results": []
    }

