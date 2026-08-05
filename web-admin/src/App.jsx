// K-라이스페스타 전문가 품평회 관리자 콘솔 종합 애플리케이션 React 컴포넌트
import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';

// API Base URL & Secret Header 자동 인젝션용 fetch 랩핑
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
  
  const newInit = { ...init };
  newInit.headers = { ...newInit.headers };
  
  const apiSecret = import.meta.env.VITE_ADMIN_API_SECRET;
  if (apiSecret) {
    newInit.headers["X-Admin-Api-Secret"] = apiSecret;
  }
  
  if (typeof input === 'string') {
    return originalFetch(url, newInit);
  } else {
    const newRequest = new Request(url, input);
    return originalFetch(newRequest, newInit);
  }
};

// 평가 항목 기본 정의
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

// 공통 네비게이션 명세
const NAV = [
  { key: 'overview', icon: '▤', label: '시스템 개요' },
  { key: 'devices', icon: '▣', label: '기기 관리' },
  { key: 'judges', icon: '◔', label: '평가자 등록' },
  { key: 'bumans', icon: '▦', label: '부문 등록' },
  { key: 'products', icon: '◇', label: '부문별 제품' },
  { key: 'items', icon: '≡', label: '평가항목 설정' },
  { key: 'results', icon: '★', label: '결과' },
];


