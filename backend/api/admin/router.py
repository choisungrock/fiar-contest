# 관리자 기능 관련 API 요청을 처리하는 APIRouter 정의 파일
import os
import secrets
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, status, Header
from typing import Union, Optional
from pydantic import BaseModel

import hashlib

router = APIRouter()

KST = timezone(timedelta(hours=9))

def format_kst(dt):
    if not dt:
        return ""
    if isinstance(dt, str):
        try:
            dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
        except Exception:
            return dt
    if isinstance(dt, datetime):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        kst_dt = dt.astimezone(KST)
        return kst_dt.strftime("%Y-%m-%d %H:%M:%S")
    return str(dt)

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()

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
            "token": "mock-admin-token-kricefesta-7788",
            "username": env_master,
            "name": "마스터 관리자",
            "isMaster": True,
            "groupIds": "*"
        }
    else:
        # DB에서 서브 관리자 조회
        try:
            with engine.connect() as conn:
                row = conn.execute(
                    text("SELECT fa_id, fa_password, fa_name, fa_group_ids FROM fair_admin WHERE fa_username = :username"),
                    {"username": req.username}
                ).first()
                if row and row[1] == hash_password(req.password):
                    return {
                        "status": "success",
                        "message": "로그인 인증에 성공하였습니다.",
                        "token": f"mock-admin-token-sub-{row[0]}",
                        "username": req.username,
                        "name": row[2],
                        "isMaster": False,
                        "groupIds": row[3]
                    }
        except Exception as e:
            print(f"DB 로그인 검증 중 오류: {e}")

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="이메일(아이디) 또는 비밀번호가 올바르지 않습니다."
        )

from sqlalchemy import create_engine, text

DATABASE_URL = os.getenv("DATABASE_URL", "mysql+pymysql://fair_user:fair_password@db:3306/fair_db?charset=utf8mb4")
engine = create_engine(DATABASE_URL, pool_pre_ping=True)

def is_authorized_admin(username: str) -> bool:
    if not username:
        return False
    env_master = os.getenv("ADMIN_MASTER", "adminmaster").strip()
    if username == env_master:
        return True
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT fa_group_ids FROM fair_admin WHERE fa_username = :username"),
                {"username": username}
            ).first()
            if row and row[0] == "*":
                return True
    except Exception:
        pass
    return False

# 9. 관리자 계정 테이블 자동 생성
try:
    with engine.connect() as _conn:
        _trans = _conn.begin()
        try:
            _conn.execute(text("""
                CREATE TABLE IF NOT EXISTS fair_admin (
                  fa_id INT AUTO_INCREMENT PRIMARY KEY,
                  fa_username VARCHAR(100) NOT NULL UNIQUE,
                  fa_password VARCHAR(255) NOT NULL,
                  fa_name VARCHAR(100) NOT NULL,
                  fa_group_ids VARCHAR(255) NOT NULL DEFAULT '*',
                  fa_created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB;
            """))
            _trans.commit()
        except Exception as _inner:
            _trans.rollback()
            print(f"Error creating fair_admin table: {_inner}")
except Exception as _e:
    print(f"Database connection error on startup: {_e}")

class CreateGroupRequest(BaseModel):
    name: str
    period: str
    status: str
    code: str

