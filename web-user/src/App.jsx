// K-라이스페스타 전문가 품평회 평가자용 종합 앱 (로그인, 채점 시트, 팝업 모달, 결과 리포트 통합)
import React, { useState, useEffect } from 'react';

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

const NAMES = {
  A: ['미라클누룽지', '황금누룽지', '우리쌀김밥', '매콤쌀떡볶이', '현미누룽지칩', '수제쌀강정', '가마솥누룽지', '쌀치즈피자'],
  B: ['유기농쌀가루', '발아현미믹스', '즉석쌀죽', '쌀식빵프리믹스', '글루텐프리쌀빵', '쌀시리얼', '건강쌀국수', '쌀누들'],
  C: ['농협햇쌀', '친환경백미', '고시히카리', '신동진쌀', '오분도미', '찰현미', '흑미세트', '영양잡곡'],
};

const COUNT = 8;

function App() {
  // 쿼리 파라미터 또는 경로 파라미터에서 groupName 추출 (예: /krice2026)
  const params = new URLSearchParams(window.location.search);
  const queryGroup = params.get('groupName');
  const pathGroup = window.location.pathname.replace(/^\/+/, '');
  const groupName = queryGroup || pathGroup || 'krice2026';

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

  // 컴포넌트 마운트 시 로컬스토리지 복구
  useEffect(() => {
    try {
      const raw = localStorage.getItem('kricefesta_eval_v2');
      if (raw) {
        const d = JSON.parse(raw);
        if (d.judgeName) setJudgeName(d.judgeName);
        if (d.judgeId) setJudgeId(d.judgeId);
        if (d.scores) setScores(d.scores);
        if (d.completed) setCompleted(d.completed);
      }
    } catch (e) {
      console.error('LocalStorage 복구 에러:', e);
    }
  }, []);

  // 대회 초기화 동적 메타데이터 로드
  useEffect(() => {
    const loadInitData = async () => {
      try {
        const res = await fetch(`http://localhost:18000/api/user/groups/${groupName}/init`);
        if (res.ok) {
          const data = await res.json();
          if (data.systemName) setSystemName(data.systemName);
          if (data.period) setPeriod(data.period);
          if (data.bumans && data.bumans.length > 0) {
            const mappedBumans = data.bumans.map(b => {
              const isWoolisul = b.group === '우리술' || b.name.includes('주') || b.name.includes('술');
              return {
                key: b.prefix,
                cat: isWoolisul ? 'woolisul' : 'ricefood',
                name: b.name,
                prefix: b.prefix,
                test: b.type === 'open' ? '오픈테스트' : '블라인드'
              };
            });
            setBumans(mappedBumans);
            setSelectedBuman(mappedBumans[0].prefix);
          }
          if (data.products) setProductsMap(data.products);
          if (data.templates) setTemplatesMap(data.templates);
        }
      } catch (e) {
        console.error("대회 초기 데이터 로딩 에러:", e);
      }
    };
    loadInitData();
  }, [groupName]);

  // 영속화 헬퍼
  const persist = (nextState) => {
    try {
      const current = {
        judgeName: nextState.judgeName ?? judgeName,
        judgeId: nextState.judgeId ?? judgeId,
        scores: nextState.scores ?? scores,
        completed: nextState.completed ?? completed,
      };
      localStorage.setItem('kricefesta_eval_v2', JSON.stringify(current));
    } catch (e) {
      console.error('LocalStorage 저장 에러:', e);
    }
  };

  // Toast 노출 제어
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => {
      setToast('');
    }, 2000);
  };

  // 현재 활성 부문 객체 조회
  const buman = bumans.find((b) => b.key === selectedBuman) || bumans[0] || BUMANS[0];
  const serverBumanTemplate = templatesMap[selectedBuman];
  const hasServerTemplate = serverBumanTemplate && serverBumanTemplate.length > 0;

  // 세부 항목 평면 배열 구성
  let activeItems = [];
  if (hasServerTemplate) {
    serverBumanTemplate.forEach(g => {
      (g.items || []).forEach(it => {
        activeItems.push({
          id: it.id,
          key: String(it.id),
          name: it.name,
          max: it.max,
          scale: it.scale,
          groupName: g.name
        });
      });
    });
  } else {
    const cat = ITEMS[buman.cat];
    activeItems = [
      ...cat.gwan.map(x => ({ ...x, id: x.key, key: x.key, groupName: '관능평가' })),
      ...cat.sang.map(x => ({ ...x, id: x.key, key: x.key, groupName: '상품성평가' }))
    ];
  }

  // 제품 목록 가져오기
  const getProductList = (bumanKey) => {
    if (productsMap[bumanKey]) {
      return productsMap[bumanKey];
    }
    const b = bumans.find((x) => x.key === bumanKey) || BUMANS[0];
    return Array.from({ length: COUNT }, (_, i) => {
      const num = i + 1;
      const code = `${b.prefix}-${num}`;
      const name = b.cat === 'woolisul' ? '블라인드 (코드만 노출)' : (NAMES[b.key]?.[i] || `${b.name} 제품 ${num}`);
      return { code, name };
    });
  };

  // 로그인 (시작) 확인
  const handleStart = async (e) => {
    e.preventDefault();
    if (!judgeName.trim()) {
      alert('평가자 성명을 기입해 주세요.');
      return;
    }
    
    try {
      const res = await fetch(`http://localhost:18000/api/user/groups/${groupName}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ judgeName: judgeName.trim() })
      });
      if (res.ok) {
        const data = await res.json();
        setJudgeId(data.judgeId);
        if (data.scores) {
          setScores(data.scores);
          persist({ judgeName, scores: data.scores, judgeId: data.judgeId });
        } else {
          persist({ judgeName, judgeId: data.judgeId });
        }
        setScreen('eval');
      } else {
        alert("로그인 처리에 실패하였습니다.");
      }
    } catch (err) {
      console.error("로그인 API 에러:", err);
      // 오프라인 폴백 진입
      persist({ judgeName });
      setScreen('eval');
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
    persist({ scores: nextScores });
    setModal(null);

    // 서버 실시간 동기화
    if (judgeId) {
      try {
        await fetch(`http://localhost:18000/api/user/groups/${groupName}/score`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            judgeId,
            productCode: code,
            itemId: isNaN(itemKey) ? 0 : parseInt(itemKey),
            score: val
          })
        });
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
    persist({ scores: nextScores });
    setModal(null);

    // 서버 실시간 동기화 (삭제)
    if (judgeId) {
      try {
        await fetch(`http://localhost:18000/api/user/groups/${groupName}/score`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
    const allFilled = plist.every(p => {
      const s = bScores[p.code] || {};
      return activeItems.every(it => s[it.key] !== undefined);
    });

    if (!allFilled) {
      alert('아직 미입력된 배점 항목이 존재합니다. 모든 평가 셀을 기입해 주세요.');
      return;
    }

    if (judgeId) {
      try {
        await fetch(`http://localhost:18000/api/user/groups/${groupName}/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ judgeId, bumanPrefix: selectedBuman })
        });
      } catch (e) {
        console.error("완료 제출 에러:", e);
      }
    }

    const nextCompleted = { ...completed, [selectedBuman]: true };
    setCompleted(nextCompleted);
    persist({ completed: nextCompleted });
    setScreen('done');
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
                2026 우리쌀·우리술<br />K-라이스페스타 품평회
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

                  {/* 쌀가공식품 */}
                  <div className="text-[12px] font-extrabold text-brandGreen mt-[14px] tracking-[1px] leading-none">
                    쌀가공식품 · 오픈테스트
                  </div>
                  <div className="grid grid-cols-3 gap-[10px] mt-[8px]">
                    {BUMANS.filter(x => x.cat === 'ricefood').map((item) => (
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
                        <div className="text-[14px] font-semibold mt-[4px] leading-none">{item.name}</div>
                      </button>
                    ))}
                  </div>

                  {/* 우리술 */}
                  <div className="text-[12px] font-extrabold text-brandBlue mt-[18px] tracking-[1px] leading-none">
                    우리술 · 블라인드
                  </div>
                  <div className="grid grid-cols-4 gap-[10px] mt-[8px]">
                    {BUMANS.filter(x => x.cat === 'woolisul').map((item) => (
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
              onClick={() => setScreen('start')}
              className="bg-transparent border border-[#45577f] text-[#c6d2ea] rounded-[9px] h-[40px] px-[14px] font-semibold cursor-pointer text-[14px] hover:bg-[#243a63] transition-all"
            >
              ← 부문
            </button>
            <div className="min-w-0">
              <div className="text-[16px] font-extrabold truncate">
                2026 우리쌀·우리술 K-라이스페스타 품평회
              </div>
              <div className="text-[12px] text-textBlue mt-[2px] truncate">
                {cat.label} · {buman.name} ({buman.prefix}) · {buman.test}
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
                  persist({ judgeName: e.target.value });
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
                filledCount === totalCount
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
            {BUMANS.map((b) => {
              const active = b.key === selectedBuman;
              // 해당 부문의 완료 여부 체크
              const bList = getProductList(b.key);
              const bCat = ITEMS[b.cat];
              const bItems = [...bCat.gwan, ...bCat.sang];
              const bScores = scores[b.key] || {};
              const done = bList.every(p => {
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
                      소계<br />(120)
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
                  <div className="mt-[4px] text-[18px] font-extrabold text-primary leading-none">{COUNT}개</div>
                </div>
              </div>

              <div className="mt-[24px] text-[14px] font-extrabold text-textSub">
                제품별 소계 (120점 만점)
              </div>
              <div className="mt-[10px] border border-[#e5e9f0] rounded-[12px] overflow-hidden bg-white">
                {products.map((p, idx) => {
                  const pScores = bScores[p.code] || {};
                  const gwanSum = cat.gwan.reduce((sum, it) => sum + (pScores[it.key] || 0), 0);
                  const sangSum = cat.sang.reduce((sum, it) => sum + (pScores[it.key] || 0), 0);
                  const cv = Math.round(gwanSum * 0.7 * 10) / 10;
                  const subtotal = cat.convert ? Math.round((cv + sangSum) * 10) / 10 : gwanSum;

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
                  onClick={() => setScreen('eval')}
                  className="flex-1 h-[54px] rounded-[12px] border border-[#cbd3e1] bg-white text-textSub text-[16px] font-bold cursor-pointer hover:bg-gray-50 transition-all"
                >
                  ← 수정하기
                </button>
                <button
                  onClick={() => {
                    setScreen('start');
                  }}
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
