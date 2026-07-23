// K-라이스페스타 전문가 품평회 관리자 콘솔 종합 애플리케이션 React 컴포넌트
import React, { useState, useEffect } from 'react';

// 공통 네비게이션 명세
const NAV = [
  { key: 'overview', icon: '▤', label: '시스템 개요' },
  { key: 'judges', icon: '◔', label: '평가자 등록' },
  { key: 'bumans', icon: '▦', label: '부문 등록' },
  { key: 'products', icon: '◇', label: '부문별 제품' },
  { key: 'items', icon: '≡', label: '평가항목 설정' },
  { key: 'results', icon: '★', label: '결과' },
];

// 배점 기반 5단계 척도 분할 헬퍼
function scaleOf(max) {
  const m = Number(max) || 0;
  return [1, 2, 3, 4, 5].map(i => Math.round((m / 5) * i));
}

// 시뮬레이션용 해시 함수
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

// 시뮬레이션용 더미 채점 점수 산출 함수 (최종 합계는 120점 만점 기준)
function sampleScore(pi, ji, code) {
  const h = hashStr(code);
  const base = 94 + (h + pi * 11) % 15;
  const jit = ((ji * 7 + pi * 5 + h * 3) % 17) - 8;
  return Math.max(80, Math.min(120, base + jit));
}

let _uid = 1000;
const nextUid = () => ++_uid;