@router.get("/groups")
def get_groups(x_admin_username: Optional[str] = Header(None)):
    """등록된 대그룹(품평회 대회) 목록 조회 API"""
    try:
        env_master = os.getenv("ADMIN_MASTER", "adminmaster").strip()
        allowed_ids = None
        
        # 서브 관리자 권한 필터링 확인
        if x_admin_username and x_admin_username != env_master:
            try:
                with engine.connect() as conn:
                    grp_ids_str = conn.execute(
                        text("SELECT fa_group_ids FROM fair_admin WHERE fa_username = :username"),
                        {"username": x_admin_username}
                    ).scalar()
                    if grp_ids_str and grp_ids_str != '*':
                        allowed_ids = [int(x.strip()) for x in grp_ids_str.split(',') if x.strip().isdigit()]
                    elif not grp_ids_str:
                        allowed_ids = []
            except Exception as e:
                print(f"서브 관리자 권한 조회 중 오류: {e}")

        with engine.connect() as conn:
            res_groups = conn.execute(text("SELECT fg_id, fg_name, fg_period, fg_status, fg_code FROM fair_group ORDER BY fg_id ASC"))
            groups_list = []
            
            for row in res_groups:
                g_id = row[0]
                
                # 권한 범위가 아닌 대그룹은 목록에서 배제
                if allowed_ids is not None and g_id not in allowed_ids:
                    continue

                g_name = row[1]
                g_period = row[2]
                g_status = row[3]
                g_code = row[4]
                
                # 부문, 평가자, 제품 갯수 카운트
                buman_count = conn.execute(text("SELECT COUNT(*) FROM fair_buman WHERE fb_fg_id = :fg_id"), {"fg_id": g_id}).scalar() or 0
                judge_count = conn.execute(text("SELECT COUNT(*) FROM fair_judge WHERE fj_fg_id = :fg_id"), {"fg_id": g_id}).scalar() or 0
                product_count = conn.execute(text(
                    "SELECT COUNT(*) FROM fair_product p JOIN fair_buman b ON p.fp_fb_id = b.fb_id WHERE b.fb_fg_id = :fg_id"
                ), {"fg_id": g_id}).scalar() or 0
                
                # 실시간 진행률 연산
                total_template_items = 0
                buman_rows = conn.execute(
                    text("SELECT fb_id, fb_type FROM fair_buman WHERE fb_fg_id = :fg_id"), 
                    {"fg_id": g_id}
                ).all()
                
                for b_row in buman_rows:
                    fb_id, fb_type = b_row[0], b_row[1]
                    fet_id = conn.execute(
                        text("SELECT fet_id FROM fair_evaluation_template WHERE fet_fg_id = :fg_id AND fet_target_type = 'specific_buman' AND fet_target_id = :fb_id"),
                        {"fg_id": g_id, "fb_id": fb_id}
                    ).scalar()
                    
                    if not fet_id:
                        target_type = "open_all" if fb_type == "open" else "blind_all"
                        fet_id = conn.execute(
                            text("SELECT fet_id FROM fair_evaluation_template WHERE fet_fg_id = :fg_id AND fet_target_type = :target_type"),
                            {"fg_id": g_id, "target_type": target_type}
                        ).scalar()
                        
                    if fet_id:
                        item_count = conn.execute(
                            text("SELECT COUNT(*) FROM fair_evaluation_item WHERE fei_fet_id = :fet_id"),
                            {"fet_id": fet_id}
                        ).scalar() or 0
                        p_count = conn.execute(
                            text("SELECT COUNT(*) FROM fair_product WHERE fp_fb_id = :fb_id"),
                            {"fb_id": fb_id}
                        ).scalar() or 0
                        total_template_items += p_count * item_count
                        
                total_target_cells = total_template_items * judge_count
                actual_filled_cells = conn.execute(
                    text("""
                        SELECT COUNT(*) FROM fair_score_record r
                        JOIN fair_product p ON r.fsr_fp_id = p.fp_id
                        JOIN fair_buman b ON p.fp_fb_id = b.fb_id
                        WHERE b.fb_fg_id = :fg_id
                    """),
                    {"fg_id": g_id}
                ).scalar() or 0
                
                progress = 0
                if total_target_cells > 0:
                    progress = min(100, round((actual_filled_cells / total_target_cells) * 100))
                elif g_status == '완료':
                    progress = 100
                
                groups_list.append({
                    "id": g_id,
                    "name": g_name,
                    "period": g_period,
                    "status": g_status,
                    "code": g_code,
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
                    text("INSERT INTO fair_group (fg_name, fg_period, fg_status, fg_code) VALUES (:name, :period, :status, :code)"),
                    {"name": req.name, "period": req.period, "status": req.status, "code": req.code}
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

class JudgeItem(BaseModel):
    id: int = None
    name: str
    affiliation: str = ""
    role: str = "심사위원"

class BumanItem(BaseModel):
    id: int = None
    prefix: str
    group: str = ""
    name: str
    type: str = "open"
    cat: str = "open"

class ProductItem(BaseModel):
    id: int = None
    code: str
    name: str

class EvalItem(BaseModel):
    id: int = None
    name: str
    max: int
    scaleValues: Optional[str] = None

class EvalGroup(BaseModel):
    id: int = None
    name: str
    convertTo: Union[int, str, None] = ""
    items: list[EvalItem]

class EvaluationTemplateItem(BaseModel):
    id: int = None
    target_type: str
    target_id: Union[int, str, None] = None
    groups: list[EvalGroup]

class SaveDetailsRequest(BaseModel):
    systemName: str
    systemCode: str = ""
    period: str = ""
    status: str = "진행중"
    judges: list[JudgeItem]
    bumans: list[BumanItem]
    products: dict[str, list[ProductItem]]
    templates: list[EvaluationTemplateItem]

@router.get("/groups/{fg_id}/details")
def get_group_details(fg_id: int, x_admin_username: Optional[str] = Header(None)):
    """대그룹(품평회 대회) 상세 리소스 일괄 조회 API"""
    try:
        env_master = os.getenv("ADMIN_MASTER", "adminmaster").strip()
        
        # 서브 관리자 권한 상세 검증
        if x_admin_username and x_admin_username != env_master:
            try:
                with engine.connect() as conn:
                    grp_ids_str = conn.execute(
                        text("SELECT fa_group_ids FROM fair_admin WHERE fa_username = :username"),
                        {"username": x_admin_username}
                    ).scalar()
                    if grp_ids_str and grp_ids_str != '*':
                        allowed_ids = [int(x.strip()) for x in grp_ids_str.split(',') if x.strip().isdigit()]
                        if fg_id not in allowed_ids:
                            raise HTTPException(status_code=403, detail="해당 대그룹에 대한 관리 권한이 없습니다.")
                    elif not grp_ids_str:
                        raise HTTPException(status_code=403, detail="해당 대그룹에 대한 관리 권한이 없습니다.")
            except HTTPException:
                raise
            except Exception as e:
                print(f"상세 조회 권한 필터링 실패: {e}")

        with engine.connect() as conn:
            g_row = conn.execute(
                text("SELECT fg_name, fg_period, fg_status, fg_code FROM fair_group WHERE fg_id = :fg_id"),
                {"fg_id": fg_id}
            ).first()
            if not g_row:
                raise HTTPException(status_code=404, detail="해당 대그룹을 찾을 수 없습니다.")
            
            system_name = g_row[0]
            period = g_row[1] or ""
            status = g_row[2] or "진행중"
            system_code = g_row[3] or ""

            # 심사위원
            res_judges = conn.execute(
                text("SELECT fj_id, fj_name, fj_affiliation, fj_role FROM fair_judge WHERE fj_fg_id = :fg_id ORDER BY fj_id ASC"),
                {"fg_id": fg_id}
            )
            judges_list = []
            for r in res_judges:
                judges_list.append({
                    "id": r[0],
                    "name": r[1],
                    "affiliation": r[2] or "",
                    "role": r[3] or "심사위원"
                })

            # 부문
            res_bumans = conn.execute(
                text("SELECT fb_id, fb_prefix, fb_group, fb_name, fb_type FROM fair_buman WHERE fb_fg_id = :fg_id ORDER BY fb_id ASC"),
                {"fg_id": fg_id}
            )
            bumans_list = []
            buman_ids = {}
            for r in res_bumans:
                bumans_list.append({
                    "id": r[0],
                    "prefix": r[1],
                    "group": r[2] or "",
                    "name": r[3],
                    "type": r[4],
                    "cat": r[4]
                })
                buman_ids[r[1]] = r[0]

            # 부문별 제품
            products_map = {}
            for prefix, fb_id in buman_ids.items():
                res_prods = conn.execute(
                    text("SELECT fp_id, fp_code, fp_name FROM fair_product WHERE fp_fb_id = :fb_id ORDER BY fp_id ASC"),
                    {"fb_id": fb_id}
                )
                prod_list = []
                for rp in res_prods:
                    prod_list.append({
                        "id": rp[0],
                        "code": rp[1],
                        "name": rp[2] or ""
                    })
                products_map[prefix] = prod_list

            # 평가항목 템플릿
            res_templates = conn.execute(
                text("SELECT fet_id, fet_target_type, fet_target_id FROM fair_evaluation_template WHERE fet_fg_id = :fg_id ORDER BY fet_id ASC"),
                {"fg_id": fg_id}
            )
            templates_list = []
            for t in res_templates:
                fet_id, target_type, target_id = t
                
                # 해당 템플릿의 세부 항목 조회
                res_items = conn.execute(
                    text("SELECT fei_id, fei_group_name, fei_name, fei_max_score, fei_convert_to, fei_scale_values FROM fair_evaluation_item WHERE fei_fet_id = :fet_id ORDER BY fei_id ASC"),
                    {"fet_id": fet_id}
                )
                
                # group_name 기준으로 그룹화
                group_map = {}
                g_seq = 10000
                for ri in res_items:
                    fei_id, group_name, name, max_score, convert_to, scale_values = ri
                    if group_name not in group_map:
                        g_seq += 1
                        group_map[group_name] = {
                            "id": g_seq,
                            "name": group_name,
                            "convertTo": str(convert_to) if convert_to is not None else "",
                            "items": []
                        }
                    group_map[group_name]["items"].append({
                        "id": fei_id,
                        "name": name,
                        "max": max_score,
                        "scaleValues": scale_values or None
                    })
                
                # target_id는 specific_buman일 경우 prefix 문자열로 프론트엔드가 수월하게 매핑할 수 있게 돌려줍니다!
                fe_target_val = target_id
                if target_type == 'specific_buman' and target_id is not None:
                    # bumans_list 에서 id 매칭하여 prefix 추출
                    found_prefix = next((b["prefix"] for b in bumans_list if b["id"] == target_id), None)
                    if found_prefix:
                        fe_target_val = found_prefix

                templates_list.append({
                    "id": fet_id,
                    "target_type": target_type,
                    "target_id": fe_target_val,
                    "groups": list(group_map.values())
                })
            


            return {
                "status": "success",
                "systemName": system_name,
                "systemCode": system_code,
                "period": period,
                "groupStatus": status,
                "judges": judges_list,
                "bumans": bumans_list,
                "products": products_map,
                "templates": templates_list
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"상세 정보 조회 중 오류 발생: {str(e)}")

@router.post("/groups/{fg_id}/save")
def save_group_details(fg_id: int, req: SaveDetailsRequest, x_admin_username: Optional[str] = Header(None)):
    """대그룹(품평회 대회) 상세 리소스 일괄 저장 API"""
    try:
        env_master = os.getenv("ADMIN_MASTER", "adminmaster").strip()
        
        # 서브 관리자 권한 수정 검증
        if x_admin_username and x_admin_username != env_master:
            try:
                with engine.connect() as conn:
                    grp_ids_str = conn.execute(
                        text("SELECT fa_group_ids FROM fair_admin WHERE fa_username = :username"),
                        {"username": x_admin_username}
                    ).scalar()
                    if grp_ids_str and grp_ids_str != '*':
                        allowed_ids = [int(x.strip()) for x in grp_ids_str.split(',') if x.strip().isdigit()]
                        if fg_id not in allowed_ids:
                            raise HTTPException(status_code=403, detail="해당 대그룹에 대한 수정 권한이 없습니다.")
                    elif not grp_ids_str:
                        raise HTTPException(status_code=403, detail="해당 대그룹에 대한 수정 권한이 없습니다.")
            except HTTPException:
                raise
            except Exception as e:
                print(f"상세 저장 권한 필터링 실패: {e}")

        with engine.connect() as conn:
            trans = conn.begin()
            try:
                # 1. 대회 정보 업데이트
                conn.execute(
                    text("UPDATE fair_group SET fg_name = :name, fg_period = :period, fg_status = :status, fg_code = :code WHERE fg_id = :fg_id"),
                    {"name": req.systemName, "period": req.period, "status": req.status, "code": req.systemCode, "fg_id": fg_id}
                )

                # 2. 기존 종속 관계 데이터 삭제
                conn.execute(text("DELETE FROM fair_judge WHERE fj_fg_id = :fg_id"), {"fg_id": fg_id})
                conn.execute(text("DELETE FROM fair_buman WHERE fb_fg_id = :fg_id"), {"fg_id": fg_id})

                # 3. 심사위원 기입
                for j in req.judges:
                    conn.execute(
                        text("INSERT INTO fair_judge (fj_fg_id, fj_name, fj_affiliation, fj_role) VALUES (:fg_id, :name, :aff, :role)"),
                        {"fg_id": fg_id, "name": j.name, "aff": j.affiliation, "role": j.role}
                    )

                # 4. 부문 기입
                prefix_to_fb_id = {}
                for b in req.bumans:
                    b_type = b.type if b.type else (b.cat if b.cat else "open")
                    b_group = b.group if b.group else ""
                    conn.execute(
                        text("INSERT INTO fair_buman (fb_fg_id, fb_prefix, fb_group, fb_name, fb_type) VALUES (:fg_id, :prefix, :group, :name, :type)"),
                        {"fg_id": fg_id, "prefix": b.prefix, "group": b_group, "name": b.name, "type": b_type}
                    )
                    inserted_fb_id = conn.execute(text("SELECT LAST_INSERT_ID()")).scalar()
                    prefix_to_fb_id[b.prefix] = inserted_fb_id

                # 5. 제품 기입
                for prefix, prod_list in req.products.items():
                    fb_id = prefix_to_fb_id.get(prefix)
                    if fb_id:
                        for p in prod_list:
                            conn.execute(
                                text("INSERT INTO fair_product (fp_fb_id, fp_code, fp_name) VALUES (:fb_id, :code, :name)"),
                                {"fb_id": fb_id, "code": p.code, "name": p.name}
                            )

                # 6. 기존 평가 템플릿 삭제 (종속 항목인 fair_evaluation_item은 ON DELETE CASCADE에 의해 같이 삭제됨)
                conn.execute(text("DELETE FROM fair_evaluation_template WHERE fet_fg_id = :fg_id"), {"fg_id": fg_id})

                # 7. 신규 평가 템플릿 기입
                for t in req.templates:
                    db_target_id = None
                    if t.target_type == 'specific_buman':
                        if t.target_id is not None:
                            # prefix 문자열로 lookup 시도
                            db_target_id = prefix_to_fb_id.get(str(t.target_id))
                            if not db_target_id:
                                # 기존 정수 ID 등으로 matching 시도
                                for bm in req.bumans:
                                    if bm.id == t.target_id or bm.prefix == t.target_id:
                                        db_target_id = prefix_to_fb_id.get(bm.prefix)
                                        break
                    
                    conn.execute(
                        text("INSERT INTO fair_evaluation_template (fet_fg_id, fet_target_type, fet_target_id) VALUES (:fg_id, :target_type, :target_id)"),
                        {"fg_id": fg_id, "target_type": t.target_type, "target_id": db_target_id}
                    )
                    inserted_fet_id = conn.execute(text("SELECT LAST_INSERT_ID()")).scalar()

                    for g in t.groups:
                        conv_val = None
                        if g.convertTo is not None:
                            if isinstance(g.convertTo, int):
                                conv_val = g.convertTo
                            elif isinstance(g.convertTo, str) and g.convertTo.strip().isdigit():
                                conv_val = int(g.convertTo)

                        for item in g.items:
                            conn.execute(
                                text("INSERT INTO fair_evaluation_item (fei_fet_id, fei_group_name, fei_name, fei_max_score, fei_convert_to, fei_scale_values) VALUES (:fet_id, :g_name, :name, :max, :conv, :scale_val)"),
                                {"fet_id": inserted_fet_id, "g_name": g.name, "name": item.name, "max": item.max, "conv": conv_val, "scale_val": item.scaleValues}
                            )

                trans.commit()
                return {
                    "status": "success",
                    "groupId": fg_id
                }
            except Exception as inner_err:
                trans.rollback()
                raise inner_err
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"상세 설정 저장 중 오류 발생: {str(e)}")

@router.get("/results")
def get_results():
    """심사위원 점수 집계 결과 및 순위 조회 API"""
    return {
        "message": "관리자용 최종 집계 결과 및 순위 조회 성공",
        "results": []
    }


# ==================== 기기 관리 (전용 태블릿 등록/승인) ====================
class DeviceStatusRequest(BaseModel):
    status: str  # pending | approved | blocked

class EnrollToggleRequest(BaseModel):
    open: bool

@router.get("/groups/{fg_id}/devices")
def list_devices(fg_id: int):
    """대회별 기기 목록 및 등록잠금 상태 조회 API"""
    try:
        with engine.connect() as conn:
            enroll = conn.execute(text("SELECT fg_enroll_open FROM fair_group WHERE fg_id = :fg"), {"fg": fg_id}).scalar()
            rows = conn.execute(
                text("SELECT fd_id, fd_device_key, fd_label, fd_status, fd_last_seen FROM fair_device WHERE fd_fg_id = :fg ORDER BY fd_id ASC"),
                {"fg": fg_id}
            )
            devices = []
            for r in rows:
                devices.append({
                    "id": r[0],
                    "deviceKey": r[1],
                    "label": r[2] or "",
                    "status": r[3],
                    "lastSeen": format_kst(r[4])
                })
            return {"status": "success", "enrollOpen": bool(enroll), "devices": devices}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"기기 목록 조회 오류: {str(e)}")

