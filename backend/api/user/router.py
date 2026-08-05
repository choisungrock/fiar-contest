# 평가자(유저) 전용 기능 관련 API 요청을 처리하는 APIRouter 정의 파일
import os
from fastapi import APIRouter, HTTPException, status, Header
from typing import Union, Optional
from pydantic import BaseModel
from sqlalchemy import create_engine, text

router = APIRouter()

DATABASE_URL = os.getenv("DATABASE_URL", "mysql+pymysql://fair_user:fair_password@db:3306/fair_db?charset=utf8mb4")
engine = create_engine(DATABASE_URL, pool_pre_ping=True)

# ---------- 기기 인증 공통 ----------
def verify_device(conn, group_code, device_key, auth_key):
    """승인된 기기(device_key+auth_key 일치, status=approved)인지 검증"""
    if not device_key or not auth_key:
        return False
    row = conn.execute(
        text("""
            SELECT d.fd_auth_key FROM fair_device d
            JOIN fair_group g ON d.fd_fg_id = g.fg_id
            WHERE g.fg_code = :code AND d.fd_device_key = :dk AND d.fd_status = 'approved'
        """),
        {"code": group_code, "dk": device_key}
    ).first()
    return bool(row) and row[0] == auth_key

class DeviceRegisterRequest(BaseModel):
    deviceKey: str
    label: Optional[str] = ""

class DeviceKeyRequest(BaseModel):
    deviceKey: str

class EvaluatorLoginRequest(BaseModel):
    judgeName: str
    affiliation: Optional[str] = ""
    role: Optional[str] = "심사위원"

class ScoreSyncRequest(BaseModel):
    judgeId: int
    productCode: str
    itemId: Union[int, str]
    score: Optional[int] = None # None 이면 삭제 처리

class BumanCompleteRequest(BaseModel):
    judgeId: int
    bumanPrefix: str


# 0. 기기 등록/상태 조회 API (등록 단계라 기기 인증 불필요)
@router.post("/groups/{group_name}/device/register")
def register_device(group_name: str, req: DeviceRegisterRequest):
    """기기 유니크키 등록/조회. 신규는 대기(pending)로 저장(등록잠금 시 거부), 승인 시 인증키 반환."""
    try:
        with engine.connect() as conn:
            g = conn.execute(
                text("SELECT fg_id, fg_enroll_open, fg_name, fg_period FROM fair_group WHERE fg_code = :c"),
                {"c": group_name}
            ).first()
            if not g:
                raise HTTPException(status_code=404, detail="대회 정보가 존재하지 않습니다.")
            fg_id, enroll_open, fg_name, fg_period = g[0], g[1], g[2], g[3]

            existing = conn.execute(
                text("SELECT fd_status, fd_auth_key, fd_label FROM fair_device WHERE fd_fg_id = :fg AND fd_device_key = :dk"),
                {"fg": fg_id, "dk": req.deviceKey}
            ).first()

            if existing:
                d_status, d_auth, d_label = existing
                if req.label and d_status == 'pending':
                    conn.execute(
                        text("UPDATE fair_device SET fd_label = :lb, fd_last_seen = CURRENT_TIMESTAMP WHERE fd_fg_id = :fg AND fd_device_key = :dk"),
                        {"lb": req.label, "fg": fg_id, "dk": req.deviceKey}
                    )
                    d_label = req.label
                else:
                    conn.execute(
                        text("UPDATE fair_device SET fd_last_seen = CURRENT_TIMESTAMP WHERE fd_fg_id = :fg AND fd_device_key = :dk"),
                        {"fg": fg_id, "dk": req.deviceKey}
                    )
                conn.commit()
                return {"status": d_status, "authKey": d_auth if d_status == 'approved' else None, "label": d_label or "", "systemName": fg_name or "", "period": fg_period or ""}

            # 신규 기기 — 등록잠금이면 저장하지 않음
            if not enroll_open:
                return {"status": "rejected", "authKey": None, "label": "", "systemName": fg_name or "", "period": fg_period or ""}
            conn.execute(
                text("INSERT INTO fair_device (fd_fg_id, fd_device_key, fd_label, fd_status) VALUES (:fg, :dk, :lb, 'pending')"),
                {"fg": fg_id, "dk": req.deviceKey, "lb": req.label or ""}
            )
            conn.commit()
            return {"status": "pending", "authKey": None, "label": req.label or "", "systemName": fg_name or "", "period": fg_period or ""}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"기기 등록 오류: {str(e)}")

