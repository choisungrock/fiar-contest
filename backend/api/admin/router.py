# 관리자 기능 관련 API 요청을 처리하는 APIRouter 정의 파일
from fastapi import APIRouter

router = APIRouter()

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