@router.post("/groups/{fg_id}/devices/{fd_id}/status")
def set_device_status(fg_id: int, fd_id: int, req: DeviceStatusRequest):
    """기기 상태 변경 API (approved 로 바꿀 때 인증키 발급)"""
    if req.status not in ('pending', 'approved', 'blocked'):
        raise HTTPException(status_code=400, detail="유효하지 않은 상태값입니다.")
    try:
        with engine.connect() as conn:
            cur = conn.execute(
                text("SELECT fd_auth_key FROM fair_device WHERE fd_id = :id AND fd_fg_id = :fg"),
                {"id": fd_id, "fg": fg_id}
            ).first()
            if not cur:
                raise HTTPException(status_code=404, detail="기기를 찾을 수 없습니다.")
            auth_key = cur[0]
            if req.status == 'approved' and not auth_key:
                auth_key = secrets.token_hex(32)
            conn.execute(
                text("UPDATE fair_device SET fd_status = :st, fd_auth_key = :ak WHERE fd_id = :id AND fd_fg_id = :fg"),
                {"st": req.status, "ak": auth_key, "id": fd_id, "fg": fg_id}
            )
            conn.commit()
            return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"기기 상태 변경 오류: {str(e)}")

@router.post("/groups/{fg_id}/enroll")
def toggle_enroll(fg_id: int, req: EnrollToggleRequest):
    """대회 등록잠금(신규 기기 등록 허용/차단) 토글 API"""
    try:
        with engine.connect() as conn:
            conn.execute(
                text("UPDATE fair_group SET fg_enroll_open = :v WHERE fg_id = :fg"),
                {"v": 1 if req.open else 0, "fg": fg_id}
            )
            conn.commit()
            return {"status": "success", "enrollOpen": req.open}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"등록잠금 변경 오류: {str(e)}")