# 0-2. 기기 상태 조회 API (신규 기기를 저장하지 않음 — 등록 요청 전에는 서버에 쌓이지 않음)
@router.post("/groups/{group_name}/device/status")
def check_device_status(group_name: str, req: DeviceKeyRequest):
    """등록된 기기면 상태(및 승인 시 인증키)를 반환, 미등록이면 저장 없이 unregistered 반환."""
    try:
        with engine.connect() as conn:
            g = conn.execute(text("SELECT fg_id, fg_name, fg_period FROM fair_group WHERE fg_code = :c"), {"c": group_name}).first()
            if not g:
                raise HTTPException(status_code=404, detail="대회 정보가 존재하지 않습니다.")
            fg_id, fg_name, fg_period = g[0], g[1], g[2]
            row = conn.execute(
                text("SELECT fd_status, fd_auth_key, fd_label FROM fair_device WHERE fd_fg_id = :fg AND fd_device_key = :dk"),
                {"fg": fg_id, "dk": req.deviceKey}
            ).first()
            if not row:
                # 저장하지 않고 미등록으로 응답
                return {"status": "unregistered", "authKey": None, "label": "", "systemName": fg_name or "", "period": fg_period or ""}
            d_status, d_auth, d_label = row
            conn.execute(
                text("UPDATE fair_device SET fd_last_seen = CURRENT_TIMESTAMP WHERE fd_fg_id = :fg AND fd_device_key = :dk"),
                {"fg": fg_id, "dk": req.deviceKey}
            )
            conn.commit()
            return {"status": d_status, "authKey": d_auth if d_status == 'approved' else None, "label": d_label or "", "systemName": fg_name or "", "period": fg_period or ""}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"기기 상태 조회 오류: {str(e)}")

