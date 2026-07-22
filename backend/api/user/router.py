# 평가자(유저) 전용 기능 관련 API 요청을 처리하는 APIRouter 정의 파일
from fastapi import APIRouter

router = APIRouter()

@router.post("/login")
def login_evaluator(payload: dict):
    """평가자 성명 입력 및 로그인 처리 API"""
    return {
        "message": "평가자 로그인 성공",
        "judgeName": payload.get("judgeName", "홍길동 심사위원"),
        "buman": payload.get("buman", "A")
    }

@router.post("/score")
def save_score(payload: dict):
    """평가 점수 실시간 저장 및 동기화 API"""
    return {
        "message": "평가 점수 동기화 성공",
        "saved_record": payload
    }