@router.get("/groups/{fg_id}/results")
def get_group_results(fg_id: int):
    """특정 대회의 실시간 심사위원별 채점 데이터 일괄 집계 API"""
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text("""
                    SELECT 
                        r.fsr_fj_id, 
                        p.fp_code, 
                        r.fsr_fei_id, 
                        r.fsr_score
                    FROM fair_score_record r
                    JOIN fair_product p ON r.fsr_fp_id = p.fp_id
                    JOIN fair_buman b ON p.fp_fb_id = b.fb_id
                    WHERE b.fb_fg_id = :fg_id
                """),
                {"fg_id": fg_id}
            )
            
            scores_map = {}
            for r in rows:
                fj_id = str(r[0])
                p_code = r[1]
                fei_id = str(r[2])
                score = r[3]
                
                if fj_id not in scores_map:
                    scores_map[fj_id] = {}
                if p_code not in scores_map[fj_id]:
                    scores_map[fj_id][p_code] = {}
                scores_map[fj_id][p_code][fei_id] = score
                
            return {
                "status": "success",
                "scores": scores_map
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"결과 데이터 집계 중 오류 발생: {str(e)}")


# ==================== 관리자 계정 관리 (CRUD) ====================
class CreateAdminRequest(BaseModel):
    username: str
    password: str
    name: str
    groupIds: str # '*' 이면 전체, 혹은 '1,3' 형태의 대그룹 ID 목록

