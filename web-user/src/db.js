// 오프라인 지원용 로컬 IndexedDB(Dexie) 계층 — 대회 캐시, 평가자 명단, 점수 저장/동기화
import Dexie from 'dexie';

export const db = new Dexie('kricefesta');

db.version(1).stores({
  // 대회 메타 캐시 (systemName/부문/제품/템플릿/평가자 명단). 최초 온라인 접속 시 저장 후 오프라인 진입에 사용
  meta: 'groupName',
  // 점수 셀: 복합 기본키로 중복 방지 [대회+평가자+부문+제품+항목], 조회/동기화용 보조 인덱스 포함
  scores: '[groupName+judgeName+bumanKey+productCode+itemId], [groupName+judgeName], syncStatus',
  // 대회별 현재 평가자 세션 (이름/ID/완료 상태/기기 인증)
  session: 'groupName',
});

// 기기 고유키 저장용 (브라우저당 1개)
db.version(2).stores({
  device: 'id',
});

// ---------- 대회 메타 캐시 ----------
export async function cacheInit(groupName, data) {
  await db.meta.put({ groupName, ...data, cachedAt: Date.now() });
}
export async function getCachedInit(groupName) {
  return db.meta.get(groupName);
}

// ---------- 평가자 세션 ----------
export async function saveSession(groupName, patch) {
  const prev = (await db.session.get(groupName)) || { groupName };
  await db.session.put({ ...prev, ...patch, groupName });
}
export async function getSession(groupName) {
  return db.session.get(groupName);
}

// ---------- 점수 셀 저장/삭제 ----------
export async function saveScoreCell(row) {
  // row: { groupName, judgeName, judgeId, bumanKey, productCode, itemId, score, syncStatus }
  await db.scores.put(row);
}
export async function getScoreCell({ groupName, judgeName, bumanKey, productCode, itemId }) {
  return await db.scores.get([groupName, judgeName, bumanKey, productCode, itemId]);
}
export async function deleteScoreCell({ groupName, judgeName, bumanKey, productCode, itemId }) {
  await db.scores.delete([groupName, judgeName, bumanKey, productCode, itemId]);
}

// 특정 평가자의 전체 점수를 화면 상태 형태 {[bumanKey]:{[productCode]:{[itemId]:score}}} 로 로드
export async function loadJudgeScores(groupName, judgeName) {
  const rows = await db.scores.where('[groupName+judgeName]').equals([groupName, judgeName]).toArray();
  const map = {};
  rows.forEach(r => {
    if (!map[r.bumanKey]) map[r.bumanKey] = {};
    if (!map[r.bumanKey][r.productCode]) map[r.bumanKey][r.productCode] = {};
    map[r.bumanKey][r.productCode][String(r.itemId)] = r.score;
  });
  return map;
}

// 동기화 대기(pending) 셀 목록
export async function getPendingCells(groupName, judgeName) {
  const rows = await db.scores.where('syncStatus').equals('pending').toArray();
  return rows.filter(r => r.groupName === groupName && r.judgeName === judgeName);
}
export async function markCellSynced(row) {
  await db.scores.update(
    [row.groupName, row.judgeName, row.bumanKey, row.productCode, row.itemId],
    { syncStatus: 'synced' }
  );
}

// ---------- 기기 고유키 ----------
export async function getDeviceKey() {
  let row = await db.device.get('this');
  if (!row) {
    const key = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : ('dk-' + Date.now() + '-' + Math.random().toString(16).slice(2));
    row = { id: 'this', key };
    await db.device.put(row);
  }
  return row.key;
}
