// K-라이스페스타 전문가 품평회 관리자 로그인 화면 React 컴포넌트
import React, { useState } from 'react';

function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      // 백엔드 API (api.aaa.com 목적 포트 18000) 호출 검증 테스트
      const response = await fetch("http://localhost:18000/api/admin/groups");
      
      if (!response.ok) {
        throw new Error(`HTTP 통신 에러: ${response.status}`);
      }
      
      const data = await response.json();
      console.log("백엔드 응답 데이터:", data);
      alert(`로그인 성공! (Tailwind React 컴포넌트 연동)\n백엔드 응답: ${data.message}`);
    } catch (err) {
      console.error("API 호출 실패:", err);
      alert("백엔드 API 서버와 통신할 수 없습니다. 콘솔 로그를 확인하세요.");
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-primary-dark to-sidebar-bg p-5">
      <div className="w-full max-w-[480px] bg-white/5 border border-white/10 rounded-[24px] p-10 md:p-12 shadow-2xl backdrop-blur-md text-center">
        
        {/* 브랜딩 영역 */}
        <div className="mb-9">
          <div className="text-xs font-bold text-accent-gold tracking-[3px] uppercase">
            Admin Console
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white mt-2.5 leading-normal">
            전문가 품평회<br />관리 시스템
          </h1>
          <p className="text-sm text-textBlue mt-2 font-medium">
            2026 우리쌀·우리술 K-라이스페스타
          </p>
        </div>

        {/* 로그인 폼 */}
        <form onSubmit={handleSubmit} className="text-left">
          <div className="mb-5">
            <label className="block text-xs font-bold text-textBlue mb-2">
              관리자 이메일 주소
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-[52px] bg-white/5 border border-white/15 rounded-xl px-4 text-white text-base font-medium placeholder-gray-500 focus:outline-none focus:bg-white/10 focus:border-accent-gold focus:ring-1 focus:ring-accent-gold transition-all"
              placeholder="admin@ricefesta.kr"
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
              className="w-full h-[52px] bg-white/5 border border-white/15 rounded-xl px-4 text-white text-base font-medium placeholder-gray-500 focus:outline-none focus:bg-white/10 focus:border-accent-gold focus:ring-1 focus:ring-accent-gold transition-all"
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="w-full h-[54px] bg-accent-red hover:bg-accent-red-hover active:translate-y-[1px] text-white font-extrabold text-base rounded-xl mt-3 shadow-[0_4px_15px_rgba(224,59,59,0.3)] hover:shadow-[0_6px_20px_rgba(224,59,59,0.4)] transition-all cursor-pointer"
          >
            로그인
          </button>

          {/* 추가 행 */}
          <div className="flex items-center justify-between mt-[18px] text-xs font-semibold text-textBlue">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-3.5 h-3.5 accent-accent-gold cursor-pointer"
              />
              로그인 상태 유지
            </label>
            <a
              href="#"
              onClick={(e) => { e.preventDefault(); alert("품평회 운영국에 문의해 주시기 바랍니다."); }}
              className="text-accent-gold hover:text-yellow-200 hover:underline"
            >
              비밀번호 찾기
            </a>
          </div>
        </form>

        {/* 안내 문구 */}
        <div className="mt-12 text-[10px] text-gray-500 leading-relaxed">
          본 시스템은 승인된 품평회 관리자만 접근할 수 있습니다.<br />
          © 2026 우리쌀우리술 K-라이스페스타. All Rights Reserved.
        </div>

      </div>
    </div>
  );
}

export default App;
