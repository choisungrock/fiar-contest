# 평가자(유저) 전용 기능 관련 API 요청을 처리하는 APIRouter 정의 파일
import os
from fastapi import APIRouter, HTTPException, status
from typing import Union, Optional
from pydantic import BaseModel
from sqlalchemy import create_engine, text

router = APIRouter()

DATABASE_URL = os.getenv("DATABASE_URL", "mysql+pymysql://fair_user:fair_password@db:3306/fair_db?charset=utf8mb4")
engine = create_engine(DATABASE_URL, pool_pre_ping=True)

class EvaluatorLoginRequest(BaseModel):
    judgeName: str
    affiliation: Optional[str] = ""
    role: Optional[str] = "심사위원"

class ScoreSyncRequest(BaseModel):
    judgeId: int
    productCode: str
    itemId: int
    score: Optional[int] = None # None 이면 삭제 처리

class BumanCompleteRequest(BaseModel):
    judgeId: int
    bumanPrefix: str

# 1. 대회별 초기 동적 데이터 로더 API
@router.get("/groups/{group_name}/init")
def get_evaluator_init(group_name: str):
    """심사위원 진입 시 해당 품평회의 메타데이터, 부문, 제품 및 가변 평가 템플릿 로드 API"""
    try:
        with engine.connect() as conn:
            # 1. 대회 정보 로드
            g_row = conn.execute(
                text("SELECT fg_id, fg_name, fg_period FROM fair_group WHERE fg_code = :group_name"),
                {"group_name": group_name}
            ).first()
            
            if not g_row:
                raise HTTPException(status_code=404, detail="해당 품평회를 찾을 수 없습니다. 주소를 다시 확인해 주세요.")
            
            fg_id = g_row[0]
            system_name = g_row[1]
            period = g_row[2] or ""

            # 2. 부문 목록 로드
            res_bumans = conn.execute(
                text("SELECT fb_id, fb_prefix, fb_group, fb_name, fb_type FROM fair_buman WHERE fb_fg_id = :fg_id ORDER BY fb_id ASC"),
                {"fg_id": fg_id}
            )
            bumans_list = []
            for r in res_bumans:
                bumans_list.append({
                    "id": r[0],
                    "prefix": r[1],
                    "group": r[2] or "",
                    "name": r[3],
                    "type": r[4] # open | blind
                })

            # 3. 제품 목록 로드
            res_products = conn.execute(
                text("SELECT p.fp_id, p.fp_fb_id, b.fb_prefix, p.fp_code, p.fp_name FROM fair_product p JOIN fair_buman b ON p.fp_fb_id = b.fb_id WHERE b.fb_fg_id = :fg_id ORDER BY p.fp_id ASC"),
                {"fg_id": fg_id}
            )
            products_map = {}
            for r in res_products:
                prefix = r[2]
                if prefix not in products_map:
                    products_map[prefix] = []
                products_map[prefix].append({
                    "id": r[0],
                    "code": r[3],
                    "name": r[4] or ""
                })

            # 4. 부문별 템플릿(대그룹 -> 세부 평가항목) 조합 로드
            templates_map = {}
            for b in bumans_list:
                fb_id = b["id"]
                prefix = b["prefix"]
                fb_type = b["type"]

                # 부문 전용 개별 오버라이드 템플릿 우선 조회
                fet_row = conn.execute(
                    text("SELECT fet_id FROM fair_evaluation_template WHERE fet_fg_id = :fg_id AND fet_target_type = 'specific_buman' AND fet_target_id = :fb_id"),
                    {"fg_id": fg_id, "fb_id": fb_id}
                ).first()

                # 없을 시 방식별 공통 템플릿 조회
                if not fet_row:
                    target_type = "open_all" if fb_type == "open" else "blind_all"
                    fet_row = conn.execute(
                        text("SELECT fet_id FROM fair_evaluation_template WHERE fet_fg_id = :fg_id AND fet_target_type = :target_type"),
                        {"fg_id": fg_id, "target_type": target_type}
                    ).first()

                if fet_row:
                    fet_id = fet_row[0]
                    res_items = conn.execute(
                        text("SELECT fei_id, fei_group_name, fei_name, fei_max_score, fei_convert_to, fei_scale_values FROM fair_evaluation_item WHERE fei_fet_id = :fet_id ORDER BY fei_id ASC"),
                        {"fet_id": fet_id}
                    )
                    
                    # 대그룹명 기준 트리 구조화
                    group_items = {}
                    for row in res_items:
                        g_name = row[1]
                        it_scale_str = row[5] or ""
                        # scale values 문자열을 쪼개서 숫자 배열로 구성
                        scale_list = []
                        if it_scale_str:
                          try:
                            scale_list = [int(v.strip()) for v in it_scale_str.split(',') if v.strip()]
                          except:
                            scale_list = []
                        
                        if g_name not in group_items:
                            group_items[g_name] = {
                                "name": g_name,
                                "convertTo": row[4],
                                "items": []
                            }
                        group_items[g_name]["items"].append({
                            "id": row[0],
                            "name": row[2],
                            "max": row[3],
                            "scale": scale_list
                        })
                    
                    templates_map[prefix] = list(group_items.values())
                else:
                    templates_map[prefix] = []

            return {
                "status": "success",
                "systemName": system_name,
                "period": period,
                "bumans": bumans_list,
                "products": products_map,
                "templates": templates_map
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"심사위원 진입 동적 초기화 로딩 실패: {str(e)}")

