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

class EvalGroup(BaseModel):
    id: int = None
    name: str
    convertTo: Union[int, str, None] = ""
    items: list[EvalItem]

from typing import Union

class EvaluationTemplateItem(BaseModel):
    id: int = None
    target_type: str
    target_id: Union[int, str, None] = None
    groups: list[EvalGroup]

class SaveDetailsRequest(BaseModel):
    systemName: str
    period: str = ""
    status: str = "진행중"
    judges: list[JudgeItem]
    bumans: list[BumanItem]
    products: dict[str, list[ProductItem]]
    templates: list[EvaluationTemplateItem]

@router.get("/groups/{fg_id}/details")
def get_group_details(fg_id: int):
    """대그룹(품평회 대회) 상세 리소스 일괄 조회 API"""
    try:
        with engine.connect() as conn:
            g_row = conn.execute(
                text("SELECT fg_name, fg_period, fg_status FROM fair_group WHERE fg_id = :fg_id"),
                {"fg_id": fg_id}
            ).first()
            if not g_row:
                raise HTTPException(status_code=404, detail="해당 대그룹을 찾을 수 없습니다.")
            
            system_name = g_row[0]
            period = g_row[1] or ""
            status = g_row[2] or "진행중"

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
                    text("SELECT fei_id, fei_group_name, fei_name, fei_max_score, fei_convert_to FROM fair_evaluation_item WHERE fei_fet_id = :fet_id ORDER BY fei_id ASC"),
                    {"fet_id": fet_id}
                )
                
                # group_name 기준으로 그룹화
                group_map = {}
                g_seq = 10000
                for ri in res_items:
                    fei_id, group_name, name, max_score, convert_to = ri
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
                        "max": max_score
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
def save_group_details(fg_id: int, req: SaveDetailsRequest):
    """대그룹(품평회 대회) 상세 리소스 일괄 저장 API"""
    try:
        with engine.connect() as conn:
            trans = conn.begin()
            try:
                # 1. 대회 정보 업데이트
                conn.execute(
                    text("UPDATE fair_group SET fg_name = :name, fg_period = :period, fg_status = :status WHERE fg_id = :fg_id"),
                    {"name": req.systemName, "period": req.period, "status": req.status, "fg_id": fg_id}
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
                                text("INSERT INTO fair_evaluation_item (fei_fet_id, fei_group_name, fei_name, fei_max_score, fei_convert_to) VALUES (:fet_id, :g_name, :name, :max, :conv)"),
                                {"fet_id": inserted_fet_id, "g_name": g.name, "name": item.name, "max": item.max, "conv": conv_val}
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