class UpdateAdminRequest(BaseModel):
    username: str
    password: str
    name: str
    groupIds: str

@router.get("/admins")
def list_admins(x_admin_username: Optional[str] = Header(None)):
    """등록된 모든 서브 관리자 목록 조회 (마스터 또는 전체 권한 관리자 허용)"""
    if not is_authorized_admin(x_admin_username):
        raise HTTPException(status_code=403, detail="권한이 없습니다. 마스터 또는 전체 권한 관리자만 접근 가능합니다.")
    try:
        with engine.connect() as conn:
            rows = conn.execute(text("SELECT fa_id, fa_username, fa_password, fa_name, fa_group_ids, fa_created_at FROM fair_admin ORDER BY fa_id ASC"))
            admins_list = []
            for r in rows:
                admins_list.append({
                    "id": r[0],
                    "username": r[1],
                    "password": r[2],
                    "name": r[3],
                    "groupIds": r[4],
                    "createdAt": format_kst(r[5])
                })
            return {"status": "success", "admins": admins_list}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"관리자 목록 조회 중 오류 발생: {str(e)}")

@router.post("/admins")
def create_admin(req: CreateAdminRequest, x_admin_username: Optional[str] = Header(None)):
    """신규 관리자 추가 (마스터 또는 전체 권한 관리자 허용)"""
    if not is_authorized_admin(x_admin_username):
        raise HTTPException(status_code=403, detail="권한이 없습니다. 마스터 또는 전체 권한 관리자만 접근 가능합니다.")
    env_master = os.getenv("ADMIN_MASTER", "adminmaster").strip()
    try:
        with engine.connect() as conn:
            with conn.begin():
                # ID 중복 체크
                exist = conn.execute(text("SELECT fa_id FROM fair_admin WHERE fa_username = :username"), {"username": req.username}).first()
                if exist or req.username == env_master:
                    raise HTTPException(status_code=400, detail="이미 존재하는 관리자 ID입니다.")
                
                conn.execute(
                    text("INSERT INTO fair_admin (fa_username, fa_password, fa_name, fa_group_ids) VALUES (:username, :password, :name, :group_ids)"),
                    {"username": req.username, "password": hash_password(req.password), "name": req.name, "group_ids": req.groupIds}
                )
            return {"status": "success", "message": "새 관리자가 성공적으로 추가되었습니다."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"관리자 추가 중 오류 발생: {str(e)}")