# 1. 대회별 초기 동적 데이터 로더 API
@router.get("/groups/{group_name}/init")
def get_evaluator_init(group_name: str, x_device_key: str = Header(None), x_auth_key: str = Header(None)):
    """심사위원 진입 시 해당 품평회의 메타데이터, 부문, 제품 및 가변 평가 템플릿 로드 API"""
    try:
        with engine.connect() as conn:
            # 승인된 기기만 데이터 수신 가능
            if not verify_device(conn, group_name, x_device_key, x_auth_key):
                raise HTTPException(status_code=403, detail="승인되지 않은 기기입니다.")
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

            # 3. 제품 목록 로드 (블라인드 부문은 서버에서 제품명을 내려주지 않음)
            res_products = conn.execute(
                text("SELECT p.fp_id, p.fp_fb_id, b.fb_prefix, p.fp_code, p.fp_name, b.fb_type FROM fair_product p JOIN fair_buman b ON p.fp_fb_id = b.fb_id WHERE b.fb_fg_id = :fg_id ORDER BY p.fp_id ASC"),
                {"fg_id": fg_id}
            )
            products_map = {}
            for r in res_products:
                prefix = r[2]
                fb_type = r[5]
                if prefix not in products_map:
                    products_map[prefix] = []
                # 블라인드 부문은 제품명을 노출하지 않는다 (F12/네트워크로도 비공개)
                p_name = "" if fb_type == "blind" else (r[4] or "")
                products_map[prefix].append({
                    "id": r[0],
                    "code": r[3],
                    "name": p_name
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

            # 5. 평가자 명단 로드 (오프라인 검증용 캐시에 사용)
            res_judges = conn.execute(
                text("SELECT fj_id, fj_name, fj_affiliation, fj_role FROM fair_judge WHERE fj_fg_id = :fg_id ORDER BY fj_id ASC"),
                {"fg_id": fg_id}
            )
            judges_list = []
            for jr in res_judges:
                judges_list.append({
                    "id": jr[0],
                    "name": jr[1],
                    "affiliation": jr[2] or "",
                    "role": jr[3] or "심사위원"
                })

            return {
                "status": "success",
                "systemName": system_name,
                "period": period,
                "bumans": bumans_list,
                "products": products_map,
                "templates": templates_map,
                "judges": judges_list
            }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"심사위원 진입 동적 초기화 로딩 실패: {str(e)}")

# 2. 평가자 자동 생성 및 기존 채점 내역 복원 로그인 API
@router.post("/groups/{group_name}/login")
def login_evaluator(group_name: str, req: EvaluatorLoginRequest, x_device_key: str = Header(None), x_auth_key: str = Header(None)):
    """평가자 성명 확인(관리자 등록자만 허용) 및 기존 채점 데이터 복구 로드 API"""
    try:
        with engine.connect() as conn:
            # 승인된 기기만 허용
            if not verify_device(conn, group_name, x_device_key, x_auth_key):
                raise HTTPException(status_code=403, detail="승인되지 않은 기기입니다.")
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

            # 관리자에 등록된 평가자만 진입 허용 (임의 이름 자동 생성 안 함)
            if not j_row:
                raise HTTPException(
                    status_code=404,
                    detail="등록된 평가자가 아닙니다. 관리자에게 등록된 성명을 정확히 입력해 주세요."
                )
            fj_id = j_row[0]

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

            # 4. 해당 평가자의 담당 부문 prefix 목록 조회
            has_mapping = conn.execute(
                text("""
                    SELECT COUNT(*) FROM fair_judge_buman fjb
                    JOIN fair_buman b ON fjb.fjb_fb_id = b.fb_id
                    WHERE b.fb_fg_id = :fg_id
                """),
                {"fg_id": fg_id}
            ).scalar() or 0

            if has_mapping > 0:
                assigned_rows = conn.execute(
                    text("""
                        SELECT b.fb_prefix
                        FROM fair_judge_buman fjb
                        JOIN fair_buman b ON fjb.fjb_fb_id = b.fb_id
                        WHERE fjb.fjb_fj_id = :fj_id
                    """),
                    {"fj_id": fj_id}
                ).all()
                assigned_prefixes = [row[0] for row in assigned_rows]
            else:
                assigned_rows = conn.execute(
                    text("SELECT fb_prefix FROM fair_buman WHERE fb_fg_id = :fg_id"),
                    {"fg_id": fg_id}
                ).all()
                assigned_prefixes = [row[0] for row in assigned_rows]

            return {
                "status": "success",
                "message": "평가자 로그인 성공 및 기존 기록 복구 완료",
                "judgeId": fj_id,
                "judgeName": req.judgeName.strip(),
                "assignedPrefixes": assigned_prefixes,
                "scores": scores_map
            }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"심사위원 로그인 연동 중 오류 발생: {str(e)}")

