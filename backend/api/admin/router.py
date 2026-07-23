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
    convertTo: str = ""
    items: list[EvalItem]

class TemplatesMap(BaseModel):
    open: list[EvalGroup]
    blind: list[EvalGroup]

class SaveDetailsRequest(BaseModel):
    systemName: str
    period: str = ""
    status: str = "진행중"
    judges: list[JudgeItem]
    bumans: list[BumanItem]
    products: dict[str, list[ProductItem]]
    templates: TemplatesMap

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
            templates_map = {"open": [], "blind": []}
            
            # 오픈 방식 대표 평가 항목 세트 추출
            open_fb_id = next((b["id"] for b in bumans_list if b["type"] == "open"), None)
            if open_fb_id:
                res_groups = conn.execute(
                    text("SELECT DISTINCT fei_group_name FROM fair_evaluation_item WHERE fei_fb_id = :fb_id"),
                    {"fb_id": open_fb_id}
                )
                g_seq = 1000
                for rg in res_groups:
                    g_name = rg[0]
                    g_seq += 1
                    res_items = conn.execute(
                        text("SELECT fei_id, fei_name, fei_max_score, fei_convert_to FROM fair_evaluation_item WHERE fei_fb_id = :fb_id AND fei_group_name = :g_name ORDER BY fei_id ASC"),
                        {"fb_id": open_fb_id, "g_name": g_name}
                    )
                    items_list = []
                    convert_val = ""
                    for ri in res_items:
                        items_list.append({
                            "id": ri[0],
                            "name": ri[1],
                            "max": ri[2]
                        })
                        if ri[3] is not None:
                            convert_val = str(ri[3])
                    templates_map["open"].append({
                        "id": g_seq,
                        "name": g_name,
                        "convertTo": convert_val,
                        "items": items_list
                    })

            # 블라인드 방식 대표 평가 항목 세트 추출
            blind_fb_id = next((b["id"] for b in bumans_list if b["type"] == "blind"), None)
            if blind_fb_id:
                res_groups = conn.execute(
                    text("SELECT DISTINCT fei_group_name FROM fair_evaluation_item WHERE fei_fb_id = :fb_id"),
                    {"fb_id": blind_fb_id}
                )
                g_seq = 2000
                for rg in res_groups:
                    g_name = rg[0]
                    g_seq += 1
                    res_items = conn.execute(
                        text("SELECT fei_id, fei_name, fei_max_score, fei_convert_to FROM fair_evaluation_item WHERE fei_fb_id = :fb_id AND fei_group_name = :g_name ORDER BY fei_id ASC"),
                        {"fb_id": blind_fb_id, "g_name": g_name}
                    )
                    items_list = []
                    convert_val = ""
                    for ri in res_items:
                        items_list.append({
                            "id": ri[0],
                            "name": ri[1],
                            "max": ri[2]
                        })
                        if ri[3] is not None:
                            convert_val = str(ri[3])
                    templates_map["blind"].append({
                        "id": g_seq,
                        "name": g_name,
                        "convertTo": convert_val,
                        "items": items_list
                    })

            # 비어있을 시 디폴트 템플릿 구조 로딩
            if not templates_map["open"] and not templates_map["blind"]:
                templates_map = {
                    "open": [
                        {
                            "id": 1,
                            "name": "관능평가",
                            "convertTo": "70",
                            "items": [
                                { "id": 1, "name": "식품의 색", "max": 15 },
                                { "id": 2, "name": "식품의 향", "max": 15 },
                                { "id": 3, "name": "식품의 맛", "max": 30 },
                                { "id": 4, "name": "식품의 식감", "max": 20 },
                                { "id": 5, "name": "종합평가", "max": 20 }
                            ]
                        },
                        {
                            "id": 2,
                            "name": "상품성평가",
                            "convertTo": "",
                            "items": [
                                { "id": 6, "name": "창의성", "max": 30 },
                                { "id": 7, "name": "디자인", "max": 20 }
                            ]
                        }
                    ],
                    "blind": [
                        {
                            "id": 3,
                            "name": "관능평가",
                            "convertTo": "",
                            "items": [
                                { "id": 8, "name": "술의 색", "max": 20 },
                                { "id": 9, "name": "술의 향", "max": 20 },
                                { "id": 10, "name": "술의 맛", "max": 30 },
                                { "id": 11, "name": "후미 및 목넘김", "max": 20 },
                                { "id": 12, "name": "종합평가", "max": 30 }
                            ]
                        }
                    ]
                }

            return {
                "status": "success",
                "systemName": system_name,
                "period": period,
                "groupStatus": status,
                "judges": judges_list,
                "bumans": bumans_list,
                "products": products_map,
                "templates": templates_map
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

                # 6. 평가항목 기입
                # open
                for g in req.templates.open:
                    fb_id = g.id
                    if fb_id not in prefix_to_fb_id.values():
                        open_fb_ids = [prefix_to_fb_id[bm.prefix] for bm in req.bumans if bm.type == 'open']
                        fb_id = open_fb_ids[0] if open_fb_ids else None
                    
                    if fb_id:
                        for item in g.items:
                            conv_val = int(g.convertTo) if g.convertTo and g.convertTo.isdigit() else None
                            conn.execute(
                                text("INSERT INTO fair_evaluation_item (fei_fb_id, fei_group_name, fei_name, fei_max_score, fei_convert_to) VALUES (:fb_id, :g_name, :name, :max, :conv)"),
                                {"fb_id": fb_id, "g_name": g.name, "name": item.name, "max": item.max, "conv": conv_val}
                            )
                
                # blind
                for g in req.templates.blind:
                    fb_id = g.id
                    if fb_id not in prefix_to_fb_id.values():
                        blind_fb_ids = [prefix_to_fb_id[bm.prefix] for bm in req.bumans if bm.type == 'blind']
                        fb_id = blind_fb_ids[0] if blind_fb_ids else None
                    
                    if fb_id:
                        for item in g.items:
                            conv_val = int(g.convertTo) if g.convertTo and g.convertTo.isdigit() else None
                            conn.execute(
                                text("INSERT INTO fair_evaluation_item (fei_fb_id, fei_group_name, fei_name, fei_max_score, fei_convert_to) VALUES (:fb_id, :g_name, :name, :max, :conv)"),
                                {"fb_id": fb_id, "g_name": g.name, "name": item.name, "max": item.max, "conv": conv_val}
                            )

                trans.commit()
                return {
                    "status": "success",
                    "message": "대그룹 상세 설정이 데이터베이스에 일괄 저장 및 반영되었습니다."
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