# 2. 평가자 자동 생성 및 기존 채점 내역 복원 로그인 API
@router.post("/groups/{group_name}/login")
def login_evaluator(group_name: str, req: EvaluatorLoginRequest):
    """평가자 성명 입력 시 신규 가입 자동 처리 및 기존 채점 데이터 전체 복구 로드 API"""
    try:
        with engine.connect() as conn:
            # 1. 대회 ID 조회
            g_row = conn.execute(
                text("SELECT fg_id FROM fair_group WHERE fg_code = :group_name"),
                {"group_name": group_name}
            ).first()
            if not g_row:
                raise HTTPException(status_code=404, detail="대회 정보가 존재하지 않습니다.")
            fg_id = g_row[0]

            # 2. 기존 심사위원 여부 조회
            j_row = conn.execute(
                text("SELECT fj_id FROM fair_judge WHERE fj_fg_id = :fg_id AND fj_name = :name"),
                {"fg_id": fg_id, "name": req.judgeName.strip()}
            ).first()

            trans = conn.begin()
            try:
                if j_row:
                    fj_id = j_row[0]
                else:
                    # 신규 생성
                    res = conn.execute(
                        text("INSERT INTO fair_judge (fj_fg_id, fj_name, fj_affiliation, fj_role) VALUES (:fg_id, :name, :aff, :role)"),
                        {"fg_id": fg_id, "name": req.judgeName.strip(), "aff": req.affiliation, "role": req.role}
                    )
                    fj_id = res.lastrowid
                trans.commit()
            except Exception as login_err:
                trans.rollback()
                raise login_err

            # 3. 기존 채점 내역 복구 조회
            res_scores = conn.execute(
                text("""
                    SELECT b.fb_prefix, p.fp_code, r.fsr_fei_id, r.fsr_score
                    FROM fair_score_record r
                    JOIN fair_product p ON r.fsr_fp_id = p.fp_id
                    JOIN fair_buman b ON p.fp_fb_id = b.fb_id
                    WHERE r.fsr_fj_id = :fj_id
                """),
                {"fj_id": fj_id}
            )

            scores_map = {}
            for r in res_scores:
                prefix = r[0]
                p_code = r[1]
                fei_id = str(r[2]) # JSON Key 용
                score_val = r[3]

                if prefix not in scores_map:
                    scores_map[prefix] = {}
                if p_code not in scores_map[prefix]:
                    scores_map[prefix][p_code] = {}
                
                scores_map[prefix][p_code][fei_id] = score_val

            return {
                "status": "success",
                "message": "평가자 로그인 성공 및 기존 기록 복구 완료",
                "judgeId": fj_id,
                "judgeName": req.judgeName.strip(),
                "scores": scores_map
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"심사위원 로그인 연동 중 오류 발생: {str(e)}")

# 3. 실시간 배점 Upsert 및 삭제 동기화 API
@router.post("/groups/{group_name}/score")
def save_score(group_name: str, req: ScoreSyncRequest):
    """평가자가 셀 배점을 입력하거나 삭제할 시 DB에 즉시 동기화 보존하는 API (Upsert / Delete)"""
    try:
        with engine.connect() as conn:
            # 1. 제품 코드 기준 제품 ID 조회
            p_row = conn.execute(
                text("""
                    SELECT p.fp_id FROM fair_product p 
                    JOIN fair_buman b ON p.fp_fb_id = b.fb_id 
                    JOIN fair_group g ON b.fb_fg_id = g.fg_id
                    WHERE g.fg_code = :group_name AND p.fp_code = :p_code
                """),
                {"group_name": group_name, "p_code": req.productCode}
            ).first()

            if not p_row:
                raise HTTPException(status_code=404, detail="평가 대상을 찾을 수 없습니다.")
            fp_id = p_row[0]

            trans = conn.begin()
            try:
                if req.score is None or req.score < 0:
                    # 삭제(지우기) 처리
                    conn.execute(
                        text("DELETE FROM fair_score_record WHERE fsr_fj_id = :fj_id AND fsr_fp_id = :fp_id AND fsr_fei_id = :fei_id"),
                        {"fj_id": req.judgeId, "fp_id": fp_id, "fei_id": req.itemId}
                    )
                else:
                    # Upsert 처리
                    conn.execute(
                        text("""
                            INSERT INTO fair_score_record (fsr_fj_id, fsr_fp_id, fsr_fei_id, fsr_score) 
                            VALUES (:fj_id, :fp_id, :fei_id, :score)
                            ON DUPLICATE KEY UPDATE fsr_score = VALUES(fsr_score)
                        """),
                        {"fj_id": req.judgeId, "fp_id": fp_id, "fei_id": req.itemId, "score": req.score}
                    )
                trans.commit()
                return {
                    "status": "success",
                    "message": "실시간 배점 기록 저장 성공"
                }
            except Exception as score_err:
                trans.rollback()
                raise score_err
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"배점 실시간 동기화 실패: {str(e)}")

# 4. 배점완료 제출 API
@router.post("/groups/{group_name}/complete")
def save_complete(group_name: str, req: BumanCompleteRequest):
    """해당 부문 배점 완료 제출 확인 처리 API"""
    return {
        "status": "success",
        "message": f"부문 [{req.bumanPrefix}] 평가 제출 처리가 완료되었습니다."
    }