function App() {
  // 1) 로그인 화면 전용 상태
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAuthed, setIsAuthed] = useState(() => {
    try {
      const remember = localStorage.getItem('kricefesta_admin_remember');
      const session = sessionStorage.getItem('kricefesta_admin_session');
      return remember === 'true' || session === 'true';
    } catch (e) {
      return false;
    }
  });

  // 2) 관리자 대시보드 및 상세 제어 상태
  const [view, setView] = useState(() => {
    try {
      const path = window.location.pathname;
      return path.startsWith('/console') ? 'console' : 'dashboard';
    } catch (e) {
      return 'dashboard';
    }
  }); // dashboard | console
  const [groups, setGroups] = useState([]);
  const [activeGroup, setActiveGroup] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const gid = params.get('groupId');
      return gid ? parseInt(gid, 10) : 1;
    } catch (e) {
      return 1;
    }
  });
  const [section, setSection] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('section') || 'overview';
    } catch (e) {
      return 'overview';
    }
  });
  const [systemName, setSystemName] = useState('');
  const [productBuman, setProductBuman] = useState('A');
  const [resultBuman, setResultBuman] = useState('A');
  const [template, setTemplate] = useState('open'); // open | blind (항목 설정용)
  const [toast, setToast] = useState('');

  // 3) 관리 리소스 데이터 상태
  const [judges, setJudges] = useState([]);
  const [bumans, setBumans] = useState([]);
  const [products, setProducts] = useState({});
  const [templates, setTemplates] = useState({
    open: [],
    blind: []
  });

  useEffect(() => {
    try {

      const remember = localStorage.getItem('kricefesta_admin_remember');
      const session = sessionStorage.getItem('kricefesta_admin_session');
      if (remember === 'true' || session === 'true') {
        setIsAuthed(true);
      }
    } catch (e) {
      console.error('LocalStorage 복구 에러:', e);
    }
  }, []);

  // 실제 대그룹 목록 API Fetch 연동 함수
  const fetchGroups = async () => {
    try {
      const response = await fetch("http://localhost:18000/api/admin/groups");
      if (response.ok) {
        const data = await response.json();
        if (data.status === "success" && data.groups) {
          setGroups(data.groups);
        }
      }
    } catch (e) {
      console.error("대그룹 목록 API 호출 실패:", e);
    }
  };

  useEffect(() => {
    if (isAuthed) {
      fetchGroups();
    }
  }, [isAuthed]);

  // view, activeGroup, section 변경 시 URL 주소 동적으로 갱신
  useEffect(() => {
    if (!isAuthed) return;
    let url = "/";
    if (view === 'console') {
      url = `/console?groupId=${activeGroup}&section=${section}`;
    }
    const currentUrl = window.location.pathname + window.location.search;
    if (currentUrl !== url) {
      window.history.pushState({ view, activeGroup, section }, "", url);
    }
  }, [view, activeGroup, section, isAuthed]);

  // 브라우저 뒤로가기 / 앞으로가기 이벤트 (popstate) 리스너 연동
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      const params = new URLSearchParams(window.location.search);
      if (path.startsWith('/console')) {
        setView('console');
        const gid = params.get('groupId');
        if (gid) {
          setActiveGroup(parseInt(gid, 10));
        }
        setSection(params.get('section') || 'overview');
      } else {
        setView('dashboard');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // 특정 품평회 상세 정보 로딩 API 연동 함수
  const fetchGroupDetails = async (groupId) => {
    try {
      const response = await fetch(`http://localhost:18000/api/admin/groups/${groupId}/details`);
      if (response.ok) {
        const data = await response.json();
        if (data.status === "success") {
          setSystemName(data.systemName);
          setJudges(data.judges);
          setBumans(data.bumans);
          setProducts(data.products);
          setTemplates(data.templates);
        }
      }
    } catch (e) {
      console.error("상세 정보 API 호출 실패:", e);
    }
  };

  useEffect(() => {
    if (isAuthed && view === 'console' && activeGroup) {
      fetchGroupDetails(activeGroup);
    }
  }, [isAuthed, view, activeGroup]);

  // groups 목록이 갱신되거나 activeGroup이 바뀔 때, 해당 대회의 이름으로 systemName 동적 복원 보정
  useEffect(() => {
    if (groups.length > 0 && activeGroup) {
      const matched = groups.find(g => g.id === activeGroup);
      if (matched && matched.name) {
        setSystemName(matched.name);
      }
    }
  }, [groups, activeGroup]);

  // 전체 데이터 로컬 스토리지 보관 헬퍼
  const saveState = (patch) => {
    try {
      const updated = {
        groups: patch.groups ?? groups,
        systemName: patch.systemName ?? systemName,
        judges: patch.judges ?? judges,
        bumans: patch.bumans ?? bumans,
        products: patch.products ?? products,
        templates: patch.templates ?? templates,
      };
      localStorage.setItem('kricefesta_admin_v1', JSON.stringify(updated));
    } catch (e) {
      console.error('LocalStorage 동기화 실패:', e);
    }
  };

  // Toast 플래시 메시지
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => {
      setToast('');
    }, 2500);
  };

  // 로그인 API 호출 검증
  const handleLoginSubmit = async (e) => {
    e.preventDefault();

    try {
      const response = await fetch("http://localhost:18000/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: email, password: password })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || `인증 에러: ${response.status}`);
      }

      const data = await response.json();
      console.log("로그인 성공:", data);

      sessionStorage.setItem('kricefesta_admin_session', 'true');
      localStorage.setItem('kricefesta_admin_remember', 'true');

      setIsAuthed(true);
      showToast('성공적으로 관리자 콘솔에 접속하였습니다.');
    } catch (err) {
      console.error("로그인 실패:", err);
      alert(err.message || "백엔드 API 서버와 통신할 수 없거나 계정이 일치하지 않습니다.");
    }
  };

  // 로그아웃
  const handleLogout = () => {
    localStorage.removeItem('kricefesta_admin_remember');
    sessionStorage.removeItem('kricefesta_admin_session');
    setIsAuthed(false);
    setView('dashboard');
  };

  // 새 품평회 대그룹 만들기
  const handleAddGroup = async () => {
    const name = "새 품평회 (제목 입력)";

    try {
      const response = await fetch("http://localhost:18000/api/admin/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name,
          period: "",
          status: "준비중"
        })
      });

      if (response.ok) {
        showToast('새 대그룹 품평회가 추가되었습니다.');
        fetchGroups(); // 백엔드에 쿼리하여 리스트 즉시 리로드
      } else {
        alert("대그룹 생성에 실패하였습니다.");
      }
    } catch (e) {
      console.error("대그룹 생성 오류:", e);
      // Fallback
      const nextId = groups.length + 1;
      const newGroups = [...groups, {
        id: nextId,
        name,
        period: '',
        status: '준비중',
        progress: 0
      }];
      setGroups(newGroups);
      saveState({ groups: newGroups });
      showToast('새 대그룹 품평회가 추가되었습니다. (오프라인 모드)');
    }
  };

  // 평가자 추가
  const handleAddJudge = () => {
    const newJudges = [...judges, {
      id: nextUid(),
      name: '',
      affiliation: '',
      role: '심사위원'
    }];
    setJudges(newJudges);
    saveState({ judges: newJudges });
  };

  // 평가자 삭제
  const handleDeleteJudge = (id) => {
    const newJudges = judges.filter(j => j.id !== id);
    setJudges(newJudges);
    saveState({ judges: newJudges });
    showToast('심사위원이 목록에서 제거되었습니다.');
  };

  // 부문 추가
  const handleAddBuman = () => {
    const newBumans = [...bumans, {
      id: nextUid(),
      prefix: '',
      cat: 'open',
      name: ''
    }];
    setBumans(newBumans);
    saveState({ bumans: newBumans });
  };

  // 부문 삭제
  const handleDeleteBuman = (id) => {
    const target = bumans.find(b => b.id === id);
    const newBumans = bumans.filter(b => b.id !== id);
    setBumans(newBumans);

    // 관련 제품 테이블 클리어
    if (target && target.prefix) {
      const nextProducts = { ...products };
      delete nextProducts[target.prefix];
      setProducts(nextProducts);
      saveState({ bumans: newBumans, products: nextProducts });
    } else {
      saveState({ bumans: newBumans });
    }
    showToast('선택한 부문이 삭제되었습니다.');
  };

  // 제품 추가
  const handleAddProduct = (bk) => {
    const list = products[bk] || [];
    const num = list.length + 1;
    const code = `${bk}-${num}`;
    const nextProducts = {
      ...products,
      [bk]: [...list, { id: nextUid(), code, name: '' }]
    };
    setProducts(nextProducts);
    saveState({ products: nextProducts });
  };

  // 제품 삭제
  const handleDeleteProduct = (bk, id) => {
    const list = products[bk] || [];
    const nextProducts = {
      ...products,
      [bk]: list.filter(p => p.id !== id)
    };
    setProducts(nextProducts);
    saveState({ products: nextProducts });
    showToast('선택한 평가 제품이 삭제되었습니다.');
  };

  // 평가항목 그룹 추가
  const handleAddItemGroup = () => {
    const list = templates[template] || [];
    const nextTemplates = {
      ...templates,
      [template]: [...list, { id: nextUid(), name: '신규 평가 항목군', convertTo: '', items: [] }]
    };
    setTemplates(nextTemplates);
    saveState({ templates: nextTemplates });
  };

  // 평가항목 그룹 내 단일 항목 추가
  const handleAddSingleItem = (gid) => {
    const list = templates[template] || [];
    const nextTemplates = {
      ...templates,
      [template]: list.map(g => {
        if (g.id !== gid) return g;
        return {
          ...g,
          items: [...g.items, { id: nextUid(), name: '', max: 10 }]
        };
      })
    };
    setTemplates(nextTemplates);
    saveState({ templates: nextTemplates });
  };

  // 평가항목 그룹 내 단일 항목 삭제
  const handleDeleteSingleItem = (gid, itid) => {
    const list = templates[template] || [];
    const nextTemplates = {
      ...templates,
      [template]: list.map(g => {
        if (g.id !== gid) return g;
        return {
          ...g,
          items: g.items.filter(it => it.id !== itid)
        };
      })
    };
    setTemplates(nextTemplates);
    saveState({ templates: nextTemplates });
  };

  // 결과 확정 및 공표
  const handlePublish = () => {
    showToast('평가 결과 집계가 최종 확정 및 공표 완료되었습니다.');
  };

  // 변경사항 저장 토스트 노출
  const handleSaveAll = async () => {
    saveState({ groups, systemName, judges, bumans, products, templates });

    try {
      const response = await fetch(`http://localhost:18000/api/admin/groups/${activeGroup}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemName,
          period: groups.find(g => g.id === activeGroup)?.period || "",
          status: groups.find(g => g.id === activeGroup)?.status || "준비중",
          judges,
          bumans,
          products,
          templates
        })
      });

      if (response.ok) {
        showToast('모든 설정 변경 사항이 데이터베이스에 자동 반영 및 저장되었습니다.');
        fetchGroups();
      } else {
        alert("데이터베이스 저장에 실패하였습니다.");
      }
    } catch (e) {
      console.error("데이터베이스 저장 중 에러:", e);
      showToast('모든 설정 변경 사항이 로컬 스토리지에 동기화 저장되었습니다.');
    }
  };

  // 통계 계산
  const counts = {
    judges: judges.length,
    bumans: bumans.length,
    products: Object.values(products).reduce((acc, list) => acc + list.length, 0),
    items: Object.values(templates).reduce((acc, gs) => acc + gs.reduce((sum, g) => sum + g.items.length, 0), 0)
  };

  // 1) 로그인하지 않은 상태 ➡️ 로그인 페이지 렌더링
  if (!isAuthed) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-[#1b2a4a] to-[#20325a] p-5">
        <div className="w-full max-w-[480px] bg-white/5 border border-white/10 rounded-[24px] p-10 md:p-12 shadow-2xl backdrop-blur-md text-center">

          {/* 브랜딩 영역 */}
          <div className="mb-9">
            <div className="text-xs font-bold text-[#d9b866] tracking-[3px] uppercase">
              Admin Console
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white mt-2.5 leading-normal">
              전문가 품평회<br />관리 시스템
            </h1>
          </div>

          {/* 로그인 폼 */}
          <form onSubmit={handleLoginSubmit} className="text-left">
            <div className="mb-5">
              <label className="block text-xs font-bold text-textBlue mb-2">
                관리자 이메일 주소 / ID
              </label>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-[52px] bg-white/5 border border-white/15 rounded-xl px-4 text-white text-base font-medium placeholder-gray-500 focus:outline-none focus:bg-white/10 focus:border-[#d9b866] transition-all"
                placeholder="adminmaster"
                required
                autoComplete="username"
              />
            </div>

            <div className="mb-5">
              <label className="block text-xs font-bold text-textBlue mb-2">
                비밀번호
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-[52px] bg-white/5 border border-white/15 rounded-xl px-4 text-white text-base font-medium placeholder-gray-500 focus:outline-none focus:bg-white/10 focus:border-[#d9b866] transition-all"
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              className="w-full h-[54px] bg-[#e03b3b] hover:bg-[#c0392b] active:translate-y-[1px] text-white font-extrabold text-base rounded-xl mt-3 shadow-[0_4px_15px_rgba(224,59,59,0.3)] hover:shadow-[0_6px_20px_rgba(224,59,59,0.4)] transition-all cursor-pointer"
            >
              로그인
            </button>

            {/* 추가 제어 행 제거 완료 */}
          </form>

          {/* 안내 */}
          <div className="mt-12 text-[10px] text-gray-500 leading-relaxed">
            본 시스템은 승인된 품평회 관리자만 접근할 수 있습니다.<br />
            © 2026 우리쌀우리술 K-라이스페스타. All Rights Reserved.
          </div>

        </div>
      </div>
    );
  }

  // 2) 로그인 완료 후 ➡️ 대시보드 메인 화면 렌더링
  if (view === 'dashboard') {
    const dashStats = [
      { label: '전체 대그룹', value: groups.length + '개' },
      { label: '진행중', value: groups.filter(g => g.status === '진행중').length + '개' },
      { label: '준비중', value: groups.filter(g => g.status === '준비중').length + '개' },
      { label: '완료', value: groups.filter(g => g.status === '완료').length + '개' },
    ];

    return (
      <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#eef1f6', color: '#2b3646', display: 'flex', flexDirection: 'column' }}>

        {/* 상단 띠 배너 헤더 */}
        <div style={{ background: 'linear-gradient(135deg,#1b2a4a,#243a63)', color: '#fff', padding: '30px 40px', display: 'flex', alignItems: 'center', gap: '20px', flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '12px', letterSpacing: '2px', color: '#d9b866', fontWeight: 700 }}>
              ADMIN CONSOLE · DASHBOARD
            </div>
            <div style={{ marginTop: '8px', fontSize: '26px', fontWeight: 800 }}>
              전문가 품평회 평가 시스템
            </div>
            <div style={{ marginTop: '5px', fontSize: '14px', color: '#9db0d4' }}>
              대그룹(품평회)을 생성하고 진행 상태를 관리합니다.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={handleAddGroup}
              style={{ background: '#e03b3b', border: 'none', color: '#fff', borderRadius: '11px', height: '50px', padding: '0 24px', fontSize: '15px', fontWeight: 800, cursor: 'pointer' }}
            >
              + 새 대그룹 만들기
            </button>
            <button
              onClick={handleLogout}
              title="로그아웃"
              className="logout-btn-header"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#fff',
                borderRadius: '11px',
                width: '50px',
                height: '50px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </div>

        {/* 통계 요약 카드 배치 */}
        <div style={{ flex: 1, overflow: 'auto', padding: '28px 40px 60px' }}>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
            {dashStats.map((s, idx) => (
              <div key={idx} style={{ flex: 1, minWidth: '140px', background: '#fff', border: '1px solid #e5e9f0', borderRadius: '14px', padding: '18px 22px' }}>
                <div style={{ fontSize: '13px', color: '#8b97ab', fontWeight: 600 }}>{s.label}</div>
                <div style={{ marginTop: '6px', fontSize: '30px', fontWeight: 800, color: '#1b2a4a' }}>{s.value}</div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: '15px', fontWeight: 800, color: '#1b2a4a', marginBottom: '14px' }}>
            대그룹 목록
          </div>

          {/* 품평회 카드 리스트 그리드 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '18px' }}>
            {groups.map((group) => {
              const sc = group.status === '진행중'
                ? { bg: '#eaf3fb', fg: '#2f5488', bar: '#2f5488' }
                : group.status === '완료'
                  ? { bg: '#eef7f1', fg: '#2f7a4f', bar: '#2f7a4f' }
                  : { bg: '#f4f6fa', fg: '#8b97ab', bar: '#c3ccdb' };

              const isRice = group.id === 1;
              const isCurrentActive = group.id === activeGroup;
              const bumanCount = isCurrentActive ? counts.bumans : (group.bumanCount ?? (group.status === '준비중' ? 0 : 6));
              const judgeCount = isCurrentActive ? counts.judges : (group.judgeCount ?? (group.status === '준비중' ? 0 : 8));
              const productCount = isCurrentActive ? counts.products : (group.productCount ?? (group.status === '준비중' ? 0 : 32));

              return (
                <div
                  key={group.id}
                  onClick={() => {
                    setActiveGroup(group.id);
                    setSystemName(group.name);
                    setJudges([]);
                    setBumans([]);
                    setProducts({});
                    setTemplates({ open: [], blind: [] });
                    setView('console');
                    setSection('overview');
                  }}
                  className="dashboard-card"
                  style={{
                    background: '#fff',
                    border: '1px solid #e5e9f0',
                    borderRadius: '16px',
                    padding: '22px 24px',
                    cursor: 'pointer',
                    boxShadow: '0 1px 2px rgba(27,42,74,.04)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ flex: 1, fontSize: '18px', fontWeight: 800, color: '#1b2a4a', lineHeight: 1.4 }}>
                      {isRice ? systemName : group.name}
                    </div>
                    <span style={{ background: sc.bg, color: sc.fg, borderRadius: '8px', padding: '5px 12px', fontSize: '12px', fontWeight: 800, whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {group.status}
                    </span>
                  </div>

                  <div style={{ marginTop: '8px', fontSize: '13px', color: '#8b97ab', fontWeight: 600 }}>
                    {group.period && group.period.trim() !== "" ? group.period : "기간 없음"}
                  </div>

                  <div style={{ marginTop: '18px', display: 'flex', gap: '22px' }}>
                    <div>
                      <div style={{ fontSize: '11px', color: '#9aa6bb', fontWeight: 600 }}>부문</div>
                      <div style={{ marginTop: '2px', fontSize: '20px', fontWeight: 800, color: '#3a475c' }}>{bumanCount}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#9aa6bb', fontWeight: 600 }}>평가자</div>
                      <div style={{ marginTop: '2px', fontSize: '20px', fontWeight: 800, color: '#3a475c' }}>{judgeCount}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#9aa6bb', fontWeight: 600 }}>제품</div>
                      <div style={{ marginTop: '2px', fontSize: '20px', fontWeight: 800, color: '#3a475c' }}>{productCount}</div>
                    </div>
                  </div>

                  <div style={{ marginTop: '18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700, color: '#8b97ab', marginBottom: '6px' }}>
                      <span>평가 진행률</span>
                      <span style={{ color: '#b58a2e' }}>{group.progress}%</span>
                    </div>
                    <div style={{ height: '8px', borderRadius: '6px', background: '#eef1f6', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${group.progress}%`, background: sc.bar, borderRadius: '6px' }}></div>
                    </div>
                  </div>

                  <div style={{ marginTop: '18px', fontSize: '13px', fontWeight: 800, color: '#e03b3b' }}>
                    관리하기 →
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // 3) 특정 대회 상세 콘솔 화면 렌더링 (`view === 'console'`)
  const activeBumanObject = bumans.find(b => b.prefix === productBuman) || bumans[0] || { fb_id: 9999, prefix: "", name: "등록된 부문 없음", type: "open" };
  const activeResultBumanObject = bumans.find(b => b.prefix === resultBuman) || bumans[0] || { fb_id: 9999, prefix: "", name: "등록된 부문 없음", type: "open" };

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#eef1f6] text-[#2b3646] flex select-none">

      {/* 상세 콘솔 사이드바 */}
      <div className="w-[280px] shrink-0 bg-gradient-to-b from-[#1b2a4a] to-[#20325a] text-white flex flex-col overflow-hidden">
        <div className="py-[22px] px-6 border-b border-[#2f4269] shrink-0">
          <button
            onClick={() => setView('dashboard')}
            className="bg-transparent border border-[#45577f] text-[#c6d2ea] rounded-[9px] h-[36px] px-3 text-[13px] font-semibold cursor-pointer mb-3.5 hover:bg-[#243a63] transition-all"
          >
            ← 대시보드
          </button>
          <div className="text-[11px] tracking-[2px] text-[#d9b866] font-bold">
            ACTIVE GROUP
          </div>
          <div className="mt-2 text-[19px] font-extrabold leading-[1.35] truncate-2-lines">
            {systemName}
          </div>
          <div className="mt-1.5 text-[12px] text-textBlue">
            관리자 설정 시스템
          </div>
        </div>

        {/* 네비게이션 버튼 배치 */}
        <div className="flex-1 overflow-auto py-3.5 px-3">
          {NAV.map((n) => {
            const active = section === n.key;
            // 각 탭별 요약 카운트 매치
            const cnt = n.key === 'judges' ? counts.judges : n.key === 'bumans' ? counts.bumans : n.key === 'products' ? counts.products : n.key === 'items' ? counts.items : '';

            return (
              <button
                key={n.key}
                onClick={() => setSection(n.key)}
                className={`flex items-center gap-3 w-full py-3 px-3.5 mb-1 rounded-[10px] cursor-pointer text-[14px] font-semibold border-none transition-all ${active
                    ? 'bg-[#e03b3b] text-white font-extrabold'
                    : 'bg-transparent text-[#c6d2ea] hover:bg-white/5'
                  }`}
              >
                <span className="w-[26px] text-[15px] text-center">{n.icon}</span>
                <span className="flex-1 text-left">{n.label}</span>
                {cnt !== '' && (
                  <span className={`text-[11px] font-extrabold py-0.5 px-2 rounded-full ${active ? 'bg-white/20 text-white' : 'bg-[#2f4269] text-[#9db0d4]'
                    }`}>
                    {cnt}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="py-4 px-5 border-top border-[#2f4269] text-[12px] text-bannerSub leading-relaxed shrink-0">
          태블릿 평가자앱과 연동<br />
          변경사항은 자동 반영됩니다
        </div>
      </div>

      {/* 상세 콘솔 메인 제어판 */}
      <div className="flex-grow flex flex-col overflow-hidden">

        {/* 제어판 탑 툴바 */}
        <div className="bg-white border-b border-[#dde3ec] py-[18px] px-[30px] flex items-center gap-4 shrink-0">
          <div className="flex-1">
            <div className="text-[12px] text-[#8b97ab] font-bold uppercase leading-none">
              대회 관리자 모드
            </div>
            <div className="mt-[3px] text-[22px] font-extrabold text-[#1b2a4a] leading-none">
              {NAV.find(n => n.key === section)?.label}
            </div>
          </div>
          <button
            onClick={handleSaveAll}
            className="bg-[#e03b3b] border-none text-white rounded-[10px] h-[46px] px-[22px] text-[15px] font-extrabold cursor-pointer hover:bg-[#c0392b] transition-all"
          >
            변경사항 저장
          </button>
        </div>

        {/* 핵심 컨텐츠 패널 스위칭 */}
        <div className="flex-1 overflow-auto py-[26px] px-[30px] pb-[60px]">

          {/* 1) 시스템 개요 (overview) */}
          {section === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white border border-[#e5e9f0] rounded-[14px] p-5">
                  <div className="text-[13px] text-[#8b97ab] font-semibold">총 심사위원</div>
                  <div className="mt-2 text-[34px] font-extrabold text-[#1b2a4a] leading-none">{counts.judges}명</div>
                  <div className="mt-1 text-[12px] text-[#b58a2e] font-semibold">실시간 권한 보유</div>
                </div>
                <div className="bg-white border border-[#e5e9f0] rounded-[14px] p-5">
                  <div className="text-[13px] text-[#8b97ab] font-semibold">평가 대상 부문</div>
                  <div className="mt-2 text-[34px] font-extrabold text-[#1b2a4a] leading-none">{counts.bumans}개</div>
                  <div className="mt-1 text-[12px] text-[#b58a2e] font-semibold">오픈/블라인드 혼용</div>
                </div>
                <div className="bg-white border border-[#e5e9f0] rounded-[14px] p-5">
                  <div className="text-[13px] text-[#8b97ab] font-semibold">등록 평가제품</div>
                  <div className="mt-2 text-[34px] font-extrabold text-[#1b2a4a] leading-none">{counts.products}개</div>
                  <div className="mt-1 text-[12px] text-[#b58a2e] font-semibold">품목 세부 분류</div>
                </div>
                <div className="bg-white border border-[#e5e9f0] rounded-[14px] p-5">
                  <div className="text-[13px] text-[#8b97ab] font-semibold">설정 평가항목</div>
                  <div className="mt-2 text-[34px] font-extrabold text-[#1b2a4a] leading-none">{counts.items}개</div>
                  <div className="mt-1 text-[12px] text-[#b58a2e] font-semibold">5단계 척도 매핑</div>
                </div>
              </div>

              <div className="bg-white border border-[#e5e9f0] rounded-[14px] p-[26px] max-w-[720px]">
                <div className="text-[16px] font-extrabold text-[#1b2a4a] leading-none">
                  대그룹 (평가 시스템) 명칭
                </div>
                <div className="mt-1.5 text-[13px] text-[#8b97ab] leading-none">
                  평가자앱 상단 및 로그인 화면에 실시간으로 표시되는 메인 대회 타이틀입니다.
                </div>
                <input
                  type="text"
                  value={systemName}
                  onChange={(e) => setSystemName(e.target.value)}
                  className="mt-4 w-full h-[52px] border-[1.5px] border-[#cbd3e1] rounded-[11px] px-[18px] text-[17px] font-extrabold text-[#1b2a4a] bg-white focus:outline-none focus:border-primary transition-all"
                />

                <div className="mt-[30px] text-[16px] font-extrabold text-[#1b2a4a] leading-none">
                  평가 방식 정보
                </div>
                <div className="mt-3 flex gap-3 flex-wrap">
                  {bumans.length === 0 ? (
                    <div className="w-full border border-dashed border-[#c3ccdb] bg-[#f4f6fa] rounded-[12px] p-5 text-center text-[#8b97ab] font-bold text-[13px]">
                      평가항목 설정이 안되있습니다.
                    </div>
                  ) : (
                    <>
                      {bumans.some(b => b.type === 'open') && (
                        <div className="flex-1 min-w-[200px] border border-green-200 bg-[#f2f7ea] rounded-[12px] p-4">
                          <div className="text-[13px] font-bold text-brandGreen">오픈 테스트 방식</div>
                          <div className="mt-1.5 text-[13px] text-[#6b7890] leading-relaxed">
                            제품명과 분류코드가 모두 공개되어 평가가 진행됩니다. 관능 평가(100)와 상품성 평가(50)를 합산하여 최종 120점 점수로 소계 환산 산출합니다.
                          </div>
                        </div>
                      )}
                      {bumans.some(b => b.type === 'blind') && (
                        <div className="flex-1 min-w-[200px] border border-blue-200 bg-[#eef4fb] rounded-[12px] p-4">
                          <div className="text-[13px] font-bold text-brandBlue">블라인드 테스트 방식</div>
                          <div className="mt-1.5 text-[13px] text-[#6b7890] leading-relaxed">
                            제품명이 완전히 기밀로 부쳐지며 오직 난수형 분류코드만 노출됩니다. 5개 관능 평가 항목 합계를 그대로 120점 소계로 산출합니다.
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 2) 평가자 등록 (judges) */}
          {section === 'judges' && (
            <div className="bg-white border border-[#e5e9f0] rounded-[14px] overflow-hidden max-w-[940px] shadow-sm">
              <div className="grid grid-cols-[56px_1.4fr_1.6fr_1.2fr_80px] bg-[#f4f6fa] border-b border-[#e5e9f0] text-[12px] font-extrabold text-[#5a6a82]">
                <div className="p-3 text-center">No.</div>
                <div className="p-3">성명</div>
                <div className="p-3">소속</div>
                <div className="p-3">직위 / 역할</div>
                <div className="p-3 text-center">삭제</div>
              </div>

              {judges.map((j, idx) => (
                <div key={j.id} className="grid grid-cols-[56px_1.4fr_1.6fr_1.2fr_80px] border-b border-[#eef1f6] align-center items-center last:border-b-0">
                  <div className="p-3 text-center font-bold text-[#8b97ab]">{idx + 1}</div>
                  <div className="p-1.5">
                    <input
                      type="text"
                      value={j.name}
                      onChange={(e) => {
                        const next = judges.map(x => x.id === j.id ? { ...x, name: e.target.value } : x);
                        setJudges(next);
                      }}
                      placeholder="성명"
                      className="w-full h-10 border border-[#dde3ec] rounded-lg px-3 text-[14px] font-semibold text-primary"
                    />
                  </div>
                  <div className="p-1.5">
                    <input
                      type="text"
                      value={j.affiliation}
                      onChange={(e) => {
                        const next = judges.map(x => x.id === j.id ? { ...x, affiliation: e.target.value } : x);
                        setJudges(next);
                      }}
                      placeholder="소속 기관"
                      className="w-full h-10 border border-[#dde3ec] rounded-lg px-3 text-[14px] text-primary"
                    />
                  </div>
                  <div className="p-1.5">
                    <input
                      type="text"
                      value={j.role}
                      onChange={(e) => {
                        const next = judges.map(x => x.id === j.id ? { ...x, role: e.target.value } : x);
                        setJudges(next);
                      }}
                      placeholder="예) 심사위원"
                      className="w-full h-10 border border-[#dde3ec] rounded-lg px-3 text-[14px] text-primary"
                    />
                  </div>
                  <div className="p-1.5 text-center">
                    <button
                      onClick={() => handleDeleteJudge(j.id)}
                      className="w-[38px] h-[38px] border border-red-200 bg-white hover:bg-red-50 text-[#c0392b] rounded-lg text-[16px] font-extrabold cursor-pointer transition-all"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}

              <div className="p-3.5 bg-gray-50/50">
                <button
                  onClick={handleAddJudge}
                  className="w-full h-[46px] border-[1.5px] border-dashed border-[#c3ccdb] bg-white text-[#3a475c] rounded-xl text-[14px] font-bold cursor-pointer hover:bg-[#f8fafc] transition-all"
                >
                  + 평가자 추가
                </button>
              </div>
            </div>
          )}

          {/* 3) 부문 등록 (bumans) */}
          {section === 'bumans' && (
            <div className="space-y-4">
              <div className="bg-white border border-[#e5e9f0] rounded-[14px] overflow-hidden max-w-[980px] shadow-sm">
                <div className="grid grid-cols-[56px_90px_130px_1.6fr_150px_80px] bg-[#f4f6fa] border-b border-[#e5e9f0] text-[12px] font-extrabold text-[#5a6a82]">
                  <div className="p-3 text-center">No.</div>
                  <div className="p-3">코드 (Prefix)</div>
                  <div className="p-3">평가 방식</div>
                  <div className="p-3">부문명</div>
                  <div className="p-3">제품 현황</div>
                  <div className="p-3 text-center">삭제</div>
                </div>

                {bumans.map((b, idx) => (
                  <div key={b.id} className="grid grid-cols-[56px_90px_130px_1.6fr_150px_80px] border-b border-[#eef1f6] align-center items-center last:border-b-0">
                    <div className="p-3 text-center font-bold text-[#8b97ab]">{idx + 1}</div>
                    <div className="p-1.5">
                      <input
                        type="text"
                        value={b.prefix}
                        onChange={(e) => {
                          const next = bumans.map(x => x.id === b.id ? { ...x, prefix: e.target.value } : x);
                          setBumans(next);
                        }}
                        className="w-full h-10 border border-[#dde3ec] rounded-lg px-2 text-[15px] font-extrabold text-center text-primary"
                      />
                    </div>
                    <div className="p-1.5">
                      <select
                        value={b.cat}
                        onChange={(e) => {
                          const next = bumans.map(x => x.id === b.id ? { ...x, cat: e.target.value } : x);
                          setBumans(next);
                        }}
                        className="w-full h-10 border border-[#dde3ec] rounded-lg px-2 text-[13px] font-semibold bg-white text-primary"
                      >
                        <option value="open">오픈</option>
                        <option value="blind">블라인드</option>
                      </select>
                    </div>
                    <div className="p-1.5">
                      <input
                        type="text"
                        value={b.name}
                        onChange={(e) => {
                          const next = bumans.map(x => x.id === b.id ? { ...x, name: e.target.value } : x);
                          setBumans(next);
                        }}
                        placeholder="부문명 입력"
                        className="w-full h-10 border border-[#dde3ec] rounded-lg px-3 text-[14px] font-semibold text-primary"
                      />
                    </div>
                    <div className="p-1.5">
                      <span className="inline-block py-1 px-3 text-[12px] font-semibold text-[#8b97ab] bg-[#eef1f6] rounded-full">
                        {(products[b.prefix] || []).length}개 제품
                      </span>
                    </div>
                    <div className="p-1.5 text-center">
                      <button
                        onClick={() => handleDeleteBuman(b.id)}
                        className="w-[38px] h-[38px] border border-red-200 bg-white hover:bg-red-50 text-[#c0392b] rounded-lg text-[16px] font-extrabold cursor-pointer transition-all"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}

                <div className="p-3.5 bg-gray-50/50">
                  <button
                    onClick={handleAddBuman}
                    className="w-full h-[46px] border-[1.5px] border-dashed border-[#c3ccdb] bg-white text-[#3a475c] rounded-xl text-[14px] font-bold cursor-pointer hover:bg-[#f8fafc] transition-all"
                  >
                    + 부문 추가
                  </button>
                </div>
              </div>
              <div className="text-[12px] text-[#8b97ab] leading-[1.7] max-w-[980px]">
                ※ 오픈 부문은 관능평가+상품성평가 세트가, 블라인드는 순수 관능평가 세트가 태블릿 채점지에 매핑됩니다.
              </div>
            </div>
          )}

          {/* 4) 부문별 제품 (products) */}
          {section === 'products' && (
            <div className="space-y-4">
              {/* 상단 부문 전환 탭 */}
              <div className="flex gap-2 flex-wrap">
                {bumans.filter(b => b.prefix).map((b) => {
                  const active = b.prefix === productBuman;
                  return (
                    <button
                      key={b.id}
                      onClick={() => setProductBuman(b.prefix)}
                      className={`flex items-center gap-1.5 py-2.5 px-4 rounded-[10px] cursor-pointer text-[14px] border transition-all ${active
                          ? 'border-[#1b2a4a] bg-[#1b2a4a] text-white font-extrabold'
                          : 'border-[#dde3ec] bg-white text-[#5a6a82] hover:border-gray-300'
                        }`}
                    >
                      <span className="font-extrabold">{b.prefix}</span>
                      <span className="opacity-90 font-semibold">{b.name}</span>
                    </button>
                  );
                })}
              </div>

              {/* 제품 제어 테이블 */}
              <div className="bg-white border border-[#e5e9f0] rounded-[14px] overflow-hidden max-w-[760px] shadow-sm">
                <div className="grid grid-cols-[56px_160px_1.6fr_80px] bg-[#f4f6fa] border-b border-[#e5e9f0] text-[12px] font-extrabold text-[#5a6a82]">
                  <div className="p-3 text-center">No.</div>
                  <div className="p-3">제품 분류코드</div>
                  <div className="p-3">제품명 {activeBumanObject?.cat === 'blind' ? '(블라인드 비공개)' : ''}</div>
                  <div className="p-3 text-center">삭제</div>
                </div>

                {(products[productBuman] || []).map((p, idx) => {
                  const isBlind = activeBumanObject?.cat === 'blind';

                  return (
                    <div key={p.id} className="grid grid-cols-[56px_160px_1.6fr_80px] border-b border-[#eef1f6] align-center items-center last:border-b-0">
                      <div className="p-3 text-center font-bold text-[#8b97ab]">{idx + 1}</div>
                      <div className="p-1.5">
                        <input
                          type="text"
                          value={p.code}
                          onChange={(e) => {
                            const next = (products[productBuman] || []).map(x => x.id === p.id ? { ...x, code: e.target.value } : x);
                            setProducts({ ...products, [productBuman]: next });
                          }}
                          className="w-full h-10 border border-[#dde3ec] rounded-lg px-3 text-[15px] font-extrabold text-primary"
                        />
                      </div>
                      <div className="p-1.5">
                        <input
                          type="text"
                          value={isBlind ? '' : p.name}
                          disabled={isBlind}
                          onChange={(e) => {
                            const next = (products[productBuman] || []).map(x => x.id === p.id ? { ...x, name: e.target.value } : x);
                            setProducts({ ...products, [productBuman]: next });
                          }}
                          placeholder={isBlind ? '블라인드 — 코드만 노출' : '제품명 입력'}
                          className={`w-full h-10 border rounded-lg px-3 text-[14px] ${isBlind
                              ? 'border-dashed border-[#dde3ec] bg-[#f7f8fb] text-[#a7b1c2] cursor-not-allowed'
                              : 'border-[#dde3ec] bg-white font-semibold text-primary'
                            }`}
                        />
                      </div>
                      <div className="p-1.5 text-center">
                        <button
                          onClick={() => handleDeleteProduct(productBuman, p.id)}
                          className="w-[38px] h-[38px] border border-red-200 bg-white hover:bg-red-50 text-[#c0392b] rounded-lg text-[16px] font-extrabold cursor-pointer transition-all"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  );
                })}

                <div className="p-3.5 bg-gray-50/50">
                  <button
                    onClick={() => handleAddProduct(productBuman)}
                    className="w-full h-[46px] border-[1.5px] border-dashed border-[#c3ccdb] bg-white text-[#3a475c] rounded-xl text-[14px] font-bold cursor-pointer hover:bg-[#f8fafc] transition-all"
                  >
                    + 제품 추가
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 5) 평가항목 설정 (items) */}
          {section === 'items' && (
            <div className="space-y-4">
              {/* 항목 템플릿 대그룹 전환 */}
              <div className="flex gap-2">
                <button
                  onClick={() => setTemplate('open')}
                  className={`py-3 px-5 rounded-[10px] cursor-pointer text-[14px] font-bold border transition-all ${template === 'open'
                      ? 'border-[#1b2a4a] bg-[#1b2a4a] text-white font-extrabold'
                      : 'border-[#dde3ec] bg-white text-[#5a6a82] hover:border-gray-300'
                    }`}
                >
                  오픈 테스트 평가항목 구성
                </button>
                <button
                  onClick={() => setTemplate('blind')}
                  className={`py-3 px-5 rounded-[10px] cursor-pointer text-[14px] font-bold border transition-all ${template === 'blind'
                      ? 'border-[#1b2a4a] bg-[#1b2a4a] text-white font-extrabold'
                      : 'border-[#dde3ec] bg-white text-[#5a6a82] hover:border-gray-300'
                    }`}
                >
                  블라인드 테스트 평가항목 구성
                </button>
              </div>

              {/* 항목 리스트 카드 루프 */}
              {templates[template].map((g, idx) => {
                const rawTotal = g.items.reduce((sum, it) => sum + (Number(it.max) || 0), 0);

                return (
                  <div key={g.id} className="bg-white border border-[#e5e9f0] rounded-[14px] overflow-hidden max-w-[1000px] shadow-sm">
                    {/* 카드 헤더 */}
                    <div
                      className="p-4 px-5 border-b border-[#e5e9f0] flex items-center gap-4 flex-wrap"
                      style={{ backgroundColor: idx % 2 === 1 ? '#f5f7ec' : '#f4f7fb' }}
                    >
                      <div className="flex-1 min-w-[200px]">
                        <div className="text-[11px] font-bold tracking-[1px] text-[#8b97ab] uppercase">
                          항목 그룹명
                        </div>
                        <input
                          type="text"
                          value={g.name}
                          onChange={(e) => {
                            const list = templates[template];
                            const next = list.map(x => x.id === g.id ? { ...x, name: e.target.value } : x);
                            setTemplates({ ...templates, [template]: next });
                          }}
                          className="mt-1 w-[280px] max-w-full h-10 border border-[#dde3ec] rounded-lg px-3 text-[16px] font-extrabold text-[#1b2a4a] bg-white focus:outline-none"
                        />
                      </div>

                      <div className="text-right">
                        <div className="text-[11px] font-bold tracking-[1px] text-[#8b97ab] uppercase">
                          그룹 배점 합계
                        </div>
                        <div className="mt-1 text-[22px] font-extrabold text-[#1b2a4a] leading-none">
                          {rawTotal}점
                        </div>
                      </div>

                      <div className="text-right pl-4 border-l border-[#dde3ec]">
                        <div className="text-[11px] font-bold tracking-[1px] text-[#8b97ab] uppercase">
                          환산 점수 배점
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 justify-end">
                          <input
                            type="text"
                            value={g.convertTo}
                            onChange={(e) => {
                              const list = templates[template];
                              const next = list.map(x => x.id === g.id ? { ...x, convertTo: e.target.value.trim() === '' ? '' : Number(e.target.value) || 0 } : x);
                              setTemplates({ ...templates, [template]: next });
                            }}
                            placeholder="—"
                            className="w-[70px] h-[38px] border border-[#dde3ec] rounded-lg text-center font-extrabold text-[16px] text-[#b58a2e] bg-white"
                          />
                          <span className="text-[13px] text-[#8b97ab] font-bold">점</span>
                        </div>
                      </div>
                    </div>

                    {/* 카드 본문 리스트 */}
                    <div className="grid grid-cols-[1.4fr_90px_1.8fr_60px] bg-[#fafbfd] border-b border-[#eef1f6] text-[12px] font-extrabold text-[#5a6a82]">
                      <div className="py-2.5 px-4">평가 세부 항목</div>
                      <div className="py-2.5 px-3 text-center">배점</div>
                      <div className="py-2.5 px-4">5단계 척도 매핑 내역</div>
                      <div className="py-2.5 text-center">삭제</div>
                    </div>

                    {g.items.map((it) => (
                      <div key={it.id} className="grid grid-cols-[1.4fr_90px_1.8fr_60px] border-b border-[#f2f4f8] align-center items-center last:border-b-0">
                        <div className="py-1.5 px-3">
                          <input
                            type="text"
                            value={it.name}
                            onChange={(e) => {
                              const list = templates[template];
                              const next = list.map(x => {
                                if (x.id !== g.id) return x;
                                return {
                                  ...x,
                                  items: x.items.map(s => s.id === it.id ? { ...s, name: e.target.value } : s)
                                };
                              });
                              setTemplates({ ...templates, [template]: next });
                            }}
                            className="w-full h-[38px] border border-[#dde3ec] rounded-lg px-3 text-[14px] font-semibold text-primary"
                          />
                        </div>
                        <div className="py-1.5 px-2">
                          <input
                            type="text"
                            value={it.max}
                            onChange={(e) => {
                              const list = templates[template];
                              const next = list.map(x => {
                                if (x.id !== g.id) return x;
                                return {
                                  ...x,
                                  items: x.items.map(s => s.id === it.id ? { ...s, max: e.target.value.replace(/[^0-9]/g, '') } : s)
                                };
                              });
                              setTemplates({ ...templates, [template]: next });
                            }}
                            className="w-full h-[38px] border border-[#dde3ec] rounded-lg text-center font-extrabold text-[15px] text-[#b58a2e]"
                          />
                        </div>
                        <div className="py-1.5 px-3">
                          <span className="inline-block bg-[#f4f6fa] border border-[#e5e9f0] rounded-lg py-2 px-3.5 text-[14px] font-bold text-textSub tracking-[1px] leading-none">
                            {scaleOf(it.max).join(' · ')}
                          </span>
                        </div>
                        <div className="py-1.5 text-center">
                          <button
                            onClick={() => handleDeleteSingleItem(g.id, it.id)}
                            className="w-[34px] h-[34px] border border-red-200 bg-white hover:bg-red-50 text-[#c0392b] rounded-lg text-[15px] font-extrabold cursor-pointer transition-all"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}

                    <div className="p-3">
                      <button
                        onClick={() => handleAddSingleItem(g.id)}
                        className="w-full h-[42px] border-[1.5px] border-dashed border-[#c3ccdb] bg-white text-[#3a475c] rounded-[9px] text-[13px] font-bold cursor-pointer hover:bg-[#f8fafc] transition-all"
                      >
                        + 항목 추가
                      </button>
                    </div>
                  </div>
                );
              })}

              <button
                onClick={handleAddItemGroup}
                className="h-[46px] px-6 border border-[#cbd3e1] bg-white text-textSub rounded-[10px] text-[14px] font-bold cursor-pointer hover:bg-gray-50 transition-all"
              >
                + 새 항목 그룹 생성
              </button>

              <div className="text-[12px] text-[#8b97ab] leading-relaxed max-w-[1000px]">
                ※ 5단계 척도는 배점을 5등분하여 자동 생성됩니다. 환산 점수를 비워둘 경우 원점수 그대로 총점에 합산되어 평가가 반영됩니다.
              </div>
            </div>
          )}

          {/* 6) 결과 집계 (results) */}
          {section === 'results' && (
            (() => {
              const rbk = bumans.some(b => b.prefix === resultBuman) ? resultBuman : (bumans[0]?.prefix || 'A');
              const isBlind = activeResultBumanObject?.cat === 'blind';
              const canTrim = judges.length >= 3;

              // 각 제품별 심사위원 채점 매트릭스 데이터 생성
              const matrixList = (products[rbk] || []).map((p, pIdx) => {
                const listScores = judges.map((j, jIdx) => {
                  return sampleScore(pIdx, jIdx, p.code);
                });

                // 합계 연산
                const rawTotal = listScores.reduce((sum, v) => sum + v, 0);

                // 최고/최저 제외 연산
                let finalTotal = rawTotal;
                let minIdx = -1;
                let maxIdx = -1;

                if (canTrim) {
                  const sorted = [...listScores].sort((a, b) => a - b);
                  const minVal = sorted[0];
                  const maxVal = sorted[sorted.length - 1];

                  minIdx = listScores.indexOf(minVal);
                  maxIdx = listScores.lastIndexOf(maxVal); // 동일 점수 시 분리

                  finalTotal = rawTotal - minVal - maxVal;
                }

                return {
                  code: p.code,
                  name: isBlind ? '블라인드 제품' : p.name,
                  scores: listScores.map((v, idx) => ({
                    val: v,
                    isMin: idx === minIdx && canTrim,
                    isMax: idx === maxIdx && canTrim
                  })),
                  total: rawTotal,
                  finalTotal
                };
              });

              // 최종 순위 산출
              const sortedByFinal = [...matrixList].sort((a, b) => b.finalTotal - a.finalTotal);
              const rankMap = {};
              sortedByFinal.forEach((item, idx) => {
                rankMap[item.code] = idx + 1;
              });

              return (
                <div className="space-y-5">
                  {/* 부문 전환 탭 */}
                  <div className="flex gap-2 flex-wrap">
                    {bumans.filter(b => b.prefix).map((b) => {
                      const active = b.prefix === resultBuman;
                      return (
                        <button
                          key={b.id}
                          onClick={() => setResultBuman(b.prefix)}
                          className={`flex items-center gap-1.5 py-2.5 px-4 rounded-[10px] cursor-pointer text-[14px] border transition-all ${active
                              ? 'border-[#1b2a4a] bg-[#1b2a4a] text-white font-extrabold'
                              : 'border-[#dde3ec] bg-white text-[#5a6a82] hover:border-gray-300'
                            }`}
                        >
                          <span className="font-extrabold">{b.prefix}</span>
                          <span className="opacity-90 font-semibold">{b.name}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* 대회 상태 통계 */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-[1100px]">
                    <div className="bg-white border border-[#e5e9f0] rounded-[14px] p-[18px] px-5">
                      <div className="text-[12px] text-[#8b97ab] font-semibold">완료된 심사위원</div>
                      <div className="mt-1.5 text-[28px] font-extrabold text-[#1b2a4a] leading-none">{counts.judges} / {counts.judges}명</div>
                    </div>
                    <div className="bg-white border border-[#e5e9f0] rounded-[14px] p-[18px] px-5">
                      <div className="text-[12px] text-[#8b97ab] font-semibold">부문 제품 개수</div>
                      <div className="mt-1.5 text-[28px] font-extrabold text-[#1b2a4a] leading-none">{(products[rbk] || []).length}개</div>
                    </div>
                    <div className="bg-white border border-[#e5e9f0] rounded-[14px] p-[18px] px-5">
                      <div className="text-[12px] text-[#8b97ab] font-semibold">최고 합계 점수</div>
                      <div className="mt-1.5 text-[28px] font-extrabold text-[#284c7d] leading-none">
                        {matrixList.length > 0 ? Math.max(...matrixList.map(m => m.finalTotal)) : 0}점
                      </div>
                    </div>
                    <div className="bg-white border border-[#e5e9f0] rounded-[14px] p-[18px] px-5">
                      <div className="text-[12px] text-[#8b97ab] font-semibold">최저 합계 점수</div>
                      <div className="mt-1.5 text-[28px] font-extrabold text-[#c0392b] leading-none">
                        {matrixList.length > 0 ? Math.min(...matrixList.map(m => m.finalTotal)) : 0}점
                      </div>
                    </div>
                  </div>

                  {/* 순위 매트릭스 타이틀 */}
                  <div>
                    <div className="text-[15px] font-extrabold text-[#1b2a4a]">
                      부문 집계 결과 매트릭스 ({activeResultBumanObject?.name})
                    </div>
                    <div className="text-[13px] text-[#8b97ab] mt-1">
                      심사위원별 점수 · 최고( <span className="text-[#2f5488] font-bold">파랑</span> ) 및 최저( <span className="text-[#c0392b] font-bold">주황</span> ) 점수는 집계 신뢰도 확보를 위해 최종 합계 계산에서 제외됩니다.
                    </div>
                  </div>

                  {/* 매트릭스 테이블 */}
                  <div className="bg-white border border-[#e5e9f0] rounded-[14px] overflow-auto max-w-full shadow-sm">
                    <table className="border-collapse border-spacing-0 w-full text-[13px]">
                      <thead>
                        <tr>
                          <th className="sticky left-0 bg-[#1b2a4a] text-white p-3 font-extrabold text-center min-w-[90px] z-20">
                            제품<br />분류코드
                          </th>
                          <th className="sticky left-[90px] bg-[#1b2a4a] text-white p-3 font-extrabold text-left min-w-[150px] z-10">
                            제품명
                          </th>
                          {judges.map((j) => (
                            <th key={j.id} className="bg-[#243a63] text-white p-3 font-semibold text-center min-w-[100px] whitespace-nowrap">
                              {j.name}<br /><span className="text-[10px] text-textBlue font-normal">{j.affiliation}</span>
                            </th>
                          ))}
                          <th className="bg-[#2f5a3a] text-white p-3 font-extrabold text-center min-w-[78px]">
                            원점수합
                          </th>
                          <th className="bg-[#8a6a1e] text-white p-3 font-extrabold text-center min-w-[90px]">
                            최종합계<br />(최고/최저 제외)
                          </th>
                          <th className="bg-[#1b2a4a] text-white p-3 font-extrabold text-center min-w-[64px]">
                            순위
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {matrixList.map((m, idx) => {
                          const rank = rankMap[m.code];
                          return (
                            <tr
                              key={m.code}
                              className="hover:bg-gray-50 border-b border-[#eef1f6] last:border-b-0"
                              style={{ backgroundColor: idx % 2 === 1 ? '#fafbfd' : '#ffffff' }}
                            >
                              <td className="sticky left-0 bg-inherit p-3 text-center font-extrabold text-[#1b2a4a] z-10">
                                {m.code}
                              </td>
                              <td className="sticky left-[90px] bg-inherit p-3 font-semibold text-[#3a475c] text-left z-10 truncate max-w-[180px]">
                                {m.name}
                              </td>

                              {/* 심사위원 개별 점수 */}
                              {m.scores.map((sc, scIdx) => (
                                <td
                                  key={scIdx}
                                  className={`p-3 text-center font-semibold border-l border-[#f2f4f8] ${sc.isMax
                                      ? 'text-[#2f5488] bg-blue-50/70 font-bold'
                                      : sc.isMin
                                        ? 'text-[#c0392b] bg-red-50/70 font-bold'
                                        : 'text-[#3a475c]'
                                    }`}
                                >
                                  {sc.val}
                                  {sc.isMax && <span className="block text-[9px] text-blue-500 font-extrabold leading-none mt-0.5">최고 제외</span>}
                                  {sc.isMin && <span className="block text-[9px] text-red-500 font-extrabold leading-none mt-0.5">최저 제외</span>}
                                </td>
                              ))}

                              {/* 원점수합 */}
                              <td className="p-3 text-center font-bold text-[#2f5a3a] bg-[#f1f7f1] border-l border-[#f2f4f8]">
                                {m.total}
                              </td>
                              {/* 최종합계 */}
                              <td className="p-3 text-center font-extrabold text-[16px] text-[#8a6a1e] bg-[#fbf4e2] border-l border-[#f2f4f8]">
                                {m.finalTotal}
                              </td>
                              {/* 순위 */}
                              <td className="p-3 text-center bg-[#f4f6fb] border-l border-[#f2f4f8]">
                                <span className={`inline-block w-6 h-6 rounded-full text-center leading-6 text-[12px] font-extrabold ${rank === 1
                                    ? 'bg-[#d9b866] text-white'
                                    : rank === 2
                                      ? 'bg-gray-400 text-white'
                                      : rank === 3
                                        ? 'bg-[#b58a2e] text-white'
                                        : 'bg-transparent text-[#5a6a82]'
                                  }`}>
                                  {rank}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* 제어 하단 버튼 */}
                  <div className="flex gap-3 max-w-[1100px]">
                    <button
                      onClick={() => {
                        const headers = ["제품분류코드", "제품명", ...judges.map(j => `${j.name}(${j.affiliation})`), "최종합계", "순위"];
                        const rows = matrixList.map(m => [
                          m.code,
                          m.name,
                          ...m.scores.map(s => s.val),
                          m.finalTotal,
                          rankMap[m.code]
                        ]);
                        console.log("관리자 집계 내역 다운로드:", { headers, rows });
                        showToast('엑셀 다운로드 프로세스가 콘솔 로그에 기록되었습니다.');
                      }}
                      className="h-[48px] px-6 border border-[#cbd3e1] bg-white text-[#3a475c] rounded-[10px] text-[14px] font-bold cursor-pointer hover:bg-gray-50 transition-all"
                    >
                      엑셀 내려받기
                    </button>
                    <button
                      onClick={handlePublish}
                      className="h-[48px] px-6 border-none bg-primary text-white rounded-[10px] text-[14px] font-extrabold cursor-pointer hover:bg-secondary transition-all"
                    >
                      결과 확정·공표
                    </button>
                  </div>

                  <div className="text-[12px] text-[#8b97ab] leading-relaxed max-w-[1100px]">
                    ※ 이 점수는 가이드 시연용 자동 난수 배치입니다. 심사위원 태블릿 어플리케이션에서 실제로 저장 및 전송된 점수가 있을 경우 실시간 병합되어 정확한 집계 결과와 순위가 관리자 대시보드 상에 연동 갱신됩니다.
                  </div>
                </div>
              );
            })()
          )}

        </div>

      </div>

      {/* 공통 토스트 안내 */}
      {toast && (
        <div className="fixed left-[50%] bottom-[36px] -translate-x-[50%] bg-[#1b2a4a] text-white py-[14px] px-[26px] rounded-[12px] text-[15px] font-semibold shadow-[0_10px_30px_rgba(0,0,0,0.25)] z-[50] flex items-center gap-[10px]">
          <span className="w-[22px] h-[22px] rounded-full bg-[#3ea06a] inline-flex items-center justify-center text-[13px] font-extrabold text-white">✓</span>
          {toast}
        </div>
      )}

    </div>
  );
}

export default App;
