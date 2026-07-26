// K-라이스페스타 전문가 품평회 평가자용 종합 앱 (로그인, 채점 시트, 팝업 모달, 결과 리포트 통합)
import React, { useState, useEffect } from 'react';
import {
  cacheInit, getCachedInit,
  saveSession, getSession,
  saveScoreCell, deleteScoreCell, loadJudgeScores,
  getPendingCells, markCellSynced,
  getDeviceKey,
} from './db';

// API Base URL 자동 인젝션용 fetch 랩핑
const originalFetch = window.fetch;
window.fetch = async (input, init) => {
  let url = typeof input === 'string' ? input : input.url;
  
  const backendBase = "http://localhost:18000/api";
  const configuredBase = (import.meta.env.VITE_API_URL || backendBase).replace(/\/$/, "");
  
  if (url.startsWith(backendBase)) {
    url = url.replace(backendBase, configuredBase);
  } else if (url.startsWith("/api")) {
    url = configuredBase + url.substring(4);
  }
  
  if (typeof input === 'string') {
    return originalFetch(url, init);
  } else {
    const newRequest = new Request(url, input);
    return originalFetch(newRequest, init);
  }
};

// 디자인 시안의 상수 데이터 이식
const ITEMS = {
  ricefood: {
    label: '쌀가공식품',
    blind: false,
    convert: true,
    gwan: [
      { key: 'color', name: '식품의 색', max: 15, scale: [3, 6, 9, 12, 15] },
      { key: 'aroma', name: '식품의 향', max: 15, scale: [3, 6, 9, 12, 15] },
      { key: 'taste', name: '식품의 맛', max: 30, scale: [6, 12, 18, 24, 30] },
      { key: 'texture', name: '식품의 식감', max: 20, scale: [4, 8, 12, 16, 20] },
      { key: 'overall', name: '종합평가', max: 20, scale: [4, 8, 12, 16, 20] },
    ],
    sang: [
      { key: 'creativity', name: '창의성', max: 30, scale: [6, 12, 18, 24, 30] },
      { key: 'design', name: '디자인', max: 20, scale: [4, 8, 12, 16, 20] },
    ],
  },
  woolisul: {
    label: '우리술',
    blind: true,
    convert: false,
    gwan: [
      { key: 'color', name: '술의 색', max: 20, scale: [4, 8, 12, 16, 20] },
      { key: 'aroma', name: '술의 향', max: 20, scale: [4, 8, 12, 16, 20] },
      { key: 'taste', name: '술의 맛', max: 30, scale: [6, 12, 18, 24, 30] },
      { key: 'finish', name: '후미 및 목넘김', max: 20, scale: [4, 8, 12, 16, 20] },
      { key: 'overall', name: '종합평가', max: 30, scale: [6, 12, 18, 24, 30] },
    ],
    sang: [],
  },
};

const BUMANS = [
  { key: 'A', cat: 'ricefood', name: '조리', prefix: 'A', test: '오픈테스트' },
  { key: 'B', cat: 'ricefood', name: '비조리', prefix: 'B', test: '오픈테스트' },
  { key: 'C', cat: 'ricefood', name: '농협', prefix: 'C', test: '오픈테스트' },
  { key: 'ga', cat: 'woolisul', name: '저도발효주', prefix: '가', test: '블라인드' },
  { key: 'na', cat: 'woolisul', name: '고도발효주', prefix: '나', test: '블라인드' },
  { key: 'da', cat: 'woolisul', name: '약·청주', prefix: '다', test: '블라인드' },
  { key: 'ra', cat: 'woolisul', name: '증류주', prefix: '라', test: '블라인드 · 임시(우리술 동일 구조)' },
];