# 3. 실시간 배점 Upsert 및 삭제 동기화 API
@router.post("/groups/{group_name}/score")
def save_score(group_name: str, req: ScoreSyncRequest, x_device_key: str = Header(None), x_auth_key: str = Header(None)):
    """평가자가 셀 배점을 입력하거나 삭제할 시 DB에 즉시 동기화 보존하는 API (Upsert / Delete)"""
    try:
        with engine.connect() as conn:
            # 0. 대회 ID 및 심사위원 ID(fj_id) 대회 소속 여부 검증 및 보정
            g_row = conn.execute(
                text("SELECT fg_id FROM fair_group WHERE fg_code = :group_name"),
                {"group_name": group_name}
            ).first()
            if not g_row:
                raise HTTPException(status_code=404, detail="대회 정보가 존재하지 않습니다.")
            fg_id = g_row[0]

            j_row = conn.execute(
                text("SELECT fj_id FROM fair_judge WHERE fj_fg_id = :fg_id AND fj_id = :target_jid"),
                {"fg_id": fg_id, "target_jid": req.judgeId}
            ).first()

            actual_fj_id = req.judgeId
            if not j_row:
                # 과거 세션 등의 사유로 fj_id 불일치 시, 해당 대회의 유효 fj_id로 자동 보정
                fb_j = conn.execute(
                    text("SELECT fj_id FROM fair_judge WHERE fj_fg_id = :fg_id ORDER BY fj_id ASC LIMIT 1"),
                    {"fg_id": fg_id}
                ).first()
                if fb_j:
                    actual_fj_id = fb_j[0]


            # 1. 제품 코드 기준 제품 ID 및 부문 ID 조회
            p_row = conn.execute(
                text("""
                    SELECT p.fp_id, b.fb_id, b.fb_prefix FROM fair_product p 
                    JOIN fair_buman b ON p.fp_fb_id = b.fb_id 
                    WHERE b.fb_fg_id = :fg_id AND (p.fp_code = :p_code OR REPLACE(p.fp_code, ' ', '') = REPLACE(:p_code, ' ', ''))
                """),
                {"fg_id": fg_id, "p_code": req.productCode.strip()}
            ).first()

            if not p_row:
                raise HTTPException(status_code=404, detail=f"[{req.productCode}] 평가 대상을 찾을 수 없습니다.")

            fp_id, fb_id, fb_prefix = p_row[0], p_row[1], p_row[2]

            # 2. 평가자 본인 담당 부문 권한 2차 검증
            j_map_cnt = conn.execute(
                text("SELECT COUNT(*) FROM fair_judge_buman WHERE fjb_fj_id = :fj_id"),
                {"fj_id": actual_fj_id}
            ).scalar() or 0

            if j_map_cnt > 0:
                is_assigned = conn.execute(
                    text("SELECT COUNT(*) FROM fair_judge_buman WHERE fjb_fj_id = :fj_id AND fjb_fb_id = :fb_id"),
                    {"fj_id": actual_fj_id, "fb_id": fb_id}
                ).scalar() or 0

                if is_assigned == 0:
                    raise HTTPException(status_code=403, detail=f"[{fb_prefix}] 부문에 대한 평가 권한이 없는 심사위원입니다.")

            # 3. itemId 원본 그대로 저장 (문자열/숫자 호환)
            fei_id_val = str(req.itemId)

            try:
                if req.score is None or req.score < 0:
                    # 삭제(지우기) 처리
                    conn.execute(
                        text("DELETE FROM fair_score_record WHERE fsr_fj_id = :fj_id AND fsr_fp_id = :fp_id AND fsr_fei_id = :fei_id"),
                        {"fj_id": actual_fj_id, "fp_id": fp_id, "fei_id": fei_id_val}
                    )
                else:
                    # Upsert 처리
                    conn.execute(
                        text("""
                            INSERT INTO fair_score_record (fsr_fj_id, fsr_fp_id, fsr_fei_id, fsr_score) 
                            VALUES (:fj_id, :fp_id, :fei_id, :score)
                            ON DUPLICATE KEY UPDATE fsr_score = VALUES(fsr_score)
                        """),
                        {"fj_id": actual_fj_id, "fp_id": fp_id, "fei_id": fei_id_val, "score": req.score}
                    )
                conn.commit()


                return {
                    "status": "success",
                    "message": "실시간 배점 기록 저장 성공"
                }
            except Exception as score_err:
                conn.rollback()
                raise score_err

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"배점 실시간 동기화 실패: {str(e)}")

# 4. 배점완료 제출 API
@router.post("/groups/{group_name}/complete")
def save_complete(group_name: str, req: BumanCompleteRequest, x_device_key: str = Header(None), x_auth_key: str = Header(None)):
    """해당 부문 배점 완료 제출 확인 처리 API"""
    try:
        with engine.connect() as conn:
            if not verify_device(conn, group_name, x_device_key, x_auth_key):
                raise HTTPException(status_code=403, detail="승인되지 않은 기기입니다.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"완료 처리 오류: {str(e)}")
    return {
        "status": "success",
        "message": f"부문 [{req.bumanPrefix}] 평가 제출 처리가 완료되었습니다."
    }