@router.put("/admins/{fa_id}")
def update_admin(fa_id: int, req: UpdateAdminRequest, x_admin_username: Optional[str] = Header(None)):
    """관리자 정보 수정 (마스터 또는 전체 권한 관리자 허용)"""
    if not is_authorized_admin(x_admin_username):
        raise HTTPException(status_code=403, detail="권한이 없습니다. 마스터 또는 전체 권한 관리자만 접근 가능합니다.")
    env_master = os.getenv("ADMIN_MASTER", "adminmaster").strip()
    try:
        with engine.connect() as conn:
            with conn.begin():
                # 관리자 존재 여부 확인
                exist = conn.execute(text("SELECT fa_id FROM fair_admin WHERE fa_id = :id"), {"id": fa_id}).first()
                if not exist:
                    raise HTTPException(status_code=404, detail="해당 관리자를 찾을 수 없습니다.")
                
                # ID 중복 체크 (자신 제외)
                dup = conn.execute(
                    text("SELECT fa_id FROM fair_admin WHERE fa_username = :username AND fa_id != :id"),
                    {"username": req.username, "id": fa_id}
                ).first()
                if dup or req.username == env_master:
                    raise HTTPException(status_code=400, detail="이미 존재하는 관리자 ID입니다.")
                
                # 패스워드 미지정 시 기존 비밀번호 유지
                if req.password == "__KEEP_PASSWORD__" or not req.password:
                    conn.execute(
                        text("UPDATE fair_admin SET fa_username = :username, fa_name = :name, fa_group_ids = :group_ids WHERE fa_id = :id"),
                        {"username": req.username, "name": req.name, "group_ids": req.groupIds, "id": fa_id}
                    )
                else:
                    conn.execute(
                        text("UPDATE fair_admin SET fa_username = :username, fa_password = :password, fa_name = :name, fa_group_ids = :group_ids WHERE fa_id = :id"),
                        {"username": req.username, "password": hash_password(req.password), "name": req.name, "group_ids": req.groupIds, "id": fa_id}
                    )
            return {"status": "success", "message": "관리자 정보가 성공적으로 수정되었습니다."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"관리자 수정 중 오류 발생: {str(e)}")

@router.delete("/admins/{fa_id}")
def delete_admin(fa_id: int, x_admin_username: Optional[str] = Header(None)):
    """관리자 삭제 (마스터 또는 전체 권한 관리자 허용)"""
    if not is_authorized_admin(x_admin_username):
        raise HTTPException(status_code=403, detail="권한이 없습니다. 마스터 또는 전체 권한 관리자만 접근 가능합니다.")
    try:
        with engine.connect() as conn:
            with conn.begin():
                exist = conn.execute(text("SELECT fa_id FROM fair_admin WHERE fa_id = :id"), {"id": fa_id}).first()
                if not exist:
                    raise HTTPException(status_code=404, detail="해당 관리자를 찾을 수 없습니다.")
                
                conn.execute(text("DELETE FROM fair_admin WHERE fa_id = :id"), {"id": fa_id})
            return {"status": "success", "message": "관리자 계정이 정상적으로 삭제되었습니다."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"관리자 삭제 중 오류 발생: {str(e)}")