function App() {
  // 경로 파라미터에서만 groupName 추출 (예: /krice2026)
  const pathGroup = window.location.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
  const groupName = pathGroup;

  const [access, setAccess] = useState('checking'); // checking | granted | denied
  const [screen, setScreen] = useState('start'); // start | eval | done
  const [judgeName, setJudgeName] = useState('');
  const [judgeId, setJudgeId] = useState(null);
  const [selectedBuman, setSelectedBuman] = useState('A');
  const [scores, setScores] = useState({}); // { [bumanKey]: { [productCode]: { [itemKey]: value } } }
  const [completed, setCompleted] = useState({}); // { [bumanKey]: boolean }
  const [modal, setModal] = useState(null); // { code, itemKey } | null
  const [toast, setToast] = useState('');

  // API 동적 데이터 바인딩 상태
  const [systemName, setSystemName] = useState('2026 우리쌀·우리술 K-라이스페스타 품평회');
  const [period, setPeriod] = useState('2026.09.01 – 09.03');
  const [bumans, setBumans] = useState(BUMANS);
  const [productsMap, setProductsMap] = useState({});
  const [templatesMap, setTemplatesMap] = useState({});
  const [judges, setJudges] = useState([]);
  const [deviceKey, setDeviceKey] = useState('');
  const [authKey, setAuthKey] = useState(null);
  const [deviceStatus, setDeviceStatus] = useState('checking'); // checking|pending|approved|blocked|rejected|offline
  const [deviceLabel, setDeviceLabel] = useState('');

  // 브라우저 탭 타이틀을 대그룹 명칭으로 동적 갱신
  useEffect(() => {
    if (systemName) {
      document.title = systemName;
    }
  }, [systemName]);

  // 마운트 시 로컬 세션(평가자/완료 상태/화면 상태) 복구
  useEffect(() => {
    if (!groupName) return;
    (async () => {
      try {
        const sess = await getSession(groupName);
        if (sess) {
          if (sess.judgeName) setJudgeName(sess.judgeName);
          if (sess.judgeId) setJudgeId(sess.judgeId);
          if (sess.completed) setCompleted(sess.completed);
          if (sess.deviceLabel) setDeviceLabel(sess.deviceLabel);
          
          if (sess.judgeName && sess.judgeId) {
            const localScores = await loadJudgeScores(groupName, sess.judgeName);
            setScores(localScores);
            
            const restoredScreen = sess.screen || 'start';
            setScreen(restoredScreen);
            window.history.replaceState({ screen: restoredScreen }, '');
            
            if (sess.selectedBuman) {
              setSelectedBuman(sess.selectedBuman);
            }
          }
        }
      } catch (e) {
        console.error('세션 복구 에러:', e);
      }
    })();
  }, [groupName]);

  // 활성 부문 변경 시 세션에 자동 저장
  useEffect(() => {
    if (groupName && selectedBuman) {
      saveSession(groupName, { selectedBuman });
    }
  }, [selectedBuman, groupName]);

  // 온라인 복귀 시 미동기화 점수 자동 전송
  useEffect(() => {
    const onOnline = () => {
      const nm = judgeName.trim();
      if (judgeId && nm) syncPending(nm, judgeId);
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [judgeId, judgeName, groupName, deviceKey, authKey]);

  // 대회 초기화: 온라인이면 서버 로드+캐시, 오프라인이면 캐시로 진입 검증
  useEffect(() => {
    if (!groupName) {
      setAccess('denied');
      return;
    }
    const applyInit = async (data) => {
      if (data.systemName) setSystemName(data.systemName);
      if (data.period) setPeriod(data.period);
      if (data.bumans && data.bumans.length > 0) {
        const mappedBumans = data.bumans.map(b => {
          const isWoolisul = b.group === '우리술' || b.name.includes('주') || b.name.includes('술');
          return {
            key: b.prefix,
            cat: isWoolisul ? 'woolisul' : 'ricefood',
            group: b.group || '',
            name: b.name,
            prefix: b.prefix,
            test: b.type === 'open' ? '오픈테스트' : '블라인드'
          };
        });
        setBumans(mappedBumans);
        
        // 세션 정보 확인하여 이전에 탭(selectedBuman)이 저장되어 있다면 복원, 없으면 첫번째 지정
        const s = await getSession(groupName);
        if (s && s.selectedBuman) {
          setSelectedBuman(s.selectedBuman);
        } else {
          setSelectedBuman(mappedBumans[0].prefix);
        }
      }
      if (data.products) setProductsMap(data.products);
      if (data.templates) setTemplatesMap(data.templates);
      if (data.judges) setJudges(data.judges);
    };
    const run = async () => {
      const dk = await getDeviceKey();
      setDeviceKey(dk);
      let sess = null;
      try { sess = await getSession(groupName); } catch (se) { /* noop */ }
      try {
        // 1) 기기 상태만 확인 (저장 안 함 — 등록 요청 전에는 서버에 쌓이지 않음)
        const reg = await fetch(`http://localhost:18000/api/user/groups/${groupName}/device/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceKey: dk })
        });
        const rdata = await reg.json();
        setDeviceStatus(rdata.status);
        if (rdata.status === 'approved' && rdata.authKey) {
          setAuthKey(rdata.authKey);
          await saveSession(groupName, { authKey: rdata.authKey, deviceStatus: 'approved' });
          // 2) 승인 기기만 대회 데이터 수신
          const res = await fetch(`http://localhost:18000/api/user/groups/${groupName}/init`, {
            headers: { "X-Device-Key": dk, "X-Auth-Key": rdata.authKey }
          });
          if (res.ok) {
            const data = await res.json();
            await applyInit(data);
            try { await cacheInit(groupName, data); } catch (ce) { console.error('대회 캐시 저장 에러:', ce); }
            setAccess('granted');
          } else {
            setAccess('denied');
          }
        } else {
          // pending | rejected | blocked
          await saveSession(groupName, { deviceStatus: rdata.status });
          setAccess('device');
        }
      } catch (e) {
        // 오프라인: 캐시된 인증/대회 데이터로 진입 시도
        console.error('기기 등록/초기화 오프라인 처리:', e);
        try {
          const cached = await getCachedInit(groupName);
          if (sess && sess.deviceStatus === 'approved' && sess.authKey && cached) {
            setAuthKey(sess.authKey);
            setDeviceStatus('approved');
            await applyInit(cached);
            setAccess('granted');
          } else {
            setDeviceStatus((sess && sess.deviceStatus) ? sess.deviceStatus : 'offline');
            setAccess('device');
          }
        } catch (e2) {
          console.error('오프라인 캐시 조회 에러:', e2);
          setAccess('device');
        }
      }
    };
    run();
  }, [groupName]);

  // 기기 인증 헤더 (서버 전송 시 승인 기기 재확인용)
  const authHeaders = () => ({
    "Content-Type": "application/json",
    "X-Device-Key": deviceKey,
    "X-Auth-Key": authKey || ""
  });

  // 오프라인 중 저장된 미동기화(pending) 점수를 서버로 전송하고 synced 처리
  const syncPending = async (name, jid) => {
    if (!jid || !name) return;
    try {
      const pending = await getPendingCells(groupName, name);
      for (const cell of pending) {
        try {
          const res = await fetch(`http://localhost:18000/api/user/groups/${groupName}/score`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({
              judgeId: jid,
              productCode: cell.productCode,
              itemId: isNaN(cell.itemId) ? 0 : parseInt(cell.itemId),
              score: cell.score
            })
          });
          if (res.ok) await markCellSynced(cell);
          else break;
        } catch (e) {
          break; // 여전히 오프라인 → 다음 온라인에 재시도
        }
      }
    } catch (e) {
      console.error('점수 동기화 에러:', e);
    }
  };

  // 평가자 확정 후 로컬 점수 로드 + 세션 저장 + 평가 화면 진입
  const enterEval = async (name, jid, serverScores, isOnline) => {
    setJudgeId(jid);
    await saveSession(groupName, { judgeName: name, judgeId: jid });
    // 온라인 로그인 시 서버 복원 점수를 로컬(synced)로 반영
    if (isOnline && serverScores) {
      for (const bk of Object.keys(serverScores)) {
        for (const code of Object.keys(serverScores[bk])) {
          for (const itemId of Object.keys(serverScores[bk][code])) {
            await saveScoreCell({ groupName, judgeName: name, judgeId: jid, bumanKey: bk, productCode: code, itemId, score: serverScores[bk][code][itemId], syncStatus: 'synced' });
          }
        }
      }
    }
    // 로컬(오프라인 입력 포함)을 최종 소스로 로드
    const localScores = await loadJudgeScores(groupName, name);
    setScores(localScores);
    if (isOnline) await syncPending(name, jid);
    navTo('eval');
  };

  // Toast 노출 제어
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => {
      setToast('');
    }, 2000);
  };

  // 화면 이동 헬퍼: 브라우저 히스토리에 기록해 뒤로가기 지원 및 세션 상태 동기화
  const navTo = (next) => {
    window.history.pushState({ screen: next }, '');
    setScreen(next);
    saveSession(groupName, { screen: next });
  };

  // 브라우저 뒤로/앞으로 가기와 화면 상태 동기화
  useEffect(() => {
    const initHistory = async () => {
      const sess = await getSession(groupName);
      const initialScreen = sess && sess.screen ? sess.screen : 'start';
      window.history.replaceState({ screen: initialScreen }, '');
    };
    initHistory();

    const onPop = async (e) => {
      const st = e.state;
      const nextScreen = st && st.screen ? st.screen : 'start';
      setScreen(nextScreen);
      await saveSession(groupName, { screen: nextScreen });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [groupName]);

  // 현재 활성 부문 객체 조회
  const buman = bumans.find((b) => b.key === selectedBuman) || bumans[0] || BUMANS[0];
  // 로컬 카테고리 정의(관능/상품성 항목·환산 규칙). 서버 템플릿이 없을 때의 fallback 및 헤더·요약 표시에 사용
  const cat = ITEMS[buman.cat] || ITEMS.ricefood;
  const serverBumanTemplate = templatesMap[selectedBuman];
  const hasServerTemplate = serverBumanTemplate && serverBumanTemplate.length > 0;

  // 부문 키로 활성 평가항목 평면 배열 구성 (관리자 등록 템플릿 우선, 없으면 로컬 기본값). 탭바/시트 공통 사용
  const buildActiveItems = (bumanKey) => {
    const tpl = templatesMap[bumanKey];
    if (tpl && tpl.length > 0) {
      const items = [];
      tpl.forEach(g => {
        (g.items || []).forEach(it => {
          items.push({ id: it.id, key: String(it.id), name: it.name, max: it.max, scale: it.scale, groupName: g.name });
        });
      });
      return items;
    }
    const b = bumans.find(x => x.key === bumanKey) || BUMANS.find(x => x.key === bumanKey) || BUMANS[0];
    const c = ITEMS[b.cat] || ITEMS.ricefood;
    return [
      ...c.gwan.map(x => ({ ...x, id: x.key, key: x.key, groupName: '관능평가' })),
      ...c.sang.map(x => ({ ...x, id: x.key, key: x.key, groupName: '상품성평가' }))
    ];
  };
  const activeItems = buildActiveItems(selectedBuman);

  // 한 제품 점수맵으로 소계 계산 (관리자 템플릿 우선·환산 반영). 시트/결과요약 공통 사용
  const calcSubtotal = (pScores, bumanKey) => {
    const tpl = templatesMap[bumanKey];
    if (tpl && tpl.length > 0) {
      let total = 0;
      tpl.forEach(g => {
        const gSum = (g.items || []).reduce((sum, it) => sum + (pScores[String(it.id)] || 0), 0);
        const gMax = (g.items || []).reduce((sum, it) => sum + (parseInt(it.max) || 0), 0);
        const gConv = parseInt(g.convertTo) || 0;
        total += (gConv > 0 && gMax > 0) ? Math.round((gSum / gMax) * gConv * 10) / 10 : gSum;
      });
      return Math.round(total * 10) / 10;
    }
    const b = bumans.find(x => x.key === bumanKey) || BUMANS.find(x => x.key === bumanKey) || BUMANS[0];
    const c = ITEMS[b.cat] || ITEMS.ricefood;
    const gwanSum = c.gwan.reduce((sum, it) => sum + (pScores[it.key] || 0), 0);
    const sangSum = c.sang.reduce((sum, it) => sum + (pScores[it.key] || 0), 0);
    const cv = c.convert ? Math.round(gwanSum * 0.7 * 10) / 10 : gwanSum;
    return c.convert ? Math.round((cv + sangSum) * 10) / 10 : gwanSum;
  };

  // 현재 부문 소계 만점 (관리자 배점·환산 반영)
  const subtotalMax = hasServerTemplate
    ? Math.round(serverBumanTemplate.reduce((sum, g) => {
        const gMax = (g.items || []).reduce((a, it) => a + (parseInt(it.max) || 0), 0);
        const gConv = parseInt(g.convertTo) || 0;
        return sum + (gConv > 0 ? gConv : gMax);
      }, 0))
    : (cat.convert
        ? Math.round(cat.gwan.reduce((a, it) => a + (it.max || 0), 0) * 0.7) + cat.sang.reduce((a, it) => a + (it.max || 0), 0)
        : cat.gwan.reduce((a, it) => a + (it.max || 0), 0));

  // 제품 목록 가져오기
  const getProductList = (bumanKey) => {
    // 관리자에 등록된 제품만 사용. 미등록 부문은 빈 목록 반환(가짜 제품 생성하지 않음)
    return productsMap[bumanKey] || [];
  };

  // 로그인 (시작) 확인
  const handleStart = async (e) => {
    e.preventDefault();
    if (!judgeName.trim()) {
      alert('평가자 성명을 기입해 주세요.');
      return;
    }
    
    const name = judgeName.trim();
    try {
      const res = await fetch(`http://localhost:18000/api/user/groups/${groupName}/login`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ judgeName: name })
      });
      if (res.ok) {
        const data = await res.json();
        await enterEval(name, data.judgeId, data.scores, true);
      } else {
        // 관리자에 등록된 평가자가 아니면 서버 메시지 그대로 노출하고 진입 차단
        let msg = "평가를 시작할 수 없습니다. 잠시 후 다시 시도해 주세요.";
        try {
          const errData = await res.json();
          if (errData && errData.detail) msg = errData.detail;
        } catch (e) { /* noop */ }
        alert(msg);
      }
    } catch (err) {
      // 오프라인: 캐시된 평가자 명단으로 검증 후 진입
      console.error("로그인 API 에러(오프라인 검증 시도):", err);
      const cachedJudge = judges.find(j => j.name === name);
      if (!cachedJudge) {
        alert('오프라인 상태입니다. 등록된 평가자 명단에 없는 이름이거나 대회 데이터가 아직 캐시되지 않았습니다.');
        return;
      }
      await enterEval(name, cachedJudge.id, null, false);
    }
  };

  // 기기 등록 요청 (미승인 화면에서 기기 이름 제출)
  const handleRegisterDevice = async () => {
    const label = deviceLabel.trim();
    if (!label) { alert('기기 이름을 입력해 주세요.'); return; }
    try {
      const dk = deviceKey || await getDeviceKey();
      const reg = await fetch(`http://localhost:18000/api/user/groups/${groupName}/device/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceKey: dk, label })
      });
      const rdata = await reg.json();
      setDeviceStatus(rdata.status);
      await saveSession(groupName, { deviceLabel: label, deviceStatus: rdata.status });
      if (rdata.status === 'approved') {
        window.location.reload();
      }
    } catch (e) {
      console.error('기기 등록 에러:', e);
      alert('서버에 연결할 수 없습니다. 네트워크를 확인해 주세요.');
    }
  };

  // 단일 셀 점수 입력
  const pickScore = async (code, itemKey, val) => {
    const nextScores = { ...scores };
    const bScores = { ...(nextScores[selectedBuman] || {}) };
    const pScores = { ...(bScores[code] || {}) };

    pScores[itemKey] = val;
    bScores[code] = pScores;
    nextScores[selectedBuman] = bScores;

    setScores(nextScores);
    setModal(null);

    const name = judgeName.trim();
    // 로컬 우선 저장 (pending) — 오프라인에서도 보존
    await saveScoreCell({ groupName, judgeName: name, judgeId, bumanKey: selectedBuman, productCode: code, itemId: String(itemKey), score: val, syncStatus: 'pending' });

    // 서버 실시간 동기화 시도 → 성공 시 synced
    if (judgeId) {
      try {
        const res = await fetch(`http://localhost:18000/api/user/groups/${groupName}/score`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            judgeId,
            productCode: code,
            itemId: isNaN(itemKey) ? 0 : parseInt(itemKey),
            score: val
          })
        });
        if (res.ok) await markCellSynced({ groupName, judgeName: name, bumanKey: selectedBuman, productCode: code, itemId: String(itemKey) });
      } catch (e) {
        console.error("실시간 배점 동기화 실패:", e);
      }
    }
  };

  // 입력된 점수 초기화
  const clearScore = async (code, itemKey) => {
    const nextScores = { ...scores };
    const bScores = { ...(nextScores[selectedBuman] || {}) };
    const pScores = { ...(bScores[code] || {}) };

    delete pScores[itemKey];
    bScores[code] = pScores;
    nextScores[selectedBuman] = bScores;

    setScores(nextScores);
    setModal(null);

    const name = judgeName.trim();
    // 로컬 셀 삭제
    await deleteScoreCell({ groupName, judgeName: name, bumanKey: selectedBuman, productCode: code, itemId: String(itemKey) });

    // 서버 실시간 동기화 (삭제)
    if (judgeId) {
      try {
        await fetch(`http://localhost:18000/api/user/groups/${groupName}/score`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            judgeId,
            productCode: code,
            itemId: isNaN(itemKey) ? 0 : parseInt(itemKey),
            score: null
          })
        });
      } catch (e) {
        console.error("실시간 배점 삭제 실패:", e);
      }
    }
  };

  // 엑셀 모의 저장 기능
  const handleSaveExcel = () => {
    showToast('엑셀 파일 저장 프로세스가 호출되었습니다.');
    const headers = ["제품분류코드", "제품명", ...activeItems.map(it => it.name), "소계"];
    const rows = getProductList(selectedBuman).map(p => {
      const s = scores[selectedBuman]?.[p.code] || {};
      const row = [p.code, buman.cat === 'woolisul' ? '블라인드' : p.name];
      activeItems.forEach(it => {
        row.push(s[it.key] !== undefined ? s[it.key] : '미입력');
      });
      
      // 소계 계산
      let subtotal = 0;
      if (hasServerTemplate) {
        let totalRaw = 0;
        let totalConverted = 0;
        serverBumanTemplate.forEach(g => {
          let gSum = (g.items || []).reduce((sum, it) => sum + (s[String(it.id)] || 0), 0);
          const gMax = (g.items || []).reduce((sum, it) => sum + (parseInt(it.max) || 0), 0);
          const gConv = parseInt(g.convertTo) || 0;
          let gFinal = gSum;
          if (gConv > 0 && gMax > 0) {
            gFinal = Math.round((gSum / gMax) * gConv);
          }
          totalRaw += gSum;
          totalConverted += gFinal;
        });
        subtotal = totalConverted;
      } else {
        const cat = ITEMS[buman.cat];
        const gwanSum = cat.gwan.reduce((sum, it) => sum + (s[it.key] || 0), 0);
        const sangSum = cat.sang.reduce((sum, it) => sum + (s[it.key] || 0), 0);
        if (cat.convert) {
          const cv = Math.round(gwanSum * 0.7 * 10) / 10;
          subtotal = Math.round((cv + sangSum) * 10) / 10;
        } else {
          subtotal = gwanSum;
        }
      }
      row.push(subtotal);
      return row;
    });

    console.log("엑셀 데이터 저장 내역:", { headers, rows });
  };

  // 배점완료 제출 처리
  const handleComplete = async () => {
    // 모든 제품의 모든 채점 항목이 기입되어 있는지 체크
    const bScores = scores[selectedBuman] || {};
    const plist = getProductList(selectedBuman);
    if (plist.length === 0) {
      alert('이 부문에는 등록된 평가 제품이 없습니다.');
      return;
    }
    const allFilled = plist.every(p => {
      const s = bScores[p.code] || {};
      return activeItems.every(it => s[it.key] !== undefined);
    });

    if (!allFilled) {
      alert('아직 미입력된 배점 항목이 존재합니다. 모든 평가 셀을 기입해 주세요.');
      return;
    }

    // 배점완료(최종 제출)는 서버 확인이 필요 — 오프라인이면 경고 후 중단.
    // 입력한 점수는 이미 로컬에 저장되어 있어 유실되지 않고, 연결 후 다시 제출하면 됨.
    try {
      await syncPending(judgeName.trim(), judgeId); // 미동기화 점수 먼저 전송
      const res = await fetch(`http://localhost:18000/api/user/groups/${groupName}/complete`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ judgeId, bumanPrefix: selectedBuman })
      });
      if (!res.ok) {
        alert("서버 제출에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
    } catch (e) {
      console.error("완료 제출 에러:", e);
      alert("인터넷 연결을 확인해 주세요. 입력한 점수는 로컬에 저장되어 있으니, 연결된 뒤 배점완료를 다시 눌러 주세요.");
      return;
    }

    const nextCompleted = { ...completed, [selectedBuman]: true };
    setCompleted(nextCompleted);
    await saveSession(groupName, { completed: nextCompleted });
    navTo('done');
  };

  // 현재 화면에 렌더링될 점수 관련 진행도 연산
  const products = getProductList(selectedBuman);
  const bScores = scores[selectedBuman] || {};
  const totalCount = products.length * activeItems.length;
  let filledCount = 0;
  products.forEach(p => {
    const s = bScores[p.code] || {};
    activeItems.forEach(it => {
      if (s[it.key] !== undefined) filledCount++;
    });
  });

  // 접근 게이트: 유효한 대회 코드로 API 검증 성공 시에만 평가 페이지 노출
  if (access === 'checking') {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-[#eef1f6] text-[#5a6a82] text-[16px] font-semibold">
        품평회 정보를 확인하는 중입니다...
      </div>
    );
  }
  if (access === 'denied') {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-[#eef1f6] text-center px-6">
        <div className="text-[52px] font-extrabold text-[#1b2a4a] leading-none">404</div>
        <div className="mt-4 text-[18px] font-bold text-[#2b3646]">존재하지 않는 품평회입니다.</div>
        <div className="mt-2 text-[14px] text-[#8b97ab]">주소를 다시 확인해 주세요.</div>
      </div>
    );
  }

  // 기기 미승인/대기 화면
  if (access === 'device') {
    const msg = deviceStatus === 'pending'
      ? '관리자 승인 대기 중입니다. 승인 후 새로고침해 주세요.'
      : deviceStatus === 'blocked'
      ? '차단된 기기입니다. 관리자에게 문의해 주세요.'
      : deviceStatus === 'rejected'
      ? '신규 기기 등록이 잠겨 있습니다. 관리자에게 문의해 주세요.'
      : deviceStatus === 'offline'
      ? '오프라인 상태입니다. 최초 1회는 온라인에서 기기 인증이 필요합니다.'
      : '이 기기는 아직 인증되지 않았습니다. 기기 이름을 입력하고 등록을 요청한 뒤, 관리자 승인 후 새로고침해 주세요.';
    const canRegister = deviceStatus !== 'blocked' && deviceStatus !== 'rejected' && deviceStatus !== 'offline';
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-[#eef1f6] px-6">
        <div className="w-full max-w-[460px] bg-white rounded-[20px] shadow-[0_20px_60px_rgba(27,42,74,0.12)] p-[36px]">
          <div className="text-[13px] tracking-[2px] text-[#d9b866] font-bold">DEVICE AUTH</div>
          <h2 className="mt-[10px] text-[22px] font-extrabold text-[#1b2a4a]">기기 인증이 필요합니다</h2>
          <p className="mt-[12px] text-[15px] text-[#5a6a82] leading-[1.6]">{msg}</p>
          {canRegister && (
            <div className="mt-[24px]">
              <label className="block text-[13px] font-bold text-[#5a6a82]">기기 이름</label>
              <input
                type="text"
                value={deviceLabel}
                onChange={(e) => setDeviceLabel(e.target.value)}
                placeholder="예) 심사장 태블릿 1번"
                className="mt-[8px] w-full h-[50px] border-[1.5px] border-[#cbd3e1] rounded-[12px] px-[16px] text-[16px] font-semibold text-[#1b2a4a] bg-white focus:outline-none focus:border-[#1b2a4a]"
              />
              <button
                onClick={handleRegisterDevice}
                className="mt-[16px] w-full h-[52px] rounded-[12px] bg-[#1b2a4a] text-white text-[16px] font-extrabold hover:bg-[#243a63] transition-all"
              >
                기기 등록 요청
              </button>
            </div>
          )}
          <button
            onClick={() => window.location.reload()}
            className="mt-[12px] w-full h-[48px] rounded-[12px] border border-[#cbd3e1] bg-white text-[#5a6a82] text-[15px] font-bold hover:bg-gray-50 transition-all"
          >
            새로고침
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#eef1f6] text-[#2b3646] flex flex-col select-none">
      
      {/* 1) 시작 화면 (screen === 'start') */}
      {screen === 'start' && (
        <div className="flex-1 flex overflow-hidden">
          {/* 좌측 배너 영역 */}
          <div className="w-[40%] min-w-[380px] shrink-0 bg-gradient-to-b from-[#1b2a4a] to-[#243a63] text-white py-[64px] px-[56px] flex flex-col justify-between">
            <div>
              <div className="text-[14px] tracking-[3px] text-[#d9b866] font-bold">
                EXPERT EVALUATION
              </div>
              <h1 className="text-[40px] font-extrabold mt-[22px] leading-[1.25]">
                전문가 품평회<br />평가 시스템
              </h1>
              <p className="text-[17px] text-bannerText mt-[20px] leading-[1.7]">
                {systemName}
              </p>
            </div>
            <div className="text-[14px] text-bannerSub leading-[1.8]">
              태블릿 전용 · 블라인드/오픈 테스트<br />
              5단계 척도법 · 120점 만점
            </div>
          </div>

          {/* 우측 로그인 폼 영역 */}
          <div className="flex-1 min-w-0 p-[48px] flex items-center justify-center overflow-auto">
            <div className="w-full max-w-[640px]">
              <h2 className="text-[24px] font-extrabold text-[#1b2a4a] leading-none">
                평가 시작
              </h2>
              <p className="text-[15px] text-textInfo mt-[8px] leading-[1.2]">
                평가자명을 입력하고 담당 부문을 선택하세요.
              </p>

              <form onSubmit={handleStart}>
                {/* 성명 입력 */}
                <div className="mt-[32px]">
                  <label className="block text-[14px] font-bold text-textSub leading-none">
                    평가자 (심사위원 성명)
                  </label>
                  <input
                    type="text"
                    value={judgeName}
                    onChange={(e) => setJudgeName(e.target.value)}
                    className="mt-[10px] w-full h-[56px] border-[1.5px] border-[#cbd3e1] rounded-[12px] px-[18px] text-[18px] font-semibold text-[#1b2a4a] bg-white focus:outline-none focus:border-[#1b2a4a] transition-all"
                    placeholder="예) 홍길동 심사위원"
                    required
                  />
                </div>

                {/* 부문 선택 */}
                <div className="mt-[30px]">
                  <div className="text-[14px] font-bold text-textSub leading-none">
                    담당 부문 선택
                  </div>

                  {/* 관리자에 등록된 부문 그룹(group) 기준으로 동적 렌더링 */}
                  {[...new Set(bumans.map(b => b.group || '기타'))].map((groupName, gIdx) => {
                    const groupBumans = bumans.filter(b => (b.group || '기타') === groupName);
                    const test = groupBumans[0]?.test || '';
                    const isBlind = test === '블라인드';
                    const cols = groupBumans.length >= 4 ? 'grid-cols-4' : 'grid-cols-3';
                    return (
                      <React.Fragment key={groupName}>
                        <div className={`text-[12px] font-extrabold ${isBlind ? 'text-brandBlue' : 'text-brandGreen'} ${gIdx === 0 ? 'mt-[14px]' : 'mt-[18px]'} tracking-[1px] leading-none`}>
                          {groupName} · {test}
                        </div>
                        <div className={`grid ${cols} gap-[10px] mt-[8px]`}>
                          {groupBumans.map((item) => (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() => setSelectedBuman(item.key)}
                              className={`h-[84px] w-full px-[8px] rounded-[12px] flex flex-col items-center justify-center text-center border-2 transition-all cursor-pointer ${
                                selectedBuman === item.key
                                  ? 'border-[#1b2a4a] bg-[#1b2a4a] text-white shadow-[0_6px_18px_rgba(27,42,74,0.22)]'
                                  : 'border-[#e2e7ef] bg-white text-textSub hover:border-gray-300 shadow-none'
                              }`}
                            >
                              <div className="text-[22px] font-extrabold leading-none">{item.prefix}</div>
                              <div className="text-[13px] font-semibold mt-[4px] leading-none">{item.name}</div>
                            </button>
                          ))}
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>

                {/* 시작 버튼 */}
                <button
                  type="submit"
                  disabled={!judgeName.trim()}
                  className={`w-full h-[56px] rounded-[12px] text-[18px] mt-[40px] transition-all flex items-center justify-center ${
                    judgeName.trim().length > 0
                      ? 'bg-[#1b2a4a] hover:bg-[#243a63] text-white font-extrabold shadow-lg hover:shadow-xl cursor-pointer'
                      : 'bg-[#c3ccdb] text-white font-bold cursor-default'
                  }`}
                >
                  평가 시작하기 →
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 2) 평가 화면 (screen === 'eval') */}
      {screen === 'eval' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          
          {/* 상단 네비게이션 헤더 */}
          <div className="bg-[#1b2a4a] color-white text-white padding-x-[22px] px-[22px] py-[12px] flex items-center gap-[18px] shrink-0">
            <button
              onClick={() => window.history.back()}
              className="bg-transparent border border-[#45577f] text-[#c6d2ea] rounded-[9px] h-[40px] px-[14px] font-semibold cursor-pointer text-[14px] hover:bg-[#243a63] transition-all"
            >
              ← 부문
            </button>
            <div className="min-w-0">
              <div className="text-[16px] font-extrabold truncate">
                {systemName}
              </div>
              <div className="text-[12px] text-textBlue mt-[2px] truncate">
                {(buman.group || cat.label)} · {buman.name} ({buman.prefix}) · {buman.test}
              </div>
            </div>
            
            <div className="flex-grow"></div>
            
            {/* 평가자명 입력 박스 */}
            <div className="flex items-center gap-[10px] bg-[#243a63] border border-[#3a4f78] rounded-[10px] py-[7px] px-[14px] shrink-0">
              <span className="text-[13px] text-textBlue font-semibold whitespace-nowrap">평가자</span>
              <input
                type="text"
                value={judgeName}
                onChange={(e) => {
                  setJudgeName(e.target.value);
                  saveSession(groupName, { judgeName: e.target.value });
                }}
                placeholder="성명 입력"
                className="w-[130px] h-[34px] border-none rounded-[7px] px-[12px] text-[15px] font-bold text-primary bg-white focus:outline-none"
              />
            </div>
            
            {/* 입력 진행 지표 */}
            <div className="text-right px-[4px] shrink-0">
              <div className="text-[12px] text-textBlue">입력 진행</div>
              <div className="text-[15px] font-extrabold text-[#f0d590] leading-none">
                {filledCount} / {totalCount}
              </div>
            </div>

            <button
              onClick={handleSaveExcel}
              className="bg-white border border-white text-accent-red-hover text-[#c0392b] rounded-[10px] h-[42px] px-[18px] text-[14px] font-extrabold hover:bg-gray-100 transition-all shrink-0"
            >
              엑셀저장
            </button>
            
            <button
              onClick={handleComplete}
              className={`rounded-[10px] h-[42px] px-[18px] text-[14px] font-extrabold transition-all shrink-0 ${
                totalCount > 0 && filledCount === totalCount
                  ? 'bg-[#e03b3b] border border-[#e03b3b] text-white cursor-pointer hover:bg-accent-red-hover'
                  : 'bg-[#243a63] border border-[#3a4f78] text-[#5e77a6] cursor-default'
              }`}
            >
              배점완료
            </button>
          </div>

          {/* 부문 전환 탭바 */}
          <div className="bg-white border-b border-[#dde3ec] py-[10px] px-[22px] flex gap-[8px] items-center shrink-0 overflow-x-auto">
            <span className="text-[12px] font-bold text-[#8b97ab] mr-[4px] whitespace-nowrap leading-none">
              부문 전환
            </span>
            {bumans.map((b) => {
              const active = b.key === selectedBuman;
              // 해당 부문의 완료 여부 체크 (관리자 등록 템플릿 항목 기준)
              const bList = getProductList(b.key);
              const bItems = buildActiveItems(b.key);
              const bScores = scores[b.key] || {};
              const done = bList.length > 0 && bList.every(p => {
                const s = bScores[p.code] || {};
                return bItems.every(it => s[it.key] !== undefined);
              });

              return (
                <button
                  key={b.key}
                  onClick={() => setSelectedBuman(b.key)}
                  className={`flex items-center gap-[7px] py-[8px] px-[14px] rounded-[10px] cursor-pointer whitespace-nowrap transition-all border ${
                    active
                      ? 'border-primary bg-primary text-white font-extrabold'
                      : done
                      ? 'border-[#3ea06a] bg-[#eef7f1] text-[#2f7a4f] font-semibold'
                      : 'border-[#dde3ec] bg-white text-[#5a6a82] hover:border-gray-300 font-semibold'
                  }`}
                >
                  <span className="text-[15px] font-extrabold">{b.prefix}</span>
                  <span className="text-[12px] font-semibold opacity-90">{b.name}</span>
                  {done && <span className={`text-[12px] font-bold ${active ? 'text-[#8fe0ac]' : 'text-[#3ea06a]'}`}>✓</span>}
                </button>
              );
            })}
          </div>

          {/* 테이블 컨테이너 */}
          <div className="flex-1 overflow-auto py-[18px] px-[22px] pb-[40px]">
            {products.length === 0 ? (
              <div className="w-full border border-[#cbd3e1] rounded-[10px] bg-white py-[60px] px-[24px] text-center">
                <div className="text-[16px] font-bold text-[#5a6a82]">등록된 평가 제품이 없습니다.</div>
                <div className="mt-[8px] text-[13px] text-[#8b97ab]">관리자에서 이 부문에 제품을 등록하면 평가표가 표시됩니다.</div>
              </div>
            ) : (
            <div className="overflow-x-auto w-full border border-[#cbd3e1] rounded-[10px] bg-white">
              <table className="border-collapse border-spacing-0 text-[13px] min-w-[900px] w-full bg-white overflow-hidden">
                <thead>
                  {/* 1단 헤더: 대분류명 및 환산/합계 정보 */}
                  <tr className="bg-[#1b2a4a] text-white">
                    <th rowSpan={3} className="sticky top-0 left-0 z-20 bg-[#1b2a4a] text-white border-b-2 border-r border-[#243a63] p-[8px] w-[96px] font-extrabold text-center">
                      제품<br />분류코드
                    </th>
                    {buman.test !== '블라인드' && (
                      <th rowSpan={3} className="sticky top-0 z-10 bg-[#1b2a4a] text-white border-b-2 border-r border-[#243a63] p-[8px] w-[150px] font-extrabold text-left">
                        제품명
                      </th>
                    )}
                    
                    {/* 동적 그룹명 맵 */}
                    {hasServerTemplate ? (
                      serverBumanTemplate.map(g => {
                        const gItems = g.items || [];
                        const colSpanVal = gItems.length;
                        const hasConvert = parseInt(g.convertTo) > 0;
                        return (
                          <React.Fragment key={g.name}>
                            {colSpanVal > 0 && (
                              <th colSpan={colSpanVal} className="bg-[#243a63] text-white p-2 font-extrabold text-center border-b border-[#314a7c] border-r border-[#314a7c]">
                                {g.name} {hasConvert && `(${gItems.reduce((sum, it) => sum + (parseInt(it.max) || 0), 0)}점 → ${g.convertTo}점 환산)`}
                              </th>
                            )}
                            {hasConvert && (
                              <th rowSpan={3} className="bg-[#1f4a38] text-white p-2.5 font-extrabold text-center border-r border-[#285d47] min-w-[70px] border-b-2 border-[#285d47]">
                                환산<br />(→{g.convertTo})
                              </th>
                            )}
                          </React.Fragment>
                        );
                      })
                    ) : (
                      // 로컬 fallback
                      <>
                        <th colSpan={cat.gwan.length} className="bg-[#243a63] text-white p-2 font-extrabold text-center border-b border-[#314a7c] border-r border-[#314a7c]">
                          관능 평가 {cat.convert && "(100점 → 70점 환산)"}
                        </th>
                        {cat.convert && (
                          <th rowSpan={3} className="bg-[#1f4a38] text-white p-2.5 font-extrabold text-center border-r border-[#285d47] min-w-[70px] border-b-2 border-[#285d47]">
                            환산<br />(→70)
                          </th>
                        )}
                        {cat.sang.length > 0 && (
                          <th colSpan={cat.sang.length} className="bg-[#243a63] text-white p-2 font-extrabold text-center border-b border-[#314a7c] border-r border-[#314a7c]">
                            상품성 평가
                          </th>
                        )}
                      </>
                    )}
                    
                    <th rowSpan={3} className="sticky top-0 z-10 bg-[#1b2a4a] text-white border-b-2 border-[#243a63] p-[8px] w-[88px] font-extrabold text-center">
                      소계<br />({subtotalMax})
                    </th>
                  </tr>

                  {/* 2단 헤더: 세부 평가항목명 */}
                  <tr className="bg-[#243a63] text-white text-[12px] border-b border-[#243a63]">
                    {hasServerTemplate ? (
                      serverBumanTemplate.map(g => (
                        (g.items || []).map(it => (
                          <th key={it.id} className="p-2 font-bold text-center border-r border-[#344f82] min-w-[80px] bg-[#2a4372]">
                            {it.name}
                          </th>
                        ))
                      ))
                    ) : (
                      <>
                        {cat.gwan.map(it => (
                          <th key={it.key} className="p-2 font-bold text-center border-r border-[#344f82] min-w-[80px] bg-[#2a4372]">
                            {it.name}
                          </th>
                        ))}
                        {cat.sang.map(it => (
                          <th key={it.key} className="p-2 font-bold text-center border-r border-[#344f82] min-w-[80px] bg-[#2a4372]">
                            {it.name}
                          </th>
                        ))}
                      </>
                    )}
                  </tr>

                  {/* 3단 헤더: 배점 및 척도 단계 가이드 */}
                  <tr className="bg-[#f0f4fa] text-[#4a5568] text-[11px] border-b border-[#cbd3e1]">
                    {hasServerTemplate ? (
                      serverBumanTemplate.map(g => (
                        (g.items || []).map(it => (
                          <th key={it.id} className="p-1.5 text-center border-r border-[#cbd3e1] font-semibold">
                            <div className="text-[14px] font-extrabold text-[#b58a2e]">{it.max}</div>
                            <div className="text-[10px] text-[#8b97ab] font-bold">{(it.scale || []).join('·')}</div>
                          </th>
                        ))
                      ))
                    ) : (
                      <>
                        {cat.gwan.map(it => (
                          <th key={it.key} className="p-1.5 text-center border-r border-[#cbd3e1] font-semibold">
                            <div className="text-[14px] font-extrabold text-[#b58a2e]">{it.max}</div>
                            <div className="text-[10px] text-[#8b97ab] font-bold">{it.scale.join('·')}</div>
                          </th>
                        ))}
                        {cat.sang.map(it => (
                          <th key={it.key} className="p-1.5 text-center border-r border-[#cbd3e1] font-semibold">
                            <div className="text-[14px] font-extrabold text-[#b58a2e]">{it.max}</div>
                            <div className="text-[10px] text-[#8b97ab] font-bold">{it.scale.join('·')}</div>
                          </th>
                        ))}
                      </>
                    )}
                  </tr>
                </thead>
                
                {/* 데이터 렌더러 Body */}
                <tbody>
                  {products.map((p, idx) => {
                    const pScores = bScores[p.code] || {};
                    const isComplete = activeItems.every(it => pScores[it.key] !== undefined);
                    
                    // 총합 및 소계 계산
                    let subtotal = 0;
                    const renderedGroupValues = []; // { groupId/name, gwanSum, cv }

                    if (hasServerTemplate) {
                      let totalConverted = 0;
                      serverBumanTemplate.forEach(g => {
                        let gSum = (g.items || []).reduce((sum, it) => sum + (pScores[String(it.id)] || 0), 0);
                        const gMax = (g.items || []).reduce((sum, it) => sum + (parseInt(it.max) || 0), 0);
                        const gConv = parseInt(g.convertTo) || 0;
                        let gFinal = gSum;
                        if (gConv > 0 && gMax > 0) {
                          gFinal = Math.round((gSum / gMax) * gConv * 10) / 10;
                        }
                        totalConverted += gFinal;
                        renderedGroupValues.push({
                          name: g.name,
                          rawSum: gSum,
                          converted: gFinal,
                          hasConvert: gConv > 0
                        });
                      });
                      subtotal = Math.round(totalConverted * 10) / 10;
                    } else {
                      const cat = ITEMS[buman.cat];
                      const gwanSum = cat.gwan.reduce((sum, it) => sum + (pScores[it.key] || 0), 0);
                      const sangSum = cat.sang.reduce((sum, it) => sum + (pScores[it.key] || 0), 0);
                      const cv = cat.convert ? Math.round(gwanSum * 0.7 * 10) / 10 : gwanSum;
                      subtotal = cat.convert ? Math.round((cv + sangSum) * 10) / 10 : gwanSum;
                      
                      renderedGroupValues.push({
                        name: 'gwan',
                        rawSum: gwanSum,
                        converted: cv,
                        hasConvert: cat.convert
                      });
                    }

                    return (
                      <tr
                        key={p.code}
                        className="transition-all hover:bg-gray-50 border-b border-[#dde3ec] last:border-b-0"
                        style={{
                          backgroundColor: isComplete ? '#f2f7ea' : idx % 2 === 1 ? '#fbfcf8' : '#ffffff'
                        }}
                      >
                        {/* 제품분류코드 */}
                        <td className="sticky left-0 bg-inherit border-r border-[#cbd3e1] py-[8px] px-[8px] text-center z-10 whitespace-nowrap">
                          <div className={`font-extrabold text-[15px] leading-none ${buman.cat === 'woolisul' ? 'text-[#284c7d]' : 'text-[#3f5a26]'}`}>
                            {p.code}
                          </div>
                          {isComplete && (
                            <span className="inline-block mt-[4px] text-[10px] font-extrabold text-white bg-[#3ea06a] rounded-[5px] px-[6px] py-[1px] leading-none">
                              완료 ✓
                            </span>
                          )}
                          {buman.test === '블라인드' && (
                            <div className="mt-[2px] text-[10px] text-[#9aa6bb]">블라인드</div>
                          )}
                        </td>
                        
                        {/* 제품명 */}
                        {buman.test !== '블라인드' && (
                          <td className="border-r border-[#cbd3e1] py-[8px] px-[10px] font-semibold text-textSub whitespace-nowrap min-w-[140px]">
                            {p.name}
                          </td>
                        )}
                        
                        {/* 각 대그룹 루프 */}
                        {hasServerTemplate ? (
                          serverBumanTemplate.map(g => {
                            const gItems = g.items || [];
                            const gVal = renderedGroupValues.find(v => v.name === g.name);
                            return (
                              <React.Fragment key={g.name}>
                                {gItems.map(it => {
                                  const val = pScores[String(it.id)];
                                  return (
                                    <td key={it.id} className="border-r border-[#cbd3e1] p-[6px] text-center">
                                      <button
                                        onClick={() => setModal({ code: p.code, itemKey: String(it.id) })}
                                        className={`w-full h-[32px] rounded-[6px] border transition-all cursor-pointer ${
                                          val !== undefined
                                            ? 'border-[#b58a2e] bg-[#f3e2b8] text-[#8a640f] font-extrabold text-[15px]'
                                            : 'border-[#d3dae5] bg-white text-[#9aa6bb] text-[12px] font-bold tracking-[1px]'
                                        }`}
                                      >
                                        {val !== undefined ? val : '입력'}
                                      </button>
                                    </td>
                                  );
                                })}
                                {gVal && gVal.hasConvert && (
                                  <td className="border-r border-[#cbd3e1] p-[6px] text-center bg-[#f6f9ef] font-extrabold text-[#5a7a3f] text-[14px]">
                                    {gVal.converted}
                                  </td>
                                )}
                              </React.Fragment>
                            );
                          })
                        ) : (
                          // 로컬 fallback
                          <>
                            {cat.gwan.map(it => {
                              const val = pScores[it.key];
                              return (
                                <td key={it.key} className="border-r border-[#cbd3e1] p-[6px] text-center">
                                  <button
                                    onClick={() => setModal({ code: p.code, itemKey: it.key })}
                                    className={`w-full h-[32px] rounded-[6px] border transition-all cursor-pointer ${
                                      val !== undefined
                                        ? 'border-[#b58a2e] bg-[#f3e2b8] text-[#8a640f] font-extrabold text-[15px]'
                                        : 'border-[#d3dae5] bg-white text-[#9aa6bb] text-[12px] font-bold tracking-[1px]'
                                    }`}
                                  >
                                    {val !== undefined ? val : '입력'}
                                  </button>
                                </td>
                              );
                            })}
                            {cat.convert && (
                              <td className="border-r border-[#cbd3e1] p-[6px] text-center bg-[#f6f9ef] font-extrabold text-[#5a7a3f] text-[14px]">
                                {renderedGroupValues[0]?.converted}
                              </td>
                            )}
                            {cat.sang.map(it => {
                              const val = pScores[it.key];
                              return (
                                <td key={it.key} className="border-r border-[#cbd3e1] p-[6px] text-center">
                                  <button
                                    onClick={() => setModal({ code: p.code, itemKey: it.key })}
                                    className={`w-full h-[32px] rounded-[6px] border transition-all cursor-pointer ${
                                      val !== undefined
                                        ? 'border-[#b58a2e] bg-[#f3e2b8] text-[#8a640f] font-extrabold text-[15px]'
                                        : 'border-[#d3dae5] bg-white text-[#9aa6bb] text-[12px] font-bold tracking-[1px]'
                                    }`}
                                  >
                                    {val !== undefined ? val : '입력'}
                                  </button>
                                </td>
                              );
                            })}
                          </>
                        )}
                        
                        {/* 소계 합산 칼럼 */}
                        <td className="p-[6px] text-center bg-[#fbf6e8] whitespace-nowrap">
                          <span className="text-[19px] font-extrabold text-[#b58a2e]">
                            {subtotal}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}
            
            {/* 테이블 안내 주석 */}
            <div className="mt-[12px] text-[12px] text-[#8b97ab] leading-[1.7]">
              {buman.test === '블라인드'
                ? '※ 블라인드 테스트 — 제품명 미노출, 제품분류코드만 표시. 설정된 배점 합계를 그대로 소계로 산출합니다.'
                : '※ 오픈테스트 — 제품명·코드 표시. 설정된 배점에 맞추어 각 그룹 평가 및 환산 점수 소계가 산출됩니다.'}
            </div>
          </div>
        </div>
      )}

      {/* 3) 결과 요약 화면 (screen === 'done') */}
      {screen === 'done' && (
        <div className="flex-1 flex items-center justify-center p-[40px] overflow-auto">
          <div className="w-full max-w-[760px] bg-white rounded-[20px] shadow-[0_20px_60px_rgba(27,42,74,0.16)] overflow-hidden animate-[popIn_0.35s_ease]">
            <div className="bg-gradient-to-r from-[#1b2a4a] to-[#243a63] text-white p-[40px] px-[44px] flex items-center gap-[22px]">
              <div className="w-[70px] h-[70px] rounded-full bg-[#3ea06a] flex items-center justify-center text-[34px] font-extrabold shrink-0">
                ✓
              </div>
              <div>
                <div className="text-[13px] tracking-[2px] text-[#d9b866] font-bold uppercase leading-none">
                  배점완료
                </div>
                <h3 className="mt-[6px] text-[26px] font-extrabold leading-none">
                  평가가 저장되었습니다
                </h3>
                <p className="mt-[6px] text-[14px] text-bannerText leading-normal">
                  입력된 평가자명·제품별 점수가 로컬 저장소에 안전하게 전송되었습니다.
                </p>
              </div>
            </div>

            <div className="p-[32px] px-[44px]">
              <div className="flex gap-[12px] flex-wrap">
                <div className="flex-1 min-w-[150px] bg-[#f4f6fa] rounded-[12px] p-[16px] px-[18px]">
                  <div className="text-[12px] text-[#8b97ab] font-semibold">평가자</div>
                  <div className="mt-[4px] text-[18px] font-extrabold text-primary leading-none">{judgeName}</div>
                </div>
                <div className="flex-1 min-w-[150px] bg-[#f4f6fa] rounded-[12px] p-[16px] px-[18px]">
                  <div className="text-[12px] text-[#8b97ab] font-semibold">부문</div>
                  <div className="mt-[4px] text-[18px] font-extrabold text-primary leading-none">{buman.name} ({buman.prefix})</div>
                </div>
                <div className="flex-1 min-w-[150px] bg-[#f4f6fa] rounded-[12px] p-[16px] px-[18px]">
                  <div className="text-[12px] text-[#8b97ab] font-semibold">평가 제품</div>
                  <div className="mt-[4px] text-[18px] font-extrabold text-primary leading-none">{products.length}개</div>
                </div>
              </div>

              <div className="mt-[24px] text-[14px] font-extrabold text-textSub">
                제품별 소계 ({subtotalMax}점 만점)
              </div>
              <div className="mt-[10px] border border-[#e5e9f0] rounded-[12px] overflow-hidden bg-white">
                {products.map((p, idx) => {
                  const pScores = bScores[p.code] || {};
                  const subtotal = calcSubtotal(pScores, selectedBuman);

                  return (
                    <div
                      key={p.code}
                      className="flex items-center gap-[14px] p-[12px] px-[18px] border-b last:border-b-0 border-[#eef1f6] transition-all"
                      style={{ backgroundColor: idx % 2 === 1 ? '#fafbfd' : '#ffffff' }}
                    >
                      <div className="font-extrabold text-primary w-[64px]">{p.code}</div>
                      <div className="flex-1 text-[#6b7890] font-semibold truncate">
                        {buman.cat === 'woolisul' ? '우리술 블라인드 평가제품' : p.name}
                      </div>
                      <div className="text-[18px] font-extrabold text-[#b58a2e] leading-none">
                        {subtotal} <span className="text-[12px] text-[#b0b9c9] font-semibold">점</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-[28px] display-flex flex gap-[12px]">
                <button
                  onClick={() => window.history.back()}
                  className="flex-1 h-[54px] rounded-[12px] border border-[#cbd3e1] bg-white text-textSub text-[16px] font-bold cursor-pointer hover:bg-gray-50 transition-all"
                >
                  ← 수정하기
                </button>
                <button
                  onClick={() => navTo('start')}
                  className="flex-1 h-[54px] rounded-[12px] bg-primary text-white text-[16px] font-extrabold cursor-pointer hover:bg-secondary transition-all"
                >
                  다른 부문 평가 →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4) 공통 점수 입력 모달 오버레이 */}
      {modal && (
        (() => {
          const mItem = activeItems.find(it => it.key === modal.itemKey);
          const currentVal = scores[selectedBuman]?.[modal.code]?.[modal.itemKey];
          
          return (
            <div
              onClick={() => setModal(null)}
              className="position-fixed fixed inset-0 bg-[rgba(20,28,46,0.55)] flex items-center justify-center z-[60] p-[24px]"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-[700px] bg-white rounded-[20px] overflow-hidden shadow-[0_24px_70px_rgba(0,0,0,0.35)] animate-[popIn_0.18s_ease]"
              >
                {/* 모달 헤더 */}
                <div className="bg-gradient-to-r from-[#1b2a4a] to-[#243a63] text-white p-[22px] px-[28px] flex items-center justify-between gap-[16px]">
                  <div>
                    <div className="text-[21px] font-extrabold leading-none">{mItem?.name} ({modal.code})</div>
                    <div className="mt-[5px] text-[13px] text-textBlue leading-none">
                      배점 {mItem?.max}점 · 척도 {mItem?.scale?.length || 0}단계
                    </div>
                  </div>
                  <div className="text-right shrink-0 leading-none">
                    <div className="text-[12px] text-textBlue">현재 선택</div>
                    <div className="text-[22px] font-extrabold text-[#f0d590] mt-[4px]">
                      {currentVal !== undefined ? currentVal : '없음'}
                    </div>
                  </div>
                </div>

                {/* 모달 컨텐츠 */}
                <div className="p-[26px] px-[28px] pb-[24px]">
                  <div className="text-[13px] font-bold text-[#8b97ab] mb-[14px] leading-none">
                    점수를 선택하세요 · 셀을 다시 눌러 언제든 수정할 수 있습니다
                  </div>
                  
                  {/* 척도 버튼 목록 */}
                  <div className="flex gap-[12px] flex-wrap justify-center">
                    {(mItem?.scale || []).map((scoreValue) => {
                      const isSelected = currentVal === scoreValue;
                      return (
                        <button
                          key={scoreValue}
                          onClick={() => pickScore(modal.code, modal.itemKey, scoreValue)}
                          className={`min-w-[75px] flex-1 h-[80px] rounded-[14px] border-2 transition-all text-[26px] font-extrabold cursor-pointer ${
                            isSelected
                              ? 'border-primary bg-primary text-white shadow-md'
                              : 'border-[#d3dae5] bg-white text-textSub hover:border-gray-400'
                          }`}
                        >
                          {scoreValue}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-[22px] flex gap-[10px]">
                    {currentVal !== undefined && (
                      <button
                        onClick={() => clearScore(modal.code, modal.itemKey)}
                        className="w-[120px] h-[52px] rounded-[12px] border-2 border-red-200 bg-red-50 text-red-600 text-[15px] font-bold cursor-pointer hover:bg-red-100 transition-all"
                      >
                        지우기
                      </button>
                    )}
                    <button
                      onClick={() => setModal(null)}
                      className="flex-1 h-[52px] rounded-[12px] border-[1.5px] border-[#cbd3e1] bg-[#f4f6fa] text-textSub text-[15px] font-bold cursor-pointer hover:bg-gray-100 transition-all"
                    >
                      닫기
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()
      )}

      {/* 5) 공통 하단 토스트 메시지 안내 */}
      {toast && (
        <div className="fixed left-[50%] bottom-[36px] -translate-x-[50%] bg-[#1b2a4a] text-white py-[14px] px-[26px] rounded-[12px] text-[15px] font-semibold shadow-[0_10px_30px_rgba(0,0,0,0.25)] animate-[toastIn_0.3s_ease] z-[50] flex items-center gap-[10px]">
          <span className="w-[22px] h-[22px] rounded-full bg-[#3ea06a] inline-flex items-center justify-center text-[13px] font-extrabold text-white">✓</span>
          {toast}
        </div>
      )}

    </div>
  );
}

export default App;