// 한국 표준시(KST, UTC+9) 날짜 포맷팅 헬퍼
function formatKstDate(dateStr) {
  if (!dateStr) return '-';
  const str = String(dateStr).trim();
  if (!str) return '-';

  try {
    if (str.includes('T') || str.includes('Z')) {
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        return new Intl.DateTimeFormat('ko-KR', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
          timeZone: 'Asia/Seoul'
        }).format(d).replace(/\. /g, '-').replace('.', '');
      }
    }
    return str;
  } catch (e) {
    return str;
  }
}

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
  const [adminUser, setAdminUser] = useState(() => {
    try {
      const user = localStorage.getItem('kricefesta_admin_user') || sessionStorage.getItem('kricefesta_admin_user');
      return user ? JSON.parse(user) : null;
    } catch (e) {
      return null;
    }
  });

  // 2) 관리자 대시보드 및 상세 제어 상태
  const [view, setView] = useState(() => {
    try {
      const path = window.location.pathname;
      if (path.startsWith('/console')) return 'console';
      if (path.startsWith('/admin-management')) return 'admin-management';
      return 'dashboard';
    } catch (e) {
      return 'dashboard';
    }
  }); // dashboard | console | admin-management

  // 관리자 관리 전용 상태
  const [admins, setAdmins] = useState([]);
  const [showAdminForm, setShowAdminForm] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState(null);
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminGroupIds, setAdminGroupIds] = useState([]);
  const [adminIsAllGroups, setAdminIsAllGroups] = useState(true);
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
  const formatScore = (val) => {
    if (val === undefined || val === null || isNaN(val)) return '0';
    return parseFloat(Number(val).toFixed(1));
  };

  const [systemName, setSystemName] = useState('');
  const [systemCode, setSystemCode] = useState('');
  const [productBuman, setProductBuman] = useState('A');
  const [resultBuman, setResultBuman] = useState('A');
  const [template, setTemplate] = useState('open'); // open | blind (항목 설정용)
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dbBackup, setDbBackup] = useState({
    systemName: '',
    systemCode: '',
    startDate: '',
    endDate: '',
    judges: [],
    bumans: [],
    products: {},
    templates: []
  });
  const [toast, setToast] = useState('');
  const [resultsSubTab, setResultsSubTab] = useState('summary'); // summary | judges
  const [selectedResultJudgeIdx, setSelectedResultJudgeIdx] = useState(0);
  const [draggedIdx, setDraggedIdx] = useState(null);
  const [showAddTemplateForm, setShowAddTemplateForm] = useState(false);
  const [newTemplateTargetType, setNewTemplateTargetType] = useState('open_all');
  const [newTemplateTargetId, setNewTemplateTargetId] = useState('');

  // 3) 관리 리소스 데이터 상태
  const [judges, setJudges] = useState([]);
  const [bumans, setBumans] = useState([]);
  const [products, setProducts] = useState({});
  const [templates, setTemplates] = useState([]);
  const [hasEvaluations, setHasEvaluations] = useState(false);

  // 엑셀 일괄 등록 모달 관련 상태
  const [showExcelUploadModal, setShowExcelUploadModal] = useState(false);
  const [excelParsedData, setExcelParsedData] = useState(null);
  const [excelFileName, setExcelFileName] = useState('');
  const [excelErrorMsg, setExcelErrorMsg] = useState('');
  const [activeTemplateId, setActiveTemplateId] = useState(null);
  const [devices, setDevices] = useState([]);
  const [enrollOpen, setEnrollOpen] = useState(true);
  const [actualScores, setActualScores] = useState({});
  const [selectedBumanForJudge, setSelectedBumanForJudge] = useState(null);


  useEffect(() => {
    document.title = "품평회 관리자";
    try {
      const remember = localStorage.getItem('kricefesta_admin_remember');
      const session = sessionStorage.getItem('kricefesta_admin_session');
      if (remember === 'true' || session === 'true') {
        setIsAuthed(true);
        const user = localStorage.getItem('kricefesta_admin_user') || sessionStorage.getItem('kricefesta_admin_user');
        if (user) {
          setAdminUser(JSON.parse(user));
        }
      }
    } catch (e) {
      console.error('LocalStorage 복구 에러:', e);
    }
  }, []);

  // 실제 대그룹 목록 API Fetch 연동 함수
  const fetchGroups = async () => {
    try {
      const headers = {};
      const cachedUser = localStorage.getItem('kricefesta_admin_user') || sessionStorage.getItem('kricefesta_admin_user');
      if (cachedUser) {
        const parsed = JSON.parse(cachedUser);
        if (parsed && parsed.username) {
          headers["X-Admin-Username"] = parsed.username;
        }
      }
      const response = await fetch("http://localhost:18000/api/admin/groups", { headers });
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

  // 기기 목록 조회
  const fetchDevices = async (groupId) => {
    try {
      const res = await fetch(`http://localhost:18000/api/admin/groups/${groupId}/devices`);
      if (res.ok) {
        const data = await res.json();
        setDevices(data.devices || []);
        setEnrollOpen(!!data.enrollOpen);
      }
    } catch (e) {
      console.error("기기 목록 조회 실패:", e);
    }
  };

  // 기기 상태 변경 (승인/대기/차단)
  const changeDeviceStatus = async (fdId, status) => {
    try {
      const res = await fetch(`http://localhost:18000/api/admin/groups/${activeGroup}/devices/${fdId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      if (res.ok) fetchDevices(activeGroup);
      else alert("기기 상태 변경에 실패했습니다.");
    } catch (e) {
      console.error("기기 상태 변경 실패:", e);
    }
  };

  // 신규 기기 등록 잠금 토글
  const toggleEnroll = async (open) => {
    try {
      const res = await fetch(`http://localhost:18000/api/admin/groups/${activeGroup}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ open })
      });
      if (res.ok) setEnrollOpen(open);
      else alert("등록 잠금 설정에 실패했습니다.");
    } catch (e) {
      console.error("등록 잠금 변경 실패:", e);
    }
  };

  // 기기 목록 로드 (그룹 로드 시 카운트 표시 + 탭 진입 시 갱신)
  useEffect(() => {
    if (isAuthed && view === 'console' && activeGroup) {
      fetchDevices(activeGroup);
    }
  }, [isAuthed, view, activeGroup, section]);

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
    } else if (view === 'admin-management') {
      url = "/admin-management";
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
      } else if (path.startsWith('/admin-management')) {
        setView('admin-management');
      } else {
        setView('dashboard');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // 특정 품평회 상세 정보 로딩 API 연동 함수
  const fetchGroupDetails = async (groupId) => {
    console.log("[fetchGroupDetails] API 요청 시작, activeGroup:", groupId);
    try {
      const headers = {};
      const cachedUser = localStorage.getItem('kricefesta_admin_user') || sessionStorage.getItem('kricefesta_admin_user');
      if (cachedUser) {
        const parsed = JSON.parse(cachedUser);
        if (parsed && parsed.username) {
          headers["X-Admin-Username"] = parsed.username;
        }
      }
      const response = await fetch(`http://localhost:18000/api/admin/groups/${groupId}/details`, { headers });
      if (response.status === 403) {
        alert("해당 대그룹에 대한 관리 권한이 없습니다.");
        setView('dashboard');
        return;
      }
      if (response.ok) {
        const data = await response.json();
        console.log("[fetchGroupDetails] API 응답 수신 성공:", data);
        if (data.status === "success" || data.judges !== undefined) {
          setSystemName(data.systemName || '');
          setSystemCode(data.systemCode || '');
          setHasEvaluations(!!data.hasEvaluations);
          setJudges(data.judges || []);
          setBumans(data.bumans || []);
          setProducts(data.products || {});
          const fetchedTemplates = (data.templates || []).map(t => {
            return {
              ...t,
              groups: (t.groups || []).map(g => {
                return {
                  ...g,
                  items: (g.items || []).map(it => {
                    if (!it.scaleValues) {
                      const mVal = parseInt(it.max) || 0;
                      const stepSize = mVal / 5;
                      const calculatedStr = Array.from({ length: 5 }, (_, i) => Math.round(stepSize * (i + 1))).join(', ');
                      return { ...it, scaleValues: calculatedStr };
                    }
                    return it;
                  })
                };
              })
            };
          });
          setTemplates(fetchedTemplates);
          if (fetchedTemplates.length > 0) {
            setActiveTemplateId(fetchedTemplates[0].id);
          }

          let parsedStart = '';
          let parsedEnd = '';
          if (data.period) {
            const cleanPeriod = data.period.replace(/\./g, '-').replace(/\s/g, '');
            const parts = cleanPeriod.split(/–|~|--/);
            if (parts.length >= 2) {
              const start = parts[0];
              let end = parts[1];
              if (start.match(/^\d{4}-\d{2}-\d{2}$/)) {
                parsedStart = start;
                if (end.match(/^\d{2}-\d{2}$/)) {
                  end = `${start.substring(0, 4)}-${end}`;
                }
                if (end.match(/^\d{4}-\d{2}-\d{2}$/)) {
                  parsedEnd = end;
                }
              }
            } else if (cleanPeriod.match(/^\d{4}-\d{2}-\d{2}$/)) {
              parsedStart = cleanPeriod;
              parsedEnd = cleanPeriod;
            }
          }

          setStartDate(parsedStart);
          setEndDate(parsedEnd);

          setDbBackup({
            systemName: data.systemName || '',
            systemCode: data.systemCode || '',
            startDate: parsedStart,
            endDate: parsedEnd,
            judges: data.judges || [],
            bumans: data.bumans || [],
            products: data.products || {},
            templates: fetchedTemplates
          });
        }
      } else {
        console.error("[fetchGroupDetails] API 응답 에러 상태:", response.status);
      }
    } catch (e) {
      console.error("[fetchGroupDetails] 상세 정보 API 호출 실패:", e);
    }
  };

  // 특정 품평회 결과 일괄 집계 로딩 API 연동 함수
  const fetchResults = async (groupId) => {
    try {
      const headers = {};
      const cachedUser = localStorage.getItem('kricefesta_admin_user') || sessionStorage.getItem('kricefesta_admin_user');
      if (cachedUser) {
        const parsed = JSON.parse(cachedUser);
        if (parsed && parsed.username) {
          headers["X-Admin-Username"] = parsed.username;
        }
      }
      const response = await fetch(`http://localhost:18000/api/admin/groups/${groupId}/results?_=${Date.now()}`, { headers });
      if (response.ok) {
        const data = await response.json();
        if (data.status === "success") {
          setActualScores(data.scores || {});
        }
      }
    } catch (e) {
      console.error("[fetchResults] 결과 데이터 API 호출 실패:", e);
    }
  };

  useEffect(() => {
    if (isAuthed && view === 'console' && activeGroup) {
      fetchGroupDetails(activeGroup);
      if (section === 'results') {
        fetchResults(activeGroup);
      }
    }
  }, [isAuthed, view, activeGroup, section]);

  // 결과 탭 활성화 시 3초 간격 실시간 자동 데이터 폴링 갱신 효과
  useEffect(() => {
    let timer = null;
    if (isAuthed && view === 'console' && activeGroup && section === 'results') {
      timer = setInterval(() => {
        fetchResults(activeGroup);
      }, 3000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isAuthed, view, activeGroup, section]);

  // 브라우저 새로고침 및 탭 닫기 이탈 가드
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (view !== 'console') return;
      const current = JSON.stringify({ systemName, systemCode, startDate, endDate, judges, bumans, products, templates });
      const backup = JSON.stringify(dbBackup);
      if (current !== backup) {
        e.preventDefault();
        e.returnValue = "저장하지 않은 변경사항이 있습니다. 페이지를 벗어나시겠습니까?";
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [view, systemName, systemCode, startDate, endDate, judges, bumans, products, templates, dbBackup]);

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

      const userInfo = {
        username: data.username,
        name: data.name,
        isMaster: data.isMaster,
        groupIds: data.groupIds
      };

      sessionStorage.setItem('kricefesta_admin_session', 'true');
      sessionStorage.setItem('kricefesta_admin_user', JSON.stringify(userInfo));
      localStorage.setItem('kricefesta_admin_remember', 'true');
      localStorage.setItem('kricefesta_admin_user', JSON.stringify(userInfo));

      setAdminUser(userInfo);
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
    localStorage.removeItem('kricefesta_admin_user');
    sessionStorage.removeItem('kricefesta_admin_session');
    sessionStorage.removeItem('kricefesta_admin_user');
    setAdminUser(null);
    setIsAuthed(false);
    setView('dashboard');
  };

  // 관리자 목록 조회
  const fetchAdmins = async () => {
    try {
      const headers = {};
      const cachedUser = localStorage.getItem('kricefesta_admin_user') || sessionStorage.getItem('kricefesta_admin_user');
      if (cachedUser) {
        const parsed = JSON.parse(cachedUser);
        if (parsed && parsed.username) {
          headers["X-Admin-Username"] = parsed.username;
        }
      }
      const response = await fetch("http://localhost:18000/api/admin/admins", { headers });
      if (response.ok) {
        const data = await response.json();
        if (data.status === "success" && data.admins) {
          setAdmins(data.admins);
        }
      }
    } catch (e) {
      console.error("관리자 목록 조회 실패:", e);
    }
  };

  // 관리자 추가/수정 저장
  const handleSaveAdmin = async (e) => {
    e.preventDefault();
    if (!adminUsername.trim() || !adminName.trim()) {
      alert("아이디와 이름을 입력해 주세요.");
      return;
    }
    if (!editingAdmin && !adminPassword.trim()) {
      alert("비밀번호를 입력해 주세요.");
      return;
    }

    const groupIdsStr = adminIsAllGroups ? "*" : adminGroupIds.join(",");

    const payload = {
      username: adminUsername.trim(),
      password: adminPassword.trim() ? adminPassword.trim() : (editingAdmin ? "__KEEP_PASSWORD__" : ""),
      name: adminName.trim(),
      groupIds: groupIdsStr
    };

    const headers = {
      "Content-Type": "application/json"
    };
    const cachedUser = localStorage.getItem('kricefesta_admin_user') || sessionStorage.getItem('kricefesta_admin_user');
    if (cachedUser) {
      const parsed = JSON.parse(cachedUser);
      if (parsed && parsed.username) {
        headers["X-Admin-Username"] = parsed.username;
      }
    }

    try {
      let url = "http://localhost:18000/api/admin/admins";
      let method = "POST";

      if (editingAdmin) {
        url = `http://localhost:18000/api/admin/admins/${editingAdmin.id}`;
        method = "PUT";
      }

      const response = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(payload)
      });

      const resData = await response.json();
      if (response.ok && resData.status === "success") {
        showToast(editingAdmin ? "관리자 정보가 수정되었습니다." : "새 관리자가 추가되었습니다.");
        setShowAdminForm(false);
        setEditingAdmin(null);
        setAdminUsername("");
        setAdminPassword("");
        setAdminName("");
        setAdminGroupIds([]);
        setAdminIsAllGroups(true);
        fetchAdmins();
      } else {
        alert(resData.detail || "저장에 실패했습니다.");
      }
    } catch (err) {
      console.error("관리자 저장 실패:", err);
      alert("서버와 통신하는 중 오류가 발생했습니다.");
    }
  };

  // 관리자 삭제
  const handleDeleteAdmin = async (adminId) => {
    if (!window.confirm("정말로 이 관리자를 삭제하시겠습니까?")) return;

    const headers = {};
    const cachedUser = localStorage.getItem('kricefesta_admin_user') || sessionStorage.getItem('kricefesta_admin_user');
    if (cachedUser) {
      const parsed = JSON.parse(cachedUser);
      if (parsed && parsed.username) {
        headers["X-Admin-Username"] = parsed.username;
      }
    }

    try {
      const response = await fetch(`http://localhost:18000/api/admin/admins/${adminId}`, {
        method: "DELETE",
        headers
      });

      const resData = await response.json();
      if (response.ok && resData.status === "success") {
        showToast("관리자가 삭제되었습니다.");
        fetchAdmins();
      } else {
        alert(resData.detail || "삭제에 실패했습니다.");
      }
    } catch (err) {
      console.error("관리자 삭제 실패:", err);
      alert("서버와 통신하는 중 오류가 발생했습니다.");
    }
  };

  useEffect(() => {
    if (isAuthed && view === 'admin-management') {
      fetchAdmins();
    }
  }, [isAuthed, view]);

  // 새 품평회 대그룹 만들기
  const handleAddGroup = async () => {
    const name = "새 품평회 (제목 입력)";
    const defaultCode = "fair_" + Date.now().toString(36);

    try {
      const response = await fetch("http://localhost:18000/api/admin/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name,
          period: "",
          status: "준비중",
          code: defaultCode
        })
      });

      if (response.ok) {
        showToast('새 대그룹 품평회가 추가되었습니다.');
        fetchGroups(); // 백엔드에 쿼리하여 리스트 즉시 리로드
      } else {
        const errData = await response.json().catch(() => ({}));
        alert(errData.detail || "대그룹 생성에 실패하였습니다.");
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
  };

  // 부문 추가
  const handleAddBuman = () => {
    const newBumans = [...bumans, {
      id: nextUid(),
      prefix: '',
      group: '',
      cat: 'open',
      name: '',
      judgeIds: []
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
  };

  // 부문 드래그 앤 드롭 정렬 핸들러
  const handleDragStart = (e, index) => {
    setDraggedIdx(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === index) return;

    const newBumans = [...bumans];
    const draggedItem = newBumans[draggedIdx];
    newBumans.splice(draggedIdx, 1);
    newBumans.splice(index, 0, draggedItem);

    setBumans(newBumans);
    setDraggedIdx(index);
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
    saveState({ bumans });
  };

  const handleDrop = (e, index) => {
    e.preventDefault();
    setDraggedIdx(null);
    saveState({ bumans });
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
  };

  // 템플릿 추가
  const handleAddTemplate = (targetType, targetId = null) => {
    const exists = templates.some(t => t.target_type === targetType && t.target_id === targetId);
    if (exists) {
      showToast("이미 동일한 대상에 적용된 평가 구성이 존재합니다.");
      return;
    }

    const newId = nextUid();
    const newTemplate = {
      id: newId,
      target_type: targetType,
      target_id: targetId,
      groups: []
    };
    const nextTemplates = [...templates, newTemplate];
    setTemplates(nextTemplates);
    setActiveTemplateId(newId);
    saveState({ templates: nextTemplates });
  };

  // 템플릿 삭제
  const handleDeleteTemplate = (fetId) => {
    const target = templates.find(t => t.id === fetId);
    if (target && (target.target_type === 'open_all' || target.target_type === 'blind_all')) {
      showToast("공통 평가 구성은 삭제할 수 없습니다.");
      return;
    }

    const nextTemplates = templates.filter(t => t.id !== fetId);
    setTemplates(nextTemplates);
    if (activeTemplateId === fetId) {
      setActiveTemplateId(nextTemplates[0]?.id || null);
    }
    saveState({ templates: nextTemplates });
  };

  // 평가항목 그룹 추가
  const handleAddItemGroup = () => {
    if (!activeTemplateId) return;
    const nextTemplates = templates.map(t => {
      if (t.id !== activeTemplateId) return t;
      return {
        ...t,
        groups: [...t.groups, { id: nextUid(), name: '신규 평가 항목군', convertTo: '', items: [] }]
      };
    });
    setTemplates(nextTemplates);
    saveState({ templates: nextTemplates });
  };

  // 평가항목 그룹 삭제
  const handleDeleteItemGroup = (gid) => {
    if (!activeTemplateId) return;
    const nextTemplates = templates.map(t => {
      if (t.id !== activeTemplateId) return t;
      return {
        ...t,
        groups: t.groups.filter(g => g.id !== gid)
      };
    });
    setTemplates(nextTemplates);
    saveState({ templates: nextTemplates });
  };

  // 평가항목 그룹 내 단일 항목 추가
  const handleAddSingleItem = (gid) => {
    if (!activeTemplateId) return;
    const nextTemplates = templates.map(t => {
      if (t.id !== activeTemplateId) return t;
      return {
        ...t,
        groups: t.groups.map(g => {
          if (g.id !== gid) return g;
          return {
            ...g,
            items: [...g.items, { id: nextUid(), name: '', max: 10, scaleValues: '2, 4, 6, 8, 10' }]
          };
        })
      };
    });
    setTemplates(nextTemplates);
    saveState({ templates: nextTemplates });
  };

  // 평가항목 그룹 내 단일 항목 삭제
  const handleDeleteSingleItem = (gid, itid) => {
    if (!activeTemplateId) return;
    const nextTemplates = templates.map(t => {
      if (t.id !== activeTemplateId) return t;
      return {
        ...t,
        groups: t.groups.map(g => {
          if (g.id !== gid) return g;
          return {
            ...g,
            items: g.items.filter(it => it.id !== itid)
          };
        })
      };
    });
    setTemplates(nextTemplates);
    saveState({ templates: nextTemplates });
  };

  // 결과 확정 및 공표
  const handlePublish = () => {
    showToast('평가 결과 집계가 최종 확정 및 공표 완료되었습니다.');
  };

  // 변경사항 저장 토스트 노출
  const handleSaveAll = async () => {
    const makePeriodString = () => {
      if (!startDate || !endDate) return "";
      const sY = startDate.substring(0, 4);
      const sM = startDate.substring(5, 7);
      const sD = startDate.substring(8, 10);
      const eY = endDate.substring(0, 4);
      const eM = endDate.substring(5, 7);
      const eD = endDate.substring(8, 10);
      if (sY === eY) {
        return `${sY}.${sM}.${sD} – ${eM}.${eD}`;
      } else {
        return `${sY}.${sM}.${sD} – ${eY}.${eM}.${eD}`;
      }
    };

    const nextPeriod = makePeriodString();
    const currentProductCount = Object.values(products).reduce((acc, list) => acc + (list || []).length, 0);
    const nextGroups = groups.map(g => {
      if (g.id === activeGroup) {
        return {
          ...g,
          name: systemName,
          period: nextPeriod,
          bumanCount: bumans.length,
          judgeCount: judges.length,
          productCount: currentProductCount
        };
      }
      return g;
    });
    setGroups(nextGroups);

    saveState({ groups: nextGroups, systemName, systemCode, judges, bumans, products, templates });

    try {
      const headers = { "Content-Type": "application/json" };
      const cachedUser = localStorage.getItem('kricefesta_admin_user') || sessionStorage.getItem('kricefesta_admin_user');
      if (cachedUser) {
        const parsed = JSON.parse(cachedUser);
        if (parsed && parsed.username) {
          headers["X-Admin-Username"] = parsed.username;
        }
      }
      const sanitizedBumans = bumans.map(b => ({
        ...b,
        judgeIds: Array.isArray(b.judgeIds) ? b.judgeIds : (judges || []).map(j => j.id)
      }));

      const response = await fetch(`http://localhost:18000/api/admin/groups/${activeGroup}/save`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          systemName,
          systemCode,
          period: nextPeriod,
          status: groups.find(g => g.id === activeGroup)?.status || "준비중",
          judges,
          bumans: sanitizedBumans,
          products,
          templates
        })
      });


      if (response.ok) {
        setDbBackup({
          systemName,
          systemCode,
          startDate,
          endDate,
          judges,
          bumans,
          products,
          templates
        });
        showToast('모든 설정 변경 사항이 데이터베이스에 자동 반영 및 저장되었습니다.');
        fetchGroups();
      } else {
        alert("데이터베이스 저장에 실패하였습니다.");
      }
    } catch (e) {
      console.error("데이터베이스 저장 중 에러:", e);
      setDbBackup({
        systemName,
        systemCode,
        startDate,
        endDate,
        judges,
        bumans,
        products,
        templates
      });
      showToast('모든 설정 변경 사항이 로컬 스토리지에 동기화 저장되었습니다.');
    }
  };

  // 부문 및 부문별제품 엑셀 양식/데이터 다운로드 (등록된 데이터가 있으면 내보내기, 없으면 빈 양식)
  const handleDownloadExcelSample = () => {
    try {
      const hasBumans = bumans && bumans.length > 0;
      const evalHeaderKey = '평가방식(오픈 또는 블라인드 만 넣어주세요)';

      // 1. 부문등록 시트 데이터 구성
      let bumanData = [];
      if (hasBumans) {
        bumanData = bumans.map(b => ({
          '부문코드': b.prefix || '',
          [evalHeaderKey]: (b.cat === 'blind' || b.type === 'blind') ? '블라인드' : '오픈',
          '부문그룹': b.group || '',
          '부문명': b.name || ''
        }));
      } else {
        // 등록된 부문이 없으면 양식용 헤더 및 가이드 샘플 1행 제공
        bumanData = [
          { '부문코드': 'A', [evalHeaderKey]: '오픈', '부문그룹': '쌀가공식품', '부문명': '조리' }
        ];
      }

      // 2. 부문별제품 시트 데이터 구성
      let productData = [];
      if (hasBumans) {
        bumans.forEach(b => {
          const prefix = b.prefix;
          const prodList = products[prefix] || [];
          prodList.forEach(p => {
            productData.push({
              '부문코드': prefix,
              '제품 분류코드': p.code || '',
              '제품명': p.name || ''
            });
          });
        });
      } else {
        // 등록된 제품이 없으면 양식용 헤더 및 가이드 샘플 1행 제공
        productData = [
          { '부문코드': 'A', '제품 분류코드': 'A-1', '제품명': '미라클누룽지' }
        ];
      }

      const wb = XLSX.utils.book_new();
      const wsBuman = XLSX.utils.json_to_sheet(bumanData);
      const wsProduct = XLSX.utils.json_to_sheet(productData);

      wsBuman['!cols'] = [{ wch: 12 }, { wch: 42 }, { wch: 20 }, { wch: 20 }];
      wsProduct['!cols'] = [{ wch: 12 }, { wch: 18 }, { wch: 30 }];

      XLSX.utils.book_append_sheet(wb, wsBuman, "부문등록");
      XLSX.utils.book_append_sheet(wb, wsProduct, "부문별제품");

      const fileName = hasBumans
        ? `${systemName || '품평회'}_부문_제품_등록데이터.xlsx`
        : "품평회_부문_제품_등록양식.xlsx";

      XLSX.writeFile(wb, fileName);
      showToast(hasBumans ? '현재 등록된 부문/제품 데이터가 엑셀로 다운로드되었습니다.' : '엑셀 양식 샘플 파일이 다운로드되었습니다.');
    } catch (e) {
      console.error('엑셀 다운로드 오류:', e);
      alert('엑셀 다운로드 중 오류가 발생했습니다.');
    }
  };

  // 엑셀 파일 선택 및 파싱 로직 (유효성 검사 강화)
  const handleExcelFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExcelFileName(file.name);
    setExcelErrorMsg('');
    setExcelParsedData(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        let parsedBumans = [];
        let parsedProducts = {};
        let validationErrors = [];

        // 1. 부문등록 시트 파싱 및 유효성 검사
        const bumanSheetName = workbook.SheetNames.find(n => n.includes('부문')) || workbook.SheetNames[0];
        if (bumanSheetName) {
          const wsBuman = workbook.Sheets[bumanSheetName];
          const rawBumanRows = XLSX.utils.sheet_to_json(wsBuman);

          rawBumanRows.forEach((row, idx) => {
            const rowNum = idx + 2;
            const prefix = String(row['부문코드'] || row['코드'] || row['prefix'] || '').trim();
            
            // '평가방식'으로 시작하는 헤더 키 자동 탐색 (설명문구 포함 헤더 완벽 호환)
            const evalKey = Object.keys(row).find(k => k.startsWith('평가방식')) || '평가방식';
            const rawType = String(row[evalKey] || row['타입'] || row['type'] || '').trim();
            
            const group = String(row['부문그룹'] || row['그룹'] || row['group'] || '').trim();
            const name = String(row['부문명'] || row['이름'] || row['name'] || '').trim();

            if (!prefix && !name) return; // 빈 행 무시

            // 검증 1: 부문코드 필수
            if (!prefix) {
              validationErrors.push(`[부문등록 시트 ${rowNum}행] 부문코드가 누락되었습니다.`);
              return;
            }

            // 검증 2: 평가방식 유효성 (오픈 / 블라인드 / open / blind)
            let type = 'open';
            const normType = rawType.toLowerCase();
            if (normType === '블라인드' || normType === 'blind') {
              type = 'blind';
            } else if (normType === '오픈' || normType === 'open' || normType === '') {
              type = 'open';
            } else {
              validationErrors.push(`[부문등록 시트 ${rowNum}행] '${prefix}' 부문의 평가방식('${rawType}')이 올바르지 않습니다. ('오픈' 또는 '블라인드'만 입력 가능)`);
            }

            parsedBumans.push({
              id: idx + 1001,
              prefix,
              cat: type,
              type,
              group,
              name: name || prefix,
              judgeIds: []
            });

          });
        }

        // 2. 부문별제품 시트 파싱 및 유효성 검사
        const productSheetName = workbook.SheetNames.find(n => n.includes('제품') || n.includes('품목')) || workbook.SheetNames[1];
        if (productSheetName) {
          const wsProduct = workbook.Sheets[productSheetName];
          const rawProductRows = XLSX.utils.sheet_to_json(wsProduct);
          const validPrefixes = new Set(parsedBumans.map(b => b.prefix));

          rawProductRows.forEach((row, idx) => {
            const rowNum = idx + 2;
            const prefix = String(row['부문코드'] || row['부문'] || row['prefix'] || '').trim();
            const code = String(row['제품 분류코드'] || row['제품코드'] || row['분류코드'] || row['code'] || '').trim();
            const name = String(row['제품명'] || row['이름'] || row['name'] || '').trim();

            if (!prefix && !code && !name) return; // 빈 행 무시

            if (!prefix) {
              validationErrors.push(`[부문별제품 시트 ${rowNum}행] 제품 '${code || name}'의 부문코드가 누락되었습니다.`);
              return;
            }

            // 검증 3: 제품의 부문코드가 부문목록에 존재해야 함
            if (validPrefixes.size > 0 && !validPrefixes.has(prefix)) {
              validationErrors.push(`[부문별제품 시트 ${rowNum}행] 제품 '${code || name}'의 부문코드('${prefix}')는 '부문등록' 시트에 존재하지 않는 부문코드입니다.`);
            }

            if (!parsedProducts[prefix]) {
              parsedProducts[prefix] = [];
            }
            parsedProducts[prefix].push({
              id: idx + 2001,
              code: code || `${prefix}-${parsedProducts[prefix].length + 1}`,
              name
            });
          });
        }

        // 검증 에러 발생 시 처리 (일괄 반영 버튼 비활성화)
        if (validationErrors.length > 0) {
          setExcelErrorMsg("❌ 엑셀 검증 오류:\n" + validationErrors.join("\n"));
          return;
        }

        if (parsedBumans.length === 0 && Object.keys(parsedProducts).length === 0) {
          setExcelErrorMsg('엑셀 파일에서 유효한 부문 및 제품 데이터를 찾을 수 없습니다. 서식을 확인해 주세요.');
          return;
        }

        const totalProductCount = Object.values(parsedProducts).reduce((acc, list) => acc + (list || []).length, 0);

        setExcelParsedData({
          bumans: parsedBumans,
          products: parsedProducts,
          bumanCount: parsedBumans.length,
          productCount: totalProductCount
        });
      } catch (err) {
        console.error('엑셀 파싱 에러:', err);
        setExcelErrorMsg('엑셀 파싱 중 오류가 발생했습니다. 올바른 .xlsx 파일인지 확인해 주세요.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // 엑셀 파싱 결과 화면 State 일괄 적용
  const handleApplyExcelData = () => {
    if (!excelParsedData) return;

    const bumanWithEmptyJudges = excelParsedData.bumans.map(b => ({
      ...b,
      judgeIds: []
    }));

    setBumans(bumanWithEmptyJudges);
    setProducts(excelParsedData.products);


    if (excelParsedData.bumans.length > 0) {
      setProductBuman(excelParsedData.bumans[0].prefix);
    }

    setShowExcelUploadModal(false);
    setExcelParsedData(null);
    setExcelFileName('');
    setExcelErrorMsg('');
    showToast('엑셀 데이터가 화면 목록에 일괄 반영되었습니다. [변경사항 저장] 버튼을 누르면 DB에 저장됩니다.');
  };

  // 이탈 가드: 변경 사항 감지 및 컨펌/복원 수행
  const confirmLeave = async () => {
    const hasUnsavedChanges = () => {
      const current = JSON.stringify({ systemName, systemCode, startDate, endDate, judges, bumans, products, templates });
      const backup = JSON.stringify(dbBackup);
      return current !== backup;
    };

    if (hasUnsavedChanges()) {
      const answer = window.confirm("저장하지 않은 변경사항이 있습니다. 이동하기 전에 저장하시겠습니까?\n\n[확인]을 누르면 저장 후 이동하며, [취소]를 누르면 변경을 취소하고 원래 상태로 복원한 뒤 이동합니다.");
      if (answer) {
        await handleSaveAll();
        return true;
      } else {
        setSystemName(dbBackup.systemName);
        setSystemCode(dbBackup.systemCode);
        setStartDate(dbBackup.startDate);
        setEndDate(dbBackup.endDate);
        setJudges(dbBackup.judges);
        setBumans(dbBackup.bumans);
        setProducts(dbBackup.products);
        setTemplates(dbBackup.templates);
        if (dbBackup.templates && dbBackup.templates.length > 0) {
          setActiveTemplateId(dbBackup.templates[0].id);
        }

        saveState({
          groups,
          systemName: dbBackup.systemName,
          systemCode: dbBackup.systemCode,
          judges: dbBackup.judges,
          bumans: dbBackup.bumans,
          products: dbBackup.products,
          templates: dbBackup.templates
        });
        return true;
      }
    }
    return true;
  };

  // 통계 계산
  const counts = {
    judges: judges.length,
    bumans: bumans.length,
    products: Object.values(products).reduce((acc, list) => acc + list.length, 0),
    items: templates.reduce((acc, t) => acc + (t.groups || []).reduce((sum, g) => sum + (g.items || []).length, 0), 0),
    devices: devices.filter(d => d.status === 'approved').length
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
            {(!adminUser || adminUser.isMaster || adminUser.groupIds === '*') && (
              <button
                onClick={() => setView('admin-management')}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: '#fff',
                  borderRadius: '11px',
                  height: '50px',
                  padding: '0 20px',
                  fontSize: '15px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                ⚙️ 관리자 관리
              </button>
            )}
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
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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

              const isCurrentActive = group.id === activeGroup;
              const bumanCount = isCurrentActive && bumans.length > 0 ? counts.bumans : (group.bumanCount !== undefined ? group.bumanCount : 0);
              const judgeCount = isCurrentActive && judges.length > 0 ? counts.judges : (group.judgeCount !== undefined ? group.judgeCount : 0);
              const productCount = isCurrentActive && Object.keys(products).length > 0 ? counts.products : (group.productCount !== undefined ? group.productCount : 0);

              return (
                <div
                  key={group.id}
                  onClick={() => {
                    setActiveGroup(group.id);
                    setSystemName(group.name);
                    setJudges([]);
                    setBumans([]);
                    setProducts({});
                    setTemplates([]);
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
                      {group.name}
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
                      <div style={{ fontSize: '11px', color: '#9aa6bb', fontWeight: 600 }}>평가자</div>
                      <div style={{ marginTop: '2px', fontSize: '20px', fontWeight: 800, color: '#3a475c' }}>{judgeCount}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#9aa6bb', fontWeight: 600 }}>부문</div>
                      <div style={{ marginTop: '2px', fontSize: '20px', fontWeight: 800, color: '#3a475c' }}>{bumanCount}</div>
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

  // 2-2) 관리자 계정 관리 화면 렌더링 (`view === 'admin-management'`)
  if (view === 'admin-management') {
    return (
      <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#eef1f6', color: '#2b3646', display: 'flex', flexDirection: 'column' }}>
        {/* 상단 띠 배너 헤더 */}
        <div style={{ background: 'linear-gradient(135deg,#1b2a4a,#243a63)', color: '#fff', padding: '30px 40px', display: 'flex', alignItems: 'center', gap: '20px', flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '12px', letterSpacing: '2px', color: '#d9b866', fontWeight: 700 }}>
              ADMIN CONSOLE · ADMIN MANAGEMENT
            </div>
            <div style={{ marginTop: '8px', fontSize: '26px', fontWeight: 800 }}>
              관리자 계정 관리
            </div>
            <div style={{ marginTop: '5px', fontSize: '14px', color: '#9db0d4' }}>
              서브 관리자 계정을 생성하고 대시보드(대그룹) 관리 권한 범위를 구성합니다.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => {
                setEditingAdmin(null);
                setAdminUsername('');
                setAdminPassword('');
                setAdminName('');
                setAdminGroupIds([]);
                setAdminIsAllGroups(true);
                setShowAdminForm(true);
              }}
              style={{ background: '#e03b3b', border: 'none', color: '#fff', borderRadius: '11px', height: '50px', padding: '0 24px', fontSize: '15px', fontWeight: 800, cursor: 'pointer' }}
            >
              + 새 관리자 추가
            </button>
            <button
              onClick={() => setView('dashboard')}
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#fff',
                borderRadius: '11px',
                height: '50px',
                padding: '0 20px',
                fontSize: '15px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              ↩ 대시보드로 돌아가기
            </button>
          </div>
        </div>

        {/* 메인 테이블 배치 */}
        <div style={{ flex: 1, overflow: 'auto', padding: '28px 40px 60px' }}>
          <div style={{ fontSize: '15px', fontWeight: 800, color: '#1b2a4a', marginBottom: '14px' }}>
            등록된 관리자 목록
          </div>

          <div className="bg-white border border-[#e5e9f0] rounded-[14px] overflow-hidden max-w-[1200px] shadow-sm">
            <div className="grid grid-cols-[56px_1.5fr_1.5fr_1.2fr_2.5fr_1.5fr_120px] bg-[#f4f6fa] border-b border-[#e5e9f0] text-[12px] font-extrabold text-[#5a6a82]">
              <div className="p-3 text-center">No.</div>
              <div className="p-3">관리자 ID</div>
              <div className="p-3">이름</div>
              <div className="p-3">비밀번호</div>
              <div className="p-3">관리 권한 (대그룹)</div>
              <div className="p-3">생성일</div>
              <div className="p-3 text-center">관리</div>
            </div>

            {admins.length === 0 ? (
              <div className="p-8 text-center text-[13px] text-[#8b97ab]">등록된 서브 관리자가 없습니다.</div>
            ) : admins.map((admin, idx) => {
              // 권한 파싱 및 이름 매핑
              let scopeText = "";
              if (admin.groupIds === "*") {
                scopeText = "전체 대시보드 관리";
              } else {
                const ids = admin.groupIds.split(",").map(id => parseInt(id.trim(), 10));
                const names = ids.map(id => groups.find(g => g.id === id)?.name || `대그룹 #${id}`);
                scopeText = names.join(", ");
              }

              return (
                <div key={admin.id} className="grid grid-cols-[56px_1.5fr_1.5fr_1.2fr_2.5fr_1.5fr_120px] border-b border-[#eef1f6] items-center last:border-b-0 text-[14px]">
                  <div className="p-3 text-center font-bold text-[#8b97ab]">{idx + 1}</div>
                  <div className="p-3 font-semibold text-[#1b2a4a]">{admin.username}</div>
                  <div className="p-3 font-semibold text-[#1b2a4a]">{admin.name}</div>
                  <div className="p-3 text-[#5a6a82] font-mono">••••••••</div>
                  <div className="p-3 text-[#5a6a82] font-medium truncate" title={scopeText}>{scopeText}</div>
                  <div className="p-3 text-[13px] text-[#8b97ab]">{formatKstDate(admin.createdAt)}</div>
                  <div className="p-3 text-center flex items-center justify-center gap-1.5">
                    <button
                      onClick={() => {
                        setEditingAdmin(admin);
                        setAdminUsername(admin.username);
                        setAdminPassword('');
                        setAdminName(admin.name);
                        if (admin.groupIds === "*") {
                          setAdminIsAllGroups(true);
                          setAdminGroupIds([]);
                        } else {
                          setAdminIsAllGroups(false);
                          setAdminGroupIds(admin.groupIds.split(",").map(x => parseInt(x.trim(), 10)).filter(Boolean));
                        }
                        setShowAdminForm(true);
                      }}
                      className="h-[30px] px-2.5 border border-[#dde3ec] bg-white hover:bg-gray-50 text-[#1b2a4a] rounded-lg text-[12px] font-bold cursor-pointer transition-all"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => handleDeleteAdmin(admin.id)}
                      className="h-[30px] px-2.5 border border-red-100 bg-white hover:bg-red-50 text-[#c0392b] rounded-lg text-[12px] font-bold cursor-pointer transition-all"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 관리자 등록/수정 모달 다이얼로그 */}
        {showAdminForm && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-[520px] max-w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
              {/* 모달 헤더 */}
              <div className="p-6 border-b border-[#eef1f6] flex items-center justify-between bg-gradient-to-r from-[#1b2a4a] to-[#243a63] text-white">
                <h3 className="text-[17px] font-extrabold">
                  {editingAdmin ? "관리자 계정 정보 수정" : "새 관리자 계정 추가"}
                </h3>
                <button
                  onClick={() => setShowAdminForm(false)}
                  className="text-white/60 hover:text-white text-[20px] font-bold cursor-pointer"
                >
                  &times;
                </button>
              </div>

              {/* 모달 본문 */}
              <form onSubmit={handleSaveAdmin} className="p-6 overflow-y-auto flex-1 space-y-4">
                <div>
                  <label className="block text-[11px] font-extrabold text-[#5a6a82] mb-1.5">
                    관리자 로그인 ID
                  </label>
                  <input
                    type="text"
                    required
                    readOnly={!!editingAdmin}
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    placeholder="예: krice_sub1"
                    className={`w-full h-[44px] border border-[#dde3ec] rounded-xl px-3.5 text-[14px] focus:outline-none focus:border-[#1b2a4a] transition-all ${
                      editingAdmin ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-white"
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold text-[#5a6a82] mb-1.5">
                    로그인 비밀번호 {editingAdmin && <span className="text-gray-400 font-normal">(변경 시에만 입력)</span>}
                  </label>
                  <input
                    type="text"
                    required={!editingAdmin}
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder={editingAdmin ? "기존 비밀번호 유지하려면 비워둠" : "접속 비밀번호 입력"}
                    className="w-full h-[44px] border border-[#dde3ec] rounded-xl px-3.5 text-[14px] font-mono focus:outline-none focus:border-[#1b2a4a] transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold text-[#5a6a82] mb-1.5">
                    관리자 이름
                  </label>
                  <input
                    type="text"
                    required
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    placeholder="예: 홍길동 평가담당"
                    className="w-full h-[44px] border border-[#dde3ec] rounded-xl px-3.5 text-[14px] focus:outline-none focus:border-[#1b2a4a] transition-all"
                  />
                </div>

                {/* 대시보드 권한 지정 */}
                <div>
                  <label className="block text-[11px] font-extrabold text-[#5a6a82] mb-2">
                    관리 대시보드 (대그룹) 설정
                  </label>
                  
                  <div className="bg-[#f4f6fa] rounded-xl p-4 border border-[#e5e9f0]">
                    <label className="flex items-center gap-2 font-extrabold text-[#1b2a4a] text-[13px] cursor-pointer mb-2.5 pb-2 border-b border-gray-200">
                      <input
                        type="checkbox"
                        checked={adminIsAllGroups}
                        onChange={(e) => setAdminIsAllGroups(e.target.checked)}
                        className="w-4.5 h-4.5 cursor-pointer"
                      />
                      전체 대시보드 관리 권한 부여
                    </label>

                    {!adminIsAllGroups && (
                      <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
                        {groups.length === 0 ? (
                          <div className="text-[11px] text-[#8b97ab]">개설된 대그룹 품평회가 없습니다.</div>
                        ) : groups.map(g => (
                          <label key={g.id} className="flex items-center gap-2 text-[13px] text-[#2b3646] font-medium cursor-pointer">
                            <input
                              type="checkbox"
                              checked={adminGroupIds.includes(g.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setAdminGroupIds([...adminGroupIds, g.id]);
                                } else {
                                  setAdminGroupIds(adminGroupIds.filter(id => id !== g.id));
                                }
                              }}
                              className="w-4 h-4 cursor-pointer"
                            />
                            {g.name}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* 푸터 버튼 */}
                <div className="pt-4 border-t border-[#eef1f6] flex items-center justify-end gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowAdminForm(false)}
                    className="h-[44px] px-5 border border-[#dde3ec] text-[#5a6a82] hover:bg-gray-50 rounded-xl text-[14px] font-bold cursor-pointer transition-all"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    className="h-[44px] px-6 bg-[#e03b3b] hover:bg-[#c0392b] text-white rounded-xl text-[14px] font-extrabold cursor-pointer transition-all shadow-md"
                  >
                    저장하기
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
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
            onClick={async () => {
              const proceed = await confirmLeave();
              if (proceed) {
                setView('dashboard');
              }
            }}
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
            const cnt = n.key === 'judges' ? counts.judges : n.key === 'bumans' ? counts.bumans : n.key === 'products' ? counts.products : n.key === 'items' ? counts.items : n.key === 'devices' ? counts.devices : '';

            return (
              <button
                key={n.key}
                onClick={async () => {
                  const proceed = await confirmLeave();
                  if (proceed) {
                    setSection(n.key);
                  }
                }}
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
                  대회 전용 주소 식별 키 (groupName)
                </div>
                <div className="mt-1.5 text-[13px] text-[#8b97ab] leading-none">
                  인터넷 주소창(URL) 뒤에 붙을 영문 식별 주소명입니다. (중복 방지를 위해 영문/숫자만 권장)
                </div>
                <input
                  type="text"
                  value={systemCode}
                  onChange={(e) => setSystemCode(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                  className="mt-4 w-full h-[52px] border-[1.5px] border-[#cbd3e1] rounded-[11px] px-[18px] text-[17px] font-bold text-[#1b2a4a] bg-white focus:outline-none focus:border-primary transition-all"
                  placeholder="예: krice2026"
                />

                {/* 입력창 바로 아래에 주소와 주소 복사버튼 통합 배치 */}
                <div className="mt-4 flex items-center gap-2">
                  <span className="text-[13px] font-bold text-[#5a6a82] shrink-0 bg-[#eaf1f9] border border-[#cbd3e1] rounded-[8px] px-2.5 py-1.5">
                    접속 주소
                  </span>
                  <input
                    type="text"
                    readOnly
                    value={(() => {
                      const proto = window.location.protocol;
                      const host = window.location.hostname;
                      if (host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.') || host.startsWith('10.')) {
                        return `${proto}//${host}:18002/${systemCode}`;
                      }
                      const domain = host.startsWith('admin.') ? host.substring(6) : host;
                      return `${proto}//${domain}/${systemCode}`;
                    })()}
                    className="flex-grow h-[46px] border-[1.5px] border-[#cbd3e1] rounded-[10px] px-[14px] text-[14px] font-semibold text-[#5a6a82] bg-[#f8fafc] focus:outline-none"
                    onClick={(e) => e.target.select()}
                  />
                  <button
                    onClick={() => {
                      const proto = window.location.protocol;
                      const host = window.location.hostname;
                      let url = "";
                      if (host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.') || host.startsWith('10.')) {
                        url = `${proto}//${host}:18002/${systemCode}`;
                      } else {
                        const domain = host.startsWith('admin.') ? host.substring(6) : host;
                        url = `${proto}//${domain}/${systemCode}`;
                      }
                      navigator.clipboard.writeText(url)
                        .then(() => alert('심사 URL이 클립보드에 복사되었습니다.'))
                        .catch(() => alert('URL 복사에 실패했습니다. 주소를 직접 드래그해서 복사해 주세요.'));
                    }}
                    className="h-[46px] px-5 rounded-[10px] bg-[#1b2a4a] text-white text-[13px] font-extrabold hover:bg-secondary cursor-pointer transition-all shrink-0"
                  >
                    주소 복사
                  </button>
                </div>

                <div className="mt-[30px] text-[16px] font-extrabold text-[#1b2a4a] leading-none">
                  대회 개최 기간 설정
                </div>
                <div className="mt-1.5 text-[13px] text-[#8b97ab] leading-none">
                  품평회가 실시되는 공식 시작일과 종료일 기간을 설정합니다.
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <div className="flex-1">
                    <span className="text-[12px] font-bold text-[#5a6a82] block mb-1.5">시작일</span>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full h-[50px] border-[1.5px] border-[#cbd3e1] rounded-[11px] px-[14px] text-[15px] font-bold text-[#1b2a4a] bg-white focus:outline-none focus:border-primary transition-all"
                    />
                  </div>
                  <span className="text-[#8b97ab] font-extrabold text-[16px] mt-6">~</span>
                  <div className="flex-1">
                    <span className="text-[12px] font-bold text-[#5a6a82] block mb-1.5">종료일</span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full h-[50px] border-[1.5px] border-[#cbd3e1] rounded-[11px] px-[14px] text-[15px] font-bold text-[#1b2a4a] bg-white focus:outline-none focus:border-primary transition-all"
                    />
                  </div>
                </div>

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
              <div className="flex items-center justify-between max-w-[980px]">
                <div className="text-[14px] text-[#8b97ab] font-bold">
                  부문 목록 설정 및 카테고리 관리
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownloadExcelSample}
                    className="flex items-center gap-1.5 h-[38px] px-3.5 bg-[#107c41] text-white rounded-lg text-[13px] font-bold cursor-pointer hover:bg-[#0b6433] transition-all shadow-sm"
                    title="엑셀 일괄 등록용 양식/데이터 다운로드"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    엑셀 다운로드
                  </button>
                  <button
                    disabled={hasEvaluations}
                    onClick={() => {
                      if (hasEvaluations) {
                        alert('이미 심사위원 평가 점수가 입력된 품평회는 부문 및 제품을 엑셀로 변경할 수 없습니다.');
                        return;
                      }
                      setShowExcelUploadModal(true);
                    }}
                    className={`flex items-center gap-1.5 h-[38px] px-3.5 rounded-lg text-[13px] font-bold transition-all shadow-sm ${
                      hasEvaluations
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-60'
                        : 'bg-[#1b2a4a] text-white cursor-pointer hover:bg-[#2c3e66]'
                    }`}
                    title={hasEvaluations ? "평가 점수가 입력된 대회는 엑셀 변경이 제한됩니다" : "엑셀 파일 일괄 등록"}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    엑셀 파일 업로드
                  </button>
                </div>
              </div>

              <div className="bg-white border border-[#e5e9f0] rounded-[14px] max-w-[980px] shadow-sm relative z-10">
                <div className="grid grid-cols-[56px_85px_105px_1fr_1.2fr_105px_140px_70px] bg-[#f4f6fa] border-b border-[#e5e9f0] text-[12px] font-extrabold text-[#5a6a82] rounded-t-[14px]">
                  <div className="p-3 text-center">No.</div>
                  <div className="p-3">코드</div>
                  <div className="p-3">평가 방식</div>
                  <div className="p-3">부문그룹</div>
                  <div className="p-3">부문명</div>
                  <div className="p-3">제품 수</div>
                  <div className="p-3 text-center">평가자 설정</div>
                  <div className="p-3 text-center">삭제</div>
                </div>

                {bumans.map((b, idx) => {
                  const prodLen = (products[b.prefix] || []).length;
                  const badgeStyle = (b.cat === 'blind' || b.type === 'blind')
                    ? "bg-[#eef4fb] text-[#2f5488] border border-[#c6d6ee]"
                    : "bg-[#f2f7ec] text-[#5a7a3f] border border-[#cfe0cf]";

                  const assignedJids = Array.isArray(b.judgeIds) ? b.judgeIds : judges.map(j => j.id);
                  const isAll = judges.length > 0 && assignedJids.length === judges.length;
                  const badgeText = assignedJids.length === 0 ? "0명 지정" : isAll ? `전체 (${assignedJids.length}명)` : `${assignedJids.length}명 지정`;
                  const judgeBtnStyle = assignedJids.length === 0
                    ? "bg-[#fefce8] text-[#854d0e] border-[#fef08a] hover:bg-[#fef9c3]"
                    : isAll
                      ? "bg-[#eef4fb] text-[#2f5488] border-[#c6d6ee] hover:bg-[#deebf9]"
                      : "bg-[#fefce8] text-[#854d0e] border-[#fef08a] hover:bg-[#fef9c3]";
                  const assignedJudgesList = judges.filter(j => assignedJids.includes(j.id));
                  const assignedNamesStr = assignedJudgesList.length > 0
                    ? assignedJudgesList.map(j => j.name).join(', ')
                    : '지정된 심사위원이 없습니다.';

                  return (
                    <div
                      key={b.id}
                      draggable="true"
                      onDragStart={(e) => handleDragStart(e, idx)}
                      onDragOver={(e) => handleDragOver(e, idx)}
                      onDragEnd={handleDragEnd}
                      onDrop={(e) => handleDrop(e, idx)}
                      className={`grid grid-cols-[56px_85px_105px_1fr_1.2fr_105px_140px_70px] border-b border-[#eef1f6] align-center items-center last:border-b-0 transition-all select-none ${draggedIdx === idx ? 'opacity-40 bg-[#f4f6fa]/70 border-dashed border-primary/20' : 'bg-white'
                        }`}
                    >
                      <div className="p-3 text-center font-bold text-[#8b97ab] cursor-grab active:cursor-grabbing flex items-center justify-center gap-1.5" title="드래그하여 순서 변경">
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-gray-400">
                          <path d="M2.5 12h11v-1.5h-11V12zm0-3.25h11v-1.5h-11v1.5zm0-4.75v1.5h11v-1.5h-11z" fill="currentColor" />
                        </svg>
                        <span>{idx + 1}</span>
                      </div>
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
                          value={b.cat || b.type || 'open'}
                          onChange={(e) => {
                            const next = bumans.map(x => x.id === b.id ? { ...x, cat: e.target.value, type: e.target.value } : x);
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
                          value={b.group || ''}
                          onChange={(e) => {
                            const next = bumans.map(x => x.id === b.id ? { ...x, group: e.target.value } : x);
                            setBumans(next);
                          }}
                          placeholder="예) 쌀가공식품"
                          className="w-full h-10 border border-[#dde3ec] rounded-lg px-3 text-[14px] font-semibold text-primary"
                        />
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
                        <span className={`inline-block py-[6px] px-[12px] rounded-[8px] text-[13px] font-bold border transition-all ${badgeStyle}`}>
                          {prodLen}개 제품
                        </span>
                      </div>
                      <div className="p-1.5 text-center relative group">
                        <button
                          type="button"
                          onClick={() => setSelectedBumanForJudge(b)}
                          className={`inline-flex items-center justify-center gap-1.5 py-[6px] px-[10px] rounded-[8px] text-[12px] font-extrabold border transition-all cursor-pointer shadow-2xs ${judgeBtnStyle}`}
                        >
                          <span>👤</span>
                          <span>{badgeText}</span>
                        </button>

                        {/* 마우스 오버 시 버튼 아래쪽에 나타나는 툴팁 팝업 */}
                        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 hidden group-hover:flex flex-col items-center z-[120] pointer-events-none animate-in fade-in zoom-in-95 duration-150">
                          <div className="w-0 h-0 border-x-[6px] border-x-transparent border-b-[6px] border-b-[#1b2a4a] -mb-[1px] z-[121]"></div>
                          <div className="bg-[#1b2a4a] text-white text-[12px] font-bold py-2 px-3.5 rounded-xl shadow-xl border border-slate-700 whitespace-nowrap flex flex-col items-center gap-1">
                            <div className="text-[11px] text-yellow-400 font-extrabold">
                              [{b.prefix}] {b.name || '부문'} 담당 평가자 ({assignedJudgesList.length}명)
                            </div>
                            <div className="text-[12px] text-slate-100 font-semibold">
                              {assignedNamesStr}
                            </div>
                          </div>
                        </div>
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
                  );
                })}


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
                ※ 오픈은 관능평가+상품성평가 항목세트, 블라인드는 관능평가 항목세트가 적용됩니다. 항목 구성은 '평가항목 설정'에서 관리합니다.
              </div>
            </div>
          )}

          {/* 4) 부문별 제품 (products) */}
          {section === 'products' && (() => {
            const activeBumanObject = bumans.find(b => b.prefix === productBuman);
            const isBlind = activeBumanObject?.cat === 'blind' || activeBumanObject?.type === 'blind';

            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between max-w-[760px]">
                  <div className="text-[14px] text-[#8b97ab] font-bold">
                    부문별 품목 및 분류코드 설정
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleDownloadExcelSample}
                      className="flex items-center gap-1.5 h-[38px] px-3.5 bg-[#107c41] text-white rounded-lg text-[13px] font-bold cursor-pointer hover:bg-[#0b6433] transition-all shadow-sm"
                      title="엑셀 일괄 등록용 양식/데이터 다운로드"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      엑셀 다운로드
                    </button>
                    <button
                      disabled={hasEvaluations}
                      onClick={() => {
                        if (hasEvaluations) {
                          alert('이미 심사위원 평가 점수가 입력된 품평회는 부문 및 제품을 엑셀로 변경할 수 없습니다.');
                          return;
                        }
                        setShowExcelUploadModal(true);
                      }}
                      className={`flex items-center gap-1.5 h-[38px] px-3.5 rounded-lg text-[13px] font-bold transition-all shadow-sm ${
                        hasEvaluations
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-60'
                          : 'bg-[#1b2a4a] text-white cursor-pointer hover:bg-[#2c3e66]'
                      }`}
                      title={hasEvaluations ? "평가 점수가 입력된 대회는 엑셀 변경이 제한됩니다" : "엑셀 파일 일괄 등록"}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      엑셀 파일 업로드
                    </button>
                  </div>
                </div>

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
                    <div className="p-3">
                      제품명 {isBlind ? <span className="text-brandBlue font-bold">(평가앱에서는 비공개됩니다.)</span> : ''}
                    </div>
                    <div className="p-3 text-center">삭제</div>
                  </div>

                  {(products[productBuman] || []).map((p, idx) => {
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
                            value={p.name || ''}
                            onChange={(e) => {
                              const next = (products[productBuman] || []).map(x => x.id === p.id ? { ...x, name: e.target.value } : x);
                              setProducts({ ...products, [productBuman]: next });
                            }}
                            placeholder="제품명 입력"
                            className="w-full h-10 border border-[#dde3ec] bg-white font-semibold text-primary rounded-lg px-3 text-[14px]"
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
            );
          })()}

          {/* 5) 평가항목 설정 (items) */}
          {section === 'items' && (() => {
            const activeTemplate = templates.find(t => t.id === activeTemplateId) || templates[0];

            let activeTitle = "";
            if (activeTemplate) {
              if (activeTemplate.target_type === 'open_all') {
                activeTitle = "오픈 테스트 공통 설정";
              } else if (activeTemplate.target_type === 'blind_all') {
                activeTitle = "블라인드 테스트 공통 설정";
              } else {
                const bm = bumans.find(b => b.prefix === activeTemplate.target_id);
                activeTitle = `[${activeTemplate.target_id}] ${bm ? bm.name : ''} 부문 개별 설정`;
              }
            }

            return (
              <div className="grid grid-cols-[280px_1fr] gap-6 items-start max-w-[1300px]">
                {/* 좌측 패널: 평가 구성 대상 목록 */}
                <div className="bg-white border border-[#e5e9f0] rounded-[14px] p-4 shadow-sm space-y-4">
                  <div className="text-[13px] font-bold text-primary tracking-wide border-b border-[#eef1f6] pb-2 uppercase">
                    평가 구성 목록 (타깃)
                  </div>

                  <div className="space-y-2.5 max-h-[460px] overflow-auto pr-1">
                    {templates.map((t, idx) => {
                      const isActive = activeTemplate && t.id === activeTemplate.id;
                      let titleText = "";
                      let subText = "";
                      if (t.target_type === 'open_all') {
                        titleText = "오픈 테스트 공통";
                        subText = "기본 오픈 부문 적용";
                      } else if (t.target_type === 'blind_all') {
                        titleText = "블라인드 테스트 공통";
                        subText = "기본 블라인드 부문 적용";
                      } else {
                        const bm = bumans.find(b => b.prefix === t.target_id);
                        titleText = `[${t.target_id}] ${bm ? bm.name : ''} 전용`;
                        subText = "기본 공통보다 우선합니다.";
                      }

                      return (
                        <div
                          key={t.id || idx}
                          onClick={() => setActiveTemplateId(t.id)}
                          className={`relative p-3.5 rounded-xl border cursor-pointer transition-all select-none ${isActive
                            ? 'border-primary bg-primary/5 text-primary font-bold shadow-sm'
                            : 'border-[#dde3ec] bg-white text-[#5a6a82] hover:border-gray-300'
                            }`}
                        >
                          <div className="text-[14px]">{titleText}</div>
                          <div className="text-[11px] text-[#8b97ab] mt-1 font-semibold">{subText}</div>

                          {/* 개별 설정 카드 삭제 버튼 */}
                          {t.target_type !== 'open_all' && t.target_type !== 'blind_all' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteTemplate(t.id);
                              }}
                              className="absolute top-2.5 right-2.5 text-gray-400 hover:text-red-600 text-[18px] font-extrabold cursor-pointer transition-all leading-none"
                              title="설정 제거"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* 평가 구성 추가 버튼 폼 */}
                  <div className="border-t border-[#eef1f6] pt-3">
                    {showAddTemplateForm ? (
                      <div className="p-3 bg-[#f8fafc] border border-[#e5e9f0] rounded-xl space-y-3">
                        <div>
                          <label className="text-[11px] font-extrabold text-[#8b97ab] block mb-1">적용 대상 타입</label>
                          <select
                            value={newTemplateTargetType}
                            onChange={(e) => {
                              const val = e.target.value;
                              setNewTemplateTargetType(val);
                              if (val === 'specific_buman') {
                                const availBumans = bumans.filter(b => b.prefix);
                                setNewTemplateTargetId(availBumans[0] ? availBumans[0].prefix : '');
                              } else {
                                setNewTemplateTargetId('');
                              }
                            }}
                            className="w-full h-9 border border-[#dde3ec] rounded-lg px-2 text-[13px] bg-white text-primary"
                          >
                            <option value="open_all">오픈 테스트 전체 공통</option>
                            <option value="blind_all">블라인드 테스트 전체 공통</option>
                            <option value="specific_buman">특정 부문 개별 설정</option>
                          </select>
                        </div>

                        {newTemplateTargetType === 'specific_buman' && (
                          <div>
                            <label className="text-[11px] font-extrabold text-[#8b97ab] block mb-1">적용 부문 선택</label>
                            <select
                              value={newTemplateTargetId}
                              onChange={(e) => setNewTemplateTargetId(e.target.value)}
                              className="w-full h-9 border border-[#dde3ec] rounded-lg px-2 text-[13px] bg-white text-primary"
                            >
                              {bumans.filter(b => b.prefix).map(b => (
                                <option key={b.id} value={b.prefix}>[{b.prefix}] {b.name} ({b.cat === 'blind' ? '블라인드' : '오픈'})</option>
                              ))}
                            </select>
                          </div>
                        )}

                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => setShowAddTemplateForm(false)}
                            className="h-8 px-3 rounded-lg border border-gray-300 text-[12px] bg-white cursor-pointer hover:bg-gray-50 transition-all font-semibold"
                          >
                            취소
                          </button>
                          <button
                            onClick={() => {
                              handleAddTemplate(
                                newTemplateTargetType,
                                newTemplateTargetType === 'specific_buman' ? newTemplateTargetId : null
                              );
                              setShowAddTemplateForm(false);
                            }}
                            className="h-8 px-3 rounded-lg bg-primary text-white text-[12px] cursor-pointer hover:bg-primary-hover transition-all font-bold"
                          >
                            추가
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setShowAddTemplateForm(true);
                          setNewTemplateTargetType('specific_buman');
                          const availBumans = bumans.filter(b => b.prefix);
                          setNewTemplateTargetId(availBumans[0] ? availBumans[0].prefix : '');
                        }}
                        className="w-full h-10 border border-dashed border-[#c3ccdb] bg-white text-[#3a475c] hover:bg-[#f8fafc] rounded-xl text-[13px] font-bold cursor-pointer transition-all flex items-center justify-center gap-1"
                      >
                        + 평가 구성 추가
                      </button>
                    )}
                  </div>
                </div>

                {/* 우측 패널: 선택된 평가 구성의 세부 그룹/항목 설정 보드 */}
                <div className="space-y-4">
                  {activeTemplate ? (
                    <>
                      {/* 상세 템플릿 헤더 정보 */}
                      <div className="bg-white border border-[#e5e9f0] rounded-[14px] p-4 px-5 shadow-sm flex items-center justify-between flex-wrap gap-4">
                        <div>
                          <div className="text-[11px] font-bold tracking-[1.5px] text-[#8b97ab] uppercase">
                            선택된 평가 대상 설정
                          </div>
                          <div className="text-[20px] font-extrabold text-[#1b2a4a] mt-1">
                            {activeTitle}
                          </div>
                        </div>

                        <button
                          onClick={handleAddItemGroup}
                          className="h-[42px] px-4 bg-primary hover:bg-primary-hover text-white rounded-lg text-[13px] font-bold cursor-pointer transition-all flex items-center gap-1.5"
                        >
                          + 평가 그룹 추가
                        </button>
                      </div>

                      {/* 평가 세부 그룹 리스트 카드 루프 */}
                      {activeTemplate.groups.map((g, idx) => {
                        const rawTotal = g.items.reduce((sum, it) => sum + (Number(it.max) || 0), 0);

                        return (
                          <div key={g.id} className="relative bg-white border border-[#e5e9f0] rounded-[14px] overflow-hidden shadow-sm">
                            {/* 평가 그룹 카드 삭제 버튼 */}
                            <button
                              onClick={() => {
                                if (window.confirm(`[${g.name || '신규 평가 항목군'}] 평가 그룹 카드를 완전히 삭제하시겠습니까?\n내부의 모든 세부 항목 배점이 제거됩니다.`)) {
                                  handleDeleteItemGroup(g.id);
                                }
                              }}
                              className="absolute top-3 right-3 text-gray-400 hover:text-red-600 text-[18px] font-extrabold cursor-pointer z-10 transition-all leading-none"
                              title="그룹 카드 삭제"
                            >
                              ×
                            </button>

                            {/* 카드 헤더 */}
                            <div
                              className="p-4 px-5 border-b border-[#e5e9f0] flex items-center gap-6 flex-wrap pr-12"
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
                                    const next = templates.map(t => {
                                      if (t.id !== activeTemplate.id) return t;
                                      return {
                                        ...t,
                                        groups: t.groups.map(x => x.id === g.id ? { ...x, name: e.target.value } : x)
                                      };
                                    });
                                    setTemplates(next);
                                    saveState({ templates: next });
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
                                      const next = templates.map(t => {
                                        if (t.id !== activeTemplate.id) return t;
                                        return {
                                          ...t,
                                          groups: t.groups.map(x => x.id === g.id ? { ...x, convertTo: e.target.value.trim() === '' ? '' : Number(e.target.value) || 0 } : x)
                                        };
                                      });
                                      setTemplates(next);
                                      saveState({ templates: next });
                                    }}
                                    placeholder="—"
                                    className="w-[70px] h-[38px] border border-[#dde3ec] rounded-lg text-center font-extrabold text-[16px] text-[#b58a2e] bg-white"
                                  />
                                  <span className="text-[13px] text-[#8b97ab] font-bold">점</span>
                                </div>
                              </div>
                            </div>

                            {/* 카드 본문 리스트 */}
                            <div className="grid grid-cols-[1.2fr_80px_2.2fr_56px] bg-[#fafbfd] border-b border-[#eef1f6] text-[12px] font-extrabold text-[#5a6a82]">
                              <div className="py-2.5 px-4">평가 세부 항목</div>
                              <div className="py-2.5 px-3 text-center">배점</div>
                              <div className="py-2.5 px-4">척도 배점 매핑</div>
                              <div className="py-2.5 text-center">삭제</div>
                            </div>

                            {g.items.map((it) => (
                              <div key={it.id} className="grid grid-cols-[1.2fr_80px_2.2fr_56px] border-b border-[#f2f4f8] align-center items-center last:border-b-0">
                                <div className="py-1.5 px-3">
                                  <input
                                    type="text"
                                    value={it.name}
                                    onChange={(e) => {
                                      const next = templates.map(t => {
                                        if (t.id !== activeTemplate.id) return t;
                                        return {
                                          ...t,
                                          groups: t.groups.map(x => {
                                            if (x.id !== g.id) return x;
                                            return {
                                              ...x,
                                              items: x.items.map(s => s.id === it.id ? { ...s, name: e.target.value } : s)
                                            };
                                          })
                                        };
                                      });
                                      setTemplates(next);
                                      saveState({ templates: next });
                                    }}
                                    className="w-full h-[38px] border border-[#dde3ec] rounded-lg px-3 text-[14px] font-semibold text-primary"
                                  />
                                </div>
                                <div className="py-1.5 px-2">
                                  <input
                                    type="text"
                                    value={it.max}
                                    onChange={(e) => {
                                      const nextMax = e.target.value.replace(/[^0-9]/g, '');
                                      const next = templates.map(t => {
                                        if (t.id !== activeTemplate.id) return t;
                                        return {
                                          ...t,
                                          groups: t.groups.map(x => {
                                            if (x.id !== g.id) return x;
                                            return {
                                              ...x,
                                              items: x.items.map(s => {
                                                if (s.id !== it.id) return s;

                                                const mVal = parseInt(nextMax) || 0;
                                                const steps = s.scaleValues ? s.scaleValues.split(',').length : 5;
                                                const stepSize = mVal / steps;
                                                const nextScaleValues = Array.from({ length: steps }, (_, i) => Math.round(stepSize * (i + 1))).join(', ');

                                                return {
                                                  ...s,
                                                  max: nextMax,
                                                  scaleValues: nextScaleValues
                                                };
                                              })
                                            };
                                          })
                                        };
                                      });
                                      setTemplates(next);
                                      saveState({ templates: next });
                                    }}
                                    className="w-full h-[38px] border border-[#dde3ec] rounded-lg text-center font-extrabold text-[15px] text-[#b58a2e]"
                                  />
                                </div>
                                <div className="py-1.5 px-3 flex flex-col gap-1">
                                  {/* 단계 수 퀵 헬퍼 버튼 그룹 */}
                                  <div className="flex gap-1 items-center">
                                    {[3, 5, 7].map((steps) => {
                                      const mVal = parseInt(it.max) || 0;
                                      const stepSize = mVal / steps;
                                      const calculatedStr = Array.from({ length: steps }, (_, i) => Math.round(stepSize * (i + 1))).join(', ');
                                      const isMatched = it.scaleValues === calculatedStr || (!it.scaleValues && steps === 5);

                                      return (
                                        <button
                                          key={steps}
                                          type="button"
                                          onClick={() => {
                                            const next = templates.map(t => {
                                              if (t.id !== activeTemplate.id) return t;
                                              return {
                                                ...t,
                                                groups: t.groups.map(x => {
                                                  if (x.id !== g.id) return x;
                                                  return {
                                                    ...x,
                                                    items: x.items.map(s => s.id === it.id ? { ...s, scaleValues: calculatedStr } : s)
                                                  };
                                                })
                                              };
                                            });
                                            setTemplates(next);
                                            saveState({ templates: next });
                                          }}
                                          className={`py-0.5 px-1.5 text-[10px] rounded border transition-all cursor-pointer font-extrabold ${isMatched
                                            ? 'bg-[#1b2a4a] border-[#1b2a4a] text-white'
                                            : 'bg-white border-[#cbd3e1] text-[#5a6a82] hover:bg-gray-50'}`}
                                        >
                                          {steps}단계
                                        </button>
                                      );
                                    })}

                                    <span className="text-[10px] text-gray-400 font-semibold ml-1">
                                      {it.scaleValues ? "커스텀 척도" : "자동 (5단계)"}
                                    </span>
                                  </div>

                                  <input
                                    type="text"
                                    value={it.scaleValues || ''}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      const next = templates.map(t => {
                                        if (t.id !== activeTemplate.id) return t;
                                        return {
                                          ...t,
                                          groups: t.groups.map(x => {
                                            if (x.id !== g.id) return x;
                                            return {
                                              ...x,
                                              items: x.items.map(s => s.id === it.id ? { ...s, scaleValues: val } : s)
                                            };
                                          })
                                        };
                                      });
                                      setTemplates(next);
                                      saveState({ templates: next });
                                    }}
                                    placeholder={scaleOf(it.max).join(', ') + ' (쉼표로 척도 기입)'}
                                    className="w-full h-[32px] border border-[#dde3ec] rounded-lg px-2 text-[12px] font-extrabold text-primary bg-white focus:border-[#1b2a4a] focus:outline-none"
                                  />
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
                    </>
                  ) : (
                    <div className="bg-white border border-[#e5e9f0] rounded-[14px] p-10 text-center text-gray-400 font-semibold shadow-sm">
                      좌측 리스트에서 관리할 평가 대상을 고르거나 새로 추가해 주세요.
                    </div>
                  )}

                  <div className="text-[12px] text-[#8b97ab] leading-relaxed max-w-[1000px] pt-2">
                    ※ 5단계 척도는 배점을 5등분하여 자동 생성됩니다. 환산 점수를 비워둘 경우 원점수 그대로 총점에 합산되어 평가가 반영됩니다.
                  </div>
                </div>
              </div>
            );
          })()}

          {/* 기기 관리 (devices) */}
          {section === 'devices' && (
            <div className="bg-white border border-[#e5e9f0] rounded-[14px] overflow-hidden max-w-[940px] shadow-sm">
              <div className="grid grid-cols-[56px_1.4fr_110px_1.3fr_1fr_70px_84px] bg-[#f4f6fa] border-b border-[#e5e9f0] text-[12px] font-extrabold text-[#5a6a82]">
                <div className="p-3 text-center">No.</div>
                <div className="p-3">기기 이름</div>
                <div className="p-3 text-center">상태</div>
                <div className="p-3">마지막 접속</div>
                <div className="p-3">기기키</div>
                <div className="p-3 text-center">승인</div>
                <div className="p-3 text-center">관리</div>
              </div>

              {devices.length === 0 ? (
                <div className="p-8 text-center text-[13px] text-[#8b97ab]">등록된 기기가 없습니다.</div>
              ) : devices.map((d, idx) => (
                <div key={d.id} className="grid grid-cols-[56px_1.4fr_110px_1.3fr_1fr_70px_84px] border-b border-[#eef1f6] items-center last:border-b-0">
                  <div className="p-3 text-center font-bold text-[#8b97ab]">{idx + 1}</div>
                  <div className="p-3 font-semibold text-primary text-[14px]">{d.label || '(이름 없음)'}</div>
                  <div className="p-3 text-center">
                    <span className={`inline-block px-2 py-1 rounded-md text-[11px] font-extrabold ${
                      d.status === 'approved' ? 'bg-[#e6f4ec] text-[#2f7a4f]'
                      : d.status === 'blocked' ? 'bg-[#fdecea] text-[#c0392b]'
                      : 'bg-[#fff5e0] text-[#b58a2e]'}`}>
                      {d.status === 'approved' ? '승인됨' : d.status === 'blocked' ? '차단됨' : '대기'}
                    </span>
                  </div>
                  <div className="p-3 text-[13px] text-[#8b97ab]">{formatKstDate(d.lastSeen)}</div>
                  <div className="p-3 text-[12px] text-[#9aa6bb]">…{(d.deviceKey || '').slice(-8)}</div>
                  <div className="p-3 text-center">
                    <input type="checkbox" checked={d.status === 'approved'} onChange={(e) => changeDeviceStatus(d.id, e.target.checked ? 'approved' : 'pending')} className="w-5 h-5 cursor-pointer" />
                  </div>
                  <div className="p-3 text-center">
                    {d.status === 'blocked' ? (
                      <button onClick={() => changeDeviceStatus(d.id, 'pending')} className="h-[34px] px-3 border border-[#dde3ec] bg-white hover:bg-gray-50 text-[#5a6a82] rounded-lg text-[12px] font-bold cursor-pointer transition-all">해제</button>
                    ) : (
                      <button onClick={() => changeDeviceStatus(d.id, 'blocked')} className="h-[34px] px-3 border border-red-200 bg-white hover:bg-red-50 text-[#c0392b] rounded-lg text-[12px] font-bold cursor-pointer transition-all">차단</button>
                    )}
                  </div>
                </div>
              ))}

              <div className="p-3.5 bg-gray-50/50 flex items-center justify-between">
                <span className="text-[13px] font-bold text-[#5a6a82]">신규 기기 등록 {enrollOpen ? '허용' : '잠금'}</span>
                <input type="checkbox" checked={enrollOpen} onChange={(e) => toggleEnroll(e.target.checked)} className="w-5 h-5 cursor-pointer" />
              </div>
            </div>
          )}

          {/* 6) 결과 집계 (results) */}
          {section === 'results' && (
            (() => {
              const rbk = bumans.some(b => b.prefix === resultBuman) ? resultBuman : (bumans[0]?.prefix || 'A');
              const isBlind = activeResultBumanObject?.cat === 'blind' || activeResultBumanObject?.type === 'blind';

              // 1. 현재 부문에 부합하는 템플릿, 지정 심사위원 및 합계 배점 탐색
              const bumanObj = bumans.find(b => b.prefix === rbk);
              const bumanType = bumanObj?.cat || bumanObj?.type || 'open';

              // 해당 부문에 지정된 심사위원 전용 배열 (어느 한 부문이라도 심사위원이 명시 지정된 대회라면 지정된 심사위원만 엄격하게 필터링)
              const hasExplicitMapping = bumans.some(b => Array.isArray(b.judgeIds) && b.judgeIds.length > 0);
              const bumanJudges = (bumanObj && Array.isArray(bumanObj.judgeIds))
                ? (hasExplicitMapping ? judges.filter(j => bumanObj.judgeIds.includes(j.id)) : judges)
                : judges;


              const canTrim = bumanJudges.length >= 3;

              let matchTemplate = templates.find(t => t.target_type === 'specific_buman' && t.target_id === rbk)
                || templates.find(t => t.target_type === (bumanType === 'blind' ? 'blind_all' : 'open_all'));

              if (!matchTemplate || !matchTemplate.groups || matchTemplate.groups.length === 0) {
                const catDef = ITEMS[bumanObj?.cat] || ITEMS.ricefood;
                const fallbackGroups = [];
                if (catDef.gwan && catDef.gwan.length > 0) {
                  fallbackGroups.push({
                    id: 'gwan',
                    name: '관능 평가',
                    convertTo: catDef.convert ? '70' : '',
                    items: catDef.gwan.map(it => ({ id: it.key, name: it.name, max: it.max }))
                  });
                }
                if (catDef.sang && catDef.sang.length > 0) {
                  fallbackGroups.push({
                    id: 'sang',
                    name: '상품성 평가',
                    convertTo: '',
                    items: catDef.sang.map(it => ({ id: it.key, name: it.name, max: it.max }))
                  });
                }
                matchTemplate = { id: 'fallback', groups: fallbackGroups };
              }

              // 2. 심사위원별 상세 채점 점수 분리 배분(Distribution) 시뮬레이션 헬퍼 정의
              const getJudgeDetailedScores = (pIdx, jIdx, p) => {
                const jObj = bumanJudges[jIdx];
                const judgeIdKey = String(jObj?.id);
                const pScores = actualScores[judgeIdKey]?.[p.code] || {};
                const filledCount = Object.keys(pScores).length;
                const hasScores = filledCount > 0;

                const groupResults = [];
                let totalRawScore = 0;
                let totalConvertedScore = 0;
                let itemScoresMap = {};

                if (matchTemplate && matchTemplate.groups && matchTemplate.groups.length > 0) {
                  matchTemplate.groups.forEach((g) => {
                    const gMaxRaw = (g.items || []).reduce((sum, it) => sum + (parseInt(it.max) || 0), 0);
                    const gConvertTo = parseInt(g.convertTo) || 0;

                    let gRawScore = 0;
                    const gItems = g.items || [];

                    let allRawKeys = Object.keys(pScores);
                    gItems.forEach((it, itIdx) => {
                      let val = 0;
                      if (pScores[String(it.id)] !== undefined) val = pScores[String(it.id)];
                      else if (pScores[it.id] !== undefined) val = pScores[it.id];
                      else if (pScores[it.name] !== undefined) val = pScores[it.name];
                      else if (allRawKeys[itIdx] !== undefined) val = pScores[allRawKeys[itIdx]];

                      const numVal = Number(val) || 0;
                      itemScoresMap[it.id] = numVal;
                      gRawScore += numVal;
                    });


                    let gConverted = gRawScore;
                    if (gConvertTo > 0 && gMaxRaw > 0) {
                      gConverted = Math.round((gRawScore / gMaxRaw) * gConvertTo * 10) / 10;
                    }

                    totalRawScore += gRawScore;
                    totalConvertedScore += gConverted;

                    groupResults.push({
                      groupId: g.id,
                      rawSum: gRawScore,
                      converted: gConverted
                    });
                  });
                }

                return {
                  itemScores: itemScoresMap,
                  groupScores: groupResults,
                  totalRaw: totalRawScore,
                  totalConverted: Math.round(totalConvertedScore * 10) / 10,
                  hasScores
                };
              };


              // 완료된 심사위원 계산 (현재 부문의 모든 제품의 모든 항목에 점수를 채웠는지 판별)
              const activeProductsList = products[rbk] || [];
              const matchTemplateItems = [];
              if (matchTemplate && matchTemplate.groups) {
                matchTemplate.groups.forEach(g => {
                  (g.items || []).forEach(it => {
                    matchTemplateItems.push(String(it.id));
                  });
                });
              }

              const completedJudgesCount = bumanJudges.filter(j => {
                const jScores = actualScores[String(j.id)] || {};
                const hasData = activeProductsList.length > 0 && matchTemplateItems.length > 0;
                if (!hasData) return false;
                
                return activeProductsList.every(p => {
                  const pScores = jScores[p.code] || {};
                  return matchTemplateItems.every(itemId => pScores[itemId] !== undefined && pScores[itemId] !== null);
                });
              }).length;

              // 각 제품별 심사위원 채점 매트릭스 데이터 생성
              const matrixList = (products[rbk] || []).map((p, pIdx) => {
                const judgeDetails = bumanJudges.map((j, jIdx) => {
                  return getJudgeDetailedScores(pIdx, jIdx, p);
                });

                const listScores = judgeDetails.map(d => d.totalConverted);
                const validScores = judgeDetails.filter(d => d.hasScores).map(d => d.totalConverted);

                // 합계 연산
                const rawTotal = listScores.reduce((sum, v) => sum + v, 0);

                // 최고/최저 제외 연산 (실제 채점한 사람이 3명 이상일 때만 동작하도록 통제)
                const canTrimReal = canTrim && (validScores.length >= 3);
                let finalTotal = rawTotal;
                let minIdx = -1;
                let maxIdx = -1;

                if (canTrimReal) {
                  const sorted = [...validScores].sort((a, b) => a - b);
                  const minVal = sorted[0];
                  const maxVal = sorted[sorted.length - 1];

                  minIdx = listScores.indexOf(minVal);
                  maxIdx = listScores.lastIndexOf(maxVal); // 동일 점수 시 분류

                  finalTotal = rawTotal - minVal - maxVal;
                } else {
                  finalTotal = rawTotal;
                }

                return {
                  code: p.code,
                  name: p.name || '블라인드 제품',
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

              // 3. 심사위원별 개별 상세 집계 데이터셋 구성
              const judgeSheets = bumanJudges.map((j, jIdx) => {
                const sheetRows = (products[rbk] || []).map((p, pIdx) => {
                  const detailed = getJudgeDetailedScores(pIdx, jIdx, p);
                  return {
                    code: p.code,
                    name: p.name || '블라인드 제품',
                    detailed
                  };
                });

                const sortedRows = [...sheetRows].sort((a, b) => b.detailed.totalConverted - a.detailed.totalConverted);
                const localRankMap = {};
                sortedRows.forEach((row, rIdx) => {
                  localRankMap[row.code] = rIdx + 1;
                });

                return {
                  judgeName: j.name,
                  judgeIdx: jIdx,
                  rows: sheetRows.map(row => ({
                    ...row,
                    rank: localRankMap[row.code]
                  }))
                };
              });


              return (
                <div className="space-y-5">
                  {/* 부문 전환 탭 및 실시간 갱신 제어 */}
                  <div className="flex justify-between items-center max-w-[1100px] flex-wrap gap-3">
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

                    <div className="flex items-center gap-3">
                      <span className="text-[12px] font-bold text-[#2f7a4f] flex items-center gap-1.5 bg-[#eef7f1] py-1.5 px-3 rounded-lg border border-[#d2ecd9]">
                        <span className="inline-block w-2 h-2 bg-[#2f7a4f] rounded-full animate-ping"></span>
                        실시간 갱신 중 (3초 간격)
                      </span>
                      <button
                        onClick={() => fetchResults(activeGroup)}
                        className="py-2 px-3 border border-[#dde3ec] bg-white hover:bg-gray-50 text-[#5a6a82] hover:text-[#1b2a4a] rounded-[10px] text-[13px] font-bold cursor-pointer transition-all flex items-center gap-1"
                      >
                        🔄 수동 갱신
                      </button>
                    </div>
                  </div>

                  {/* 대회 상태 통계 */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-[1100px]">
                    <div className="bg-white border border-[#e5e9f0] rounded-[14px] p-[18px] px-5">
                      <div className="text-[12px] text-[#8b97ab] font-semibold">완료된 심사위원</div>
                      <div className="mt-1.5 text-[28px] font-extrabold text-[#1b2a4a] leading-none">{completedJudgesCount} / {judges.length}명</div>
                    </div>
                    <div className="bg-white border border-[#e5e9f0] rounded-[14px] p-[18px] px-5">
                      <div className="text-[12px] text-[#8b97ab] font-semibold">부문 제품 개수</div>
                      <div className="mt-1.5 text-[28px] font-extrabold text-[#1b2a4a] leading-none">{(products[rbk] || []).length}개</div>
                    </div>
                    <div className="bg-white border border-[#e5e9f0] rounded-[14px] p-[18px] px-5">
                      <div className="text-[12px] text-[#8b97ab] font-semibold">최고 합계 점수</div>
                      <div className="mt-1.5 text-[28px] font-extrabold text-[#284c7d] leading-none">
                        {matrixList.length > 0 ? formatScore(Math.max(...matrixList.map(m => m.finalTotal))) : 0}점
                      </div>
                    </div>
                    <div className="bg-white border border-[#e5e9f0] rounded-[14px] p-[18px] px-5">
                      <div className="text-[12px] text-[#8b97ab] font-semibold">최저 합계 점수</div>
                      <div className="mt-1.5 text-[28px] font-extrabold text-[#c0392b] leading-none">
                        {matrixList.length > 0 ? formatScore(Math.min(...matrixList.map(m => m.finalTotal))) : 0}점
                      </div>
                    </div>
                  </div>

                  {/* 결과 세부 화면 서브 탭 분류 */}
                  <div className="flex gap-4 border-b border-[#dde3ec] pb-1 max-w-[1100px] mt-2">
                    <button
                      onClick={() => setResultsSubTab('summary')}
                      className={`pb-2 px-1 text-[14px] font-extrabold cursor-pointer border-b-2 transition-all ${resultsSubTab === 'summary'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-[#8b97ab] hover:text-[#5a6a82]'}`}
                    >
                      종합 순위 집계
                    </button>
                    <button
                      onClick={() => setResultsSubTab('judges')}
                      className={`pb-2 px-1 text-[14px] font-extrabold cursor-pointer border-b-2 transition-all ${resultsSubTab === 'judges'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-[#8b97ab] hover:text-[#5a6a82]'}`}
                    >
                      심사위원별 결과 상세
                    </button>
                  </div>

                  {/* 1) 종합 순위 집계 탭 화면 */}
                  {resultsSubTab === 'summary' && (
                    <>
                      <div>
                        <div className="text-[15px] font-extrabold text-[#1b2a4a]">
                          부문 집계 결과 매트릭스 ({activeResultBumanObject?.name})
                        </div>
                        <div className="text-[13px] text-[#8b97ab] mt-1">
                          심사위원별 점수 · 최고( <span className="text-[#2f5488] font-bold">파랑</span> ) 및 최저( <span className="text-[#c0392b] font-bold">주황</span> ) 점수는 집계 신뢰도 확보를 위해 최종 합계 계산에서 제외됩니다.
                        </div>
                      </div>

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
                              {bumanJudges.map((j) => (
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
                                  {bumanJudges.map((j, jIdx) => {
                                    // 이 심사위원의 해당 제품의 최종 환산 점수를 구함
                                    const detailed = getJudgeDetailedScores(idx, jIdx, products[rbk][idx]);
                                    const scoreVal = detailed.totalConverted;

                                    // 최고/최저 점수 마크 판정용 임시 탐색
                                    const allScores = bumanJudges.map((_, tmpIdx) => getJudgeDetailedScores(idx, tmpIdx, products[rbk][idx]).totalConverted);
                                    let isMin = false;
                                    let isMax = false;
                                    if (canTrim) {
                                      const sorted = [...allScores].sort((a, b) => a - b);
                                      const minVal = sorted[0];
                                      const maxVal = sorted[sorted.length - 1];
                                      const minIdx = allScores.indexOf(minVal);
                                      const maxIdx = allScores.lastIndexOf(maxVal);
                                      isMin = jIdx === minIdx;
                                      isMax = jIdx === maxIdx;
                                    }

                                    return (
                                      <td
                                        key={jIdx}
                                        className={`p-3 text-center font-semibold border-l border-[#f2f4f8] ${isMax
                                          ? 'text-[#2f5488] bg-blue-50/70 font-bold'
                                          : isMin
                                            ? 'text-[#c0392b] bg-red-50/70 font-bold'
                                            : 'text-[#3a475c]'
                                          }`}
                                      >
                                        {formatScore(scoreVal)}
                                        {isMax && <span className="block text-[9px] text-blue-500 font-extrabold leading-none mt-0.5">최고 제외</span>}
                                        {isMin && <span className="block text-[9px] text-red-500 font-extrabold leading-none mt-0.5">최저 제외</span>}
                                      </td>
                                    );
                                  })}

                                  {/* 원점수합 */}
                                  <td className="p-3 text-center font-bold text-[#2f5a3a] bg-[#f1f7f1] border-l border-[#f2f4f8]">
                                    {formatScore(m.total)}
                                  </td>
                                  {/* 최종합계 */}
                                  <td className="p-3 text-center font-extrabold text-[16px] text-[#8a6a1e] bg-[#fbf4e2] border-l border-[#f2f4f8]">
                                    {formatScore(m.finalTotal)}
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
                    </>
                  )}

                  {/* 2) 심사위원별 결과 상세 탭 화면 */}
                  {resultsSubTab === 'judges' && (
                    <>
                      {/* 가로형 심사위원 셀렉터 단추 그룹 */}
                      <div className="flex gap-1.5 flex-wrap items-center bg-[#f4f6fa] p-3 rounded-xl border border-[#dde3ec] max-w-[1100px]">
                        <span className="text-[12px] font-extrabold text-[#5a6a82] mr-2">심사위원 필터:</span>
                        {bumanJudges.length === 0 ? (
                          <span className="text-[13px] font-bold text-[#8b97ab]">지정된 담당 심사위원이 없습니다. [부문 등록] 탭에서 심사위원을 지정해 주세요.</span>
                        ) : (
                          bumanJudges.map((j, idx) => (
                            <button
                              key={idx}
                              onClick={() => setSelectedResultJudgeIdx(idx)}
                              className={`py-1.5 px-3.5 rounded-lg text-[13px] font-extrabold border transition-all cursor-pointer ${selectedResultJudgeIdx === idx
                                ? 'bg-primary border-primary text-white shadow-sm'
                                : 'bg-white border-[#cbd3e1] text-[#5a6a82] hover:bg-gray-50'}`}
                            >
                              {j.name} ({j.affiliation})
                            </button>
                          ))
                        )}

                      </div>


                      {/* 심사위원 개별 시트 2단 헤더 테이블 */}
                      <div className="bg-white border border-[#e5e9f0] rounded-[14px] overflow-auto max-w-full shadow-sm">
                        <table className="border-collapse border-spacing-0 w-full text-[13px]">
                          <thead>
                            {/* 1단 헤더 */}
                            <tr className="bg-[#1b2a4a] text-white">
                              <th colSpan="1" rowSpan="2" className="sticky left-0 bg-[#1b2a4a] text-white p-3.5 font-extrabold text-center min-w-[90px] border-r border-[#243a63] z-20">
                                제품<br />분류코드
                              </th>
                              <th colSpan="1" rowSpan="2" className="sticky left-[90px] bg-[#1b2a4a] text-white p-3.5 font-extrabold text-left min-w-[150px] border-r border-[#243a63] z-10">
                                제품명
                              </th>

                              {/* 템플릿의 각 그룹 */}
                              {matchTemplate && matchTemplate.groups && matchTemplate.groups.map(g => {
                                const gItems = g.items || [];
                                return (
                                  <React.Fragment key={g.id}>
                                    {gItems.length > 0 && (
                                      <th colSpan={gItems.length} className="bg-[#243a63] text-white p-2 font-extrabold text-center border-r border-[#314a7c] border-b border-[#314a7c]">
                                        {g.name}
                                      </th>
                                    )}
                                    <th colSpan="1" rowSpan="2" className="bg-[#1f4a38] text-white p-2.5 font-extrabold text-center border-r border-[#285d47] min-w-[70px]">
                                      배점합계
                                    </th>
                                    <th colSpan="1" rowSpan="2" className="bg-[#8a6a1e] text-white p-2.5 font-extrabold text-center border-r border-[#9b7b2b] min-w-[70px]">
                                      환산점수
                                    </th>
                                  </React.Fragment>
                                );
                              })}

                              {/* 최종 합산 */}
                              <th colSpan="1" rowSpan="2" className="bg-[#284c7d] text-white p-2.5 font-extrabold text-center border-r border-[#315b94] min-w-[75px]">
                                배점합계
                              </th>
                              <th colSpan="1" rowSpan="2" className="bg-[#8a6a1e] text-white p-2.5 font-extrabold text-center border-r border-[#9b7b2b] min-w-[75px]">
                                환산점수
                              </th>
                              <th colSpan="1" rowSpan="2" className="bg-[#1b2a4a] text-white p-2.5 font-extrabold text-center border-r border-[#243a63] min-w-[100px]">
                                최종환산합계
                              </th>
                              <th colSpan="1" rowSpan="2" className="bg-[#c0392b] text-white p-2.5 font-extrabold text-center min-w-[60px]">
                                순위
                              </th>
                            </tr>

                            {/* 2단 헤더 (세부 항목명) */}
                            <tr className="bg-[#243a63] text-white text-[11px] border-b border-[#243a63]">
                              {matchTemplate && matchTemplate.groups && matchTemplate.groups.map(g => (
                                (g.items || []).map(it => (
                                  <th key={it.id} className="p-2 font-bold text-center border-r border-[#344f82] min-w-[80px] bg-[#2a4372]">
                                    {it.name}
                                  </th>
                                ))
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {judgeSheets[selectedResultJudgeIdx]?.rows.map((r, rIdx) => {
                              return (
                                <tr
                                  key={r.code}
                                  className="hover:bg-gray-50 border-b border-[#eef1f6] last:border-b-0"
                                  style={{ backgroundColor: rIdx % 2 === 1 ? '#fafbfd' : '#ffffff' }}
                                >
                                  <td className="sticky left-0 bg-inherit p-3.5 text-center font-extrabold text-[#1b2a4a] z-10">
                                    {r.code}
                                  </td>
                                  <td className="sticky left-[90px] bg-inherit p-3.5 font-semibold text-[#3a475c] text-left z-10 truncate max-w-[150px]">
                                    {r.name}
                                  </td>

                                  {/* 각 그룹별 세부 점수 및 배점합/환산점수 */}
                                  {matchTemplate && matchTemplate.groups && matchTemplate.groups.map(g => {
                                    const gItems = g.items || [];
                                    const gScore = r.detailed.groupScores.find(gs => gs.groupId === g.id);

                                    return (
                                      <React.Fragment key={g.id}>
                                        {gItems.map(it => (
                                          <td key={it.id} className="p-3 text-center border-l border-[#f2f4f8] text-primary font-semibold">
                                            {r.detailed.itemScores[it.id] || 0}
                                          </td>
                                        ))}
                                        {/* 배점합계 */}
                                        <td className="p-3 text-center font-bold text-[#1f4a38] bg-[#f1f7f1] border-l border-[#eef1f6]">
                                          {gScore ? gScore.rawSum : 0}
                                        </td>
                                        {/* 환산점수 */}
                                        <td className="p-3 text-center font-extrabold text-[#8a6a1e] bg-[#fbf4e2] border-l border-[#eef1f6]">
                                          {gScore ? gScore.converted : 0}
                                        </td>
                                      </React.Fragment>
                                    );
                                  })}

                                  {/* 최종합계 내역 */}
                                  {/* 최종 배점합 */}
                                  <td className="p-3 text-center font-bold text-[#284c7d] bg-[#f0f4fa] border-l border-[#eef1f6]">
                                    {formatScore(r.detailed.totalRaw)}
                                  </td>
                                  {/* 최종 환산점수 */}
                                  <td className="p-3 text-center font-extrabold text-[#8a6a1e] bg-[#fbf4e2] border-l border-[#eef1f6]">
                                    {formatScore(r.detailed.totalConverted)}
                                  </td>
                                  {/* 최종 환산 합계 */}
                                  <td className="p-3 text-center font-extrabold text-[15px] text-[#1b2a4a] bg-[#eaeffa] border-l border-[#eef1f6]">
                                    {formatScore(r.detailed.totalConverted)}
                                  </td>
                                  {/* 로컬 순위 */}
                                  <td className="p-3 text-center bg-[#f4f6fb] border-l border-[#eef1f6]">
                                    <span className={`inline-block w-5 h-5 rounded-full text-center leading-5 text-[11px] font-extrabold ${r.rank === 1
                                      ? 'bg-[#d9b866] text-white'
                                      : r.rank === 2
                                        ? 'bg-gray-400 text-white'
                                        : r.rank === 3
                                          ? 'bg-[#b58a2e] text-white'
                                          : 'bg-transparent text-[#5a6a82]'
                                      }`}>
                                      {r.rank}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}

                  {/* 제어 하단 버튼 */}
                  <div className="flex gap-3 max-w-[1100px]">
                    <button
                      onClick={() => {
                        try {
                          const wb = XLSX.utils.book_new();

                          // 1. 종합 순위 집계 시트 작성 (지정 심사위원 전용 bumanJudges 반영)
                          const summaryHeaders = ["제품분류코드", "제품명", ...bumanJudges.map(j => `${j.name}(${j.affiliation})`), "원점수합", "최종합계", "순위"];
                          const summaryRows = matrixList.map((m, mIdx) => {
                            const scoresList = bumanJudges.map((_, jIdx) => {
                              return getJudgeDetailedScores(mIdx, jIdx, products[rbk][mIdx]).totalConverted;
                            });
                            return [
                              m.code,
                              m.name,
                              ...scoresList,
                              m.total,
                              m.finalTotal,
                              rankMap[m.code]
                            ];
                          });
                          const summaryData = [summaryHeaders, ...summaryRows];
                          const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
                          XLSX.utils.book_append_sheet(wb, wsSummary, "종합 순위 집계");

                          // 2. 심사위원별 개별 시트 작성
                          judgeSheets.forEach((sheet) => {
                            const row1 = ["제품분류코드", "제품명"];
                            const row2 = ["", ""];

                            if (matchTemplate && matchTemplate.groups) {
                              matchTemplate.groups.forEach((g) => {
                                const gItems = g.items || [];
                                if (gItems.length > 0) {
                                  row1.push(g.name);
                                  for (let i = 1; i < gItems.length; i++) {
                                    row1.push("");
                                  }
                                  gItems.forEach(it => {
                                    row2.push(it.name);
                                  });
                                }
                                row1.push("배점합계", "환산점수");
                                row2.push("", "");
                              });
                            }
                            row1.push("배점합계", "환산점수", "최종환산합계", "순위");
                            row2.push("", "", "", "");

                            const sheetRows = [row1, row2];

                            sheet.rows.forEach((r) => {
                              const dataRow = [r.code, r.name];

                              if (matchTemplate && matchTemplate.groups) {
                                matchTemplate.groups.forEach((g) => {
                                  const gItems = g.items || [];
                                  gItems.forEach(it => {
                                    dataRow.push(r.detailed.itemScores[it.id] || 0);
                                  });
                                  const gScore = r.detailed.groupScores.find(gs => gs.groupId === g.id);
                                  dataRow.push(gScore ? gScore.rawSum : 0);
                                  dataRow.push(gScore ? gScore.converted : 0);
                                });
                              }

                              dataRow.push(
                                r.detailed.totalRaw,
                                r.detailed.totalConverted,
                                r.detailed.totalConverted,
                                r.rank
                              );
                              sheetRows.push(dataRow);
                            });

                            const merges = [];
                            let colIdx = 0;

                            // 제품분류코드 & 제품명 2행 세로 병합
                            merges.push({ s: { r: 0, c: colIdx }, e: { r: 1, c: colIdx } });
                            colIdx += 1;
                            merges.push({ s: { r: 0, c: colIdx }, e: { r: 1, c: colIdx } });
                            colIdx += 1;

                            if (matchTemplate && matchTemplate.groups) {
                              matchTemplate.groups.forEach((g) => {
                                const gItems = g.items || [];
                                if (gItems.length > 0) {
                                  // 그룹 항목명 가로 병합 (항목 수 > 1)
                                  if (gItems.length > 1) {
                                    merges.push({ s: { r: 0, c: colIdx }, e: { r: 0, c: colIdx + gItems.length - 1 } });
                                  }
                                  colIdx += gItems.length;
                                }
                                // 그룹 배점합계 & 환산점수 2행 세로 병합
                                merges.push({ s: { r: 0, c: colIdx }, e: { r: 1, c: colIdx } });
                                colIdx += 1;
                                merges.push({ s: { r: 0, c: colIdx }, e: { r: 1, c: colIdx } });
                                colIdx += 1;
                              });
                            }

                            // 최종 배점합계, 환산점수, 최종환산합계, 순위 2행 세로 병합
                            merges.push({ s: { r: 0, c: colIdx }, e: { r: 1, c: colIdx } });
                            colIdx += 1;
                            merges.push({ s: { r: 0, c: colIdx }, e: { r: 1, c: colIdx } });
                            colIdx += 1;
                            merges.push({ s: { r: 0, c: colIdx }, e: { r: 1, c: colIdx } });
                            colIdx += 1;
                            merges.push({ s: { r: 0, c: colIdx }, e: { r: 1, c: colIdx } });
                            colIdx += 1;

                            const wsJudge = XLSX.utils.aoa_to_sheet(sheetRows);
                            wsJudge['!merges'] = merges;
                            const safeSheetName = (sheet.judgeName || '심사위원').substring(0, 25) + " 평가";
                            XLSX.utils.book_append_sheet(wb, wsJudge, safeSheetName);
                          });

                          // 동적 파일명 생성: 대회 전용 식별 키_부문_심사집계결과.xlsx
                          const contestKey = systemCode || activeGroupObj?.code || systemName || '품평회';
                          const bumanNameStr = bumanObj?.name ? `${bumanObj.name}(${rbk})` : `${rbk}부문`;
                          XLSX.writeFile(wb, `${contestKey}_${bumanNameStr}_심사집계결과.xlsx`);
                          showToast('다중 시트 엑셀 파일이 정상 다운로드되었습니다.');
                        } catch (err) {
                          console.error("엑셀 내보내기 실패:", err);
                          showToast('엑셀 생성 중 오류가 발생했습니다.');
                        }
                      }}
                      className="h-[48px] px-6 border border-[#cbd3e1] bg-white text-[#3a475c] rounded-[10px] text-[14px] font-bold cursor-pointer hover:bg-gray-50 transition-all shadow-sm"
                    >
                      엑셀 내려받기
                    </button>

                    <button
                      onClick={handlePublish}
                      className="h-[48px] px-6 border-none bg-primary text-white rounded-[10px] text-[14px] font-extrabold cursor-pointer hover:bg-secondary transition-all shadow-sm"
                    >
                      결과 확정·공표
                    </button>
                  </div>

                  <div className="text-[12px] text-[#8b97ab] leading-relaxed max-w-[1100px]">
                    ※ 심사위원 태블릿 어플리케이션에서 실제로 저장 및 전송된 점수가 있을 경우 실시간 병합되어 정확한 집계 결과와 순위가 연동 갱신됩니다.
                  </div>
                </div>
              );
            })()
          )}

        </div>

      </div>

      {/* 엑셀 일괄 등록 모달 팝업 */}
      {showExcelUploadModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-[#dde3ec] w-full max-w-[640px] overflow-hidden flex flex-col max-h-[90vh]">
            {/* 모달 헤더 */}
            <div className="bg-[#1b2a4a] text-white p-5 px-6 flex items-center justify-between">
              <div>
                <div className="text-[18px] font-extrabold flex items-center gap-2">
                  <span>📊</span> 엑셀 일괄 등록
                </div>
                <div className="text-[12px] text-white/70 mt-0.5 font-medium">
                  부문 목록 및 부문별 제품을 엑셀 파일로 한번에 등록합니다.
                </div>
              </div>
              <button
                onClick={() => {
                  setShowExcelUploadModal(false);
                  setExcelParsedData(null);
                  setExcelFileName('');
                  setExcelErrorMsg('');
                }}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[20px] font-extrabold flex items-center justify-center cursor-pointer transition-all"
              >
                ×
              </button>
            </div>

            {/* 모달 본문 */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {/* 경고 및 안내 박스 (사용자 요청 문구 반영) */}
              <div className="bg-[#fff8e6] border border-[#f5d089] rounded-xl p-4 flex items-start gap-3">
                <div className="text-[20px] leading-none">⚠️</div>
                <div className="text-[13px] text-[#8a5700] leading-relaxed">
                  <strong className="font-extrabold text-[#704200] block mb-0.5">주의사항 안내</strong>
                  부문과 제품은 엑셀데이터 기준으로 초기화 됩니다.
                </div>
              </div>

              {/* 엑셀 파일 선택 구역 */}
              <div>
                <label className="text-[13px] font-extrabold text-[#1b2a4a] block mb-2">
                  엑셀 파일 업로드 (.xlsx)
                </label>
                <div className="border-2 border-dashed border-[#cbd5e1] hover:border-primary/50 bg-[#f8fafc] hover:bg-[#f1f5f9] rounded-xl p-6 text-center cursor-pointer transition-all relative">
                  <input
                    type="file"
                    accept=".xlsx, .xls"
                    onChange={handleExcelFileSelect}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  <div className="text-[32px] mb-1">📁</div>
                  <div className="text-[14px] font-bold text-[#334155]">
                    {excelFileName ? excelFileName : "클릭하거나 엑셀 파일을 드래그하여 올려주세요"}
                  </div>
                  <div className="text-[12px] text-[#64748b] mt-1 font-medium">
                    지원 확장자: .xlsx, .xls (샘플 다운로드 양식 권장)
                  </div>
                </div>
              </div>

              {/* 에러 메시지 */}
              {excelErrorMsg && (
                <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-[13px] font-bold">
                  {excelErrorMsg}
                </div>
              )}

              {/* 파싱 결과 미리보기 */}
              {excelParsedData && (
                <div className="space-y-3 bg-[#f8fafc] border border-[#e2e8f0] rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] font-extrabold text-[#1b2a4a]">
                      🔍 파싱 데이터 감지 결과
                    </span>
                    <span className="text-[12px] font-bold bg-[#eef4fb] text-[#2f5488] border border-[#c6d6ee] py-1 px-3 rounded-full">
                      부문 {excelParsedData.bumanCount}개 / 제품 {excelParsedData.productCount}개
                    </span>
                  </div>

                  {/* 부문 감지 요약 */}
                  {excelParsedData.bumans.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[12px] font-bold text-[#64748b]">감지된 부문 목록:</div>
                      <div className="flex flex-wrap gap-1.5 max-h-[100px] overflow-y-auto pr-1">
                        {excelParsedData.bumans.map((b, i) => (
                          <span key={i} className="text-[12px] py-1 px-2.5 bg-white border border-[#cbd5e1] rounded-md font-extrabold text-[#1e293b]">
                            [{b.prefix}] {b.name} ({b.type === 'blind' ? '블라인드' : '오픈'})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 모달 푸터 */}
            <div className="bg-[#f8fafc] border-t border-[#e2e8f0] p-4 px-6 flex justify-end gap-2.5 shrink-0">
              <button
                onClick={() => {
                  setShowExcelUploadModal(false);
                  setExcelParsedData(null);
                  setExcelFileName('');
                  setExcelErrorMsg('');
                }}
                className="h-11 px-5 rounded-xl border border-gray-300 bg-white text-[14px] font-bold text-[#475569] hover:bg-gray-50 cursor-pointer transition-all"
              >
                취소
              </button>
              <button
                disabled={!excelParsedData}
                onClick={handleApplyExcelData}
                className={`h-11 px-6 rounded-xl text-[14px] font-extrabold text-white cursor-pointer transition-all shadow-sm ${
                  excelParsedData
                    ? 'bg-[#1b2a4a] hover:bg-[#2c3e66]'
                    : 'bg-gray-300 cursor-not-allowed'
                }`}
              >
                목록에 일괄 반영하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 👤 부문별 평가자 지정 모달 */}
      {selectedBumanForJudge && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-[540px] w-full max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* 모달 헤더 */}
            <div className="p-5 px-6 border-b border-gray-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-[17px] font-extrabold text-[#1b2a4a] flex items-center gap-2">
                  <span>👤 [{selectedBumanForJudge.prefix}] {selectedBumanForJudge.name || '부문'} 평가자 설정</span>
                </h3>
                <p className="text-[12px] text-gray-500 mt-0.5 font-medium">
                  이 부문을 심사할 심사위원을 다중 체크박스로 선택하세요.
                </p>
              </div>
              <button
                onClick={() => setSelectedBumanForJudge(null)}
                className="w-8 h-8 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex items-center justify-center text-lg font-bold transition-all cursor-pointer"
              >
                ×
              </button>
            </div>

            {/* 모달 바디 - 전체선택/해제 & 체크박스 리스트 */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {judges.length === 0 ? (
                <div className="p-8 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  <p className="text-[14px] font-bold text-gray-500">등록된 심사위원이 없습니다.</p>
                  <p className="text-[12px] text-gray-400 mt-1">상단 [심사위원 관리] 탭에서 심사위원을 먼저 등록해 주세요.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                    <span className="text-[13px] font-bold text-gray-600">
                      총 {judges.length}명의 심사위원 중 ({(Array.isArray(selectedBumanForJudge.judgeIds) ? selectedBumanForJudge.judgeIds : judges.map(j => j.id)).length}명 지정됨)
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const allIds = judges.map(j => j.id);
                          const updated = bumans.map(x => x.id === selectedBumanForJudge.id ? { ...x, judgeIds: allIds } : x);
                          setBumans(updated);
                          setSelectedBumanForJudge({ ...selectedBumanForJudge, judgeIds: allIds });
                        }}
                        className="px-2.5 py-1 text-[12px] font-extrabold text-primary bg-primary/10 hover:bg-primary/20 rounded-md transition-all cursor-pointer"
                      >
                        전체 선택
                      </button>
                      <button
                        onClick={() => {
                          const updated = bumans.map(x => x.id === selectedBumanForJudge.id ? { ...x, judgeIds: [] } : x);
                          setBumans(updated);
                          setSelectedBumanForJudge({ ...selectedBumanForJudge, judgeIds: [] });
                        }}
                        className="px-2.5 py-1 text-[12px] font-extrabold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-all cursor-pointer"
                      >
                        선택 해제
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                    {judges.map((j) => {
                      const curJids = Array.isArray(selectedBumanForJudge.judgeIds) ? selectedBumanForJudge.judgeIds : judges.map(x => x.id);
                      const isChecked = curJids.includes(j.id);

                      return (
                        <div
                          key={j.id}
                          onClick={() => {
                            let nextJids = [];
                            if (isChecked) {
                              nextJids = curJids.filter(id => id !== j.id);
                            } else {
                              nextJids = [...curJids, j.id];
                            }
                            const updated = bumans.map(x => x.id === selectedBumanForJudge.id ? { ...x, judgeIds: nextJids } : x);
                            setBumans(updated);
                            setSelectedBumanForJudge({ ...selectedBumanForJudge, judgeIds: nextJids });
                          }}
                          className={`flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer select-none ${
                            isChecked ? 'bg-[#f4f7fc] border-[#b0c4de] text-[#1b2a4a]' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}}
                              className="w-4 h-4 rounded text-primary focus:ring-primary/20 accent-[#1b2a4a] pointer-events-none"
                            />
                            <div>
                              <div className="text-[14px] font-extrabold">{j.name}</div>
                              <div className="text-[12px] text-gray-400">{j.affiliation || '소속 없음'} · {j.role || '심사위원'}</div>
                            </div>
                          </div>
                          {isChecked && (
                            <span className="text-[11px] font-bold py-0.5 px-2 bg-[#2f5488] text-white rounded-full">
                              담당
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* 모달 푸터 */}
            <div className="p-4 px-6 bg-slate-50 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setSelectedBumanForJudge(null)}
                className="h-10 px-6 rounded-xl bg-[#1b2a4a] text-white text-[14px] font-extrabold hover:bg-[#2c3e66] transition-all cursor-pointer shadow-xs"
              >
                확인 완료
              </button>
            </div>
          </div>
        </div>
      )}

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
