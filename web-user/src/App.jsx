// K-라이스페스타 전문가 품평회 평가자 로그인 화면 React 컴포넌트
import React, { useState } from 'react';

function App() {
  const [judgeName, setJudgeName] = useState('');
  const [selectedBuman, setSelectedBuman] = useState('');

  const bumanRice = [
    { code: 'A', name: '조리' },
    { code: 'B', name: '비조리' },
    { code: 'C', name: '농협' }
  ];

  const bumanSul = [
    { code: 'ga', name: '저도발효주', title: '가' },
    { code: 'na', name: '고도발효주', title: '나' },
    { code: 'da', name: '약·청주', title: '다' },
    { code: 'ra', name: '증류주', title: '라' }
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!judgeName.trim() || !selectedBuman) return;

    try {
      // 백엔드 API (api.aaa.com 목적 포트 18000) 호출 검증 테스트
      const response = await fetch("http://localhost:18000/api/user/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ judgeName, buman: selectedBuman })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP 통신 에러: ${response.status}`);
      }
      
      const data = await response.json();
      console.log("백엔드 응답 데이터:", data);
      alert(`로그인 성공! (Tailwind React 컴포넌트 연동)\n심사위원: ${data.judgeName}\n부문: ${data.buman}`);
    } catch (err) {
      console.error("API 호출 실패:", err);
      alert("백엔드 API 서버와 통신할 수 없습니다. 콘솔 로그를 확인하세요.");
    }
  };

  const isFormValid = judgeName.trim().length > 0 && selectedBuman !== '';

  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row bg-[#eef1f6] text-[#2b3646]">
      
      {/* 좌측 배너 영역 */}
      <div className="w-full md:w-[40%] md:min-w-[380px] bg-gradient-to-b from-primary-dark to-secondary-dark text-white p-12 md:p-14 flex flex-col justify-between">
        <div>
          <div className="text-xs font-bold tracking-[3px] text-accent-gold uppercase">
            Expert Evaluation
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold mt-5 leading-snug">
            전문가 품평회<br />평가 시스템
          </h1>
          <p className="text-base md:text-lg text-text-blue mt-5 leading-relaxed font-medium">
            2026 우리쌀·우리술<br />K-라이스페스타 품평회
          </p>
        </div>
        <div className="text-xs md:text-sm text-[#8fa1c4] mt-10 md:mt-0 leading-relaxed font-medium">
          태블릿 전용 · 블라인드/오픈 테스트<br />
          5단계 척도법 · 120점 만점
        </div>
      </div>

      {/* 우측 로그인 폼 영역 */}
      <div className="flex-1 bg-white p-8 md:p-14 flex items-center justify-center">
        <div className="w-full max-w-[580px]">
          <h2 className="text-2xl md:text-3xl font-extrabold text-primary-dark">
            평가 시작
          </h2>
          <p className="text-sm md:text-base text-gray-500 mt-2 font-medium">
            평가자명을 입력하고 담당 부문을 선택하세요.
          </p>

          <form onSubmit={handleSubmit}>
            
            {/* 성명 입력 */}
            <div className="mt-8">
              <label className="block text-sm font-bold text-gray-700">
                평가자 (심사위원 성명)
              </label>
              <input
                type="text"
                value={judgeName}
                onChange={(e) => setJudgeName(e.target.value)}
                className="mt-2.5 w-full h-14 border-1.5 border-[#cbd3e1] rounded-xl px-4.5 text-lg font-semibold text-primary-dark focus:outline-none focus:border-primary-dark transition-all"
                placeholder="예) 홍길동 심사위원"
                required
              />
            </div>

            {/* 부문 선택 */}
            <div className="mt-8">
              <label className="block text-sm font-bold text-gray-700">
                담당 부문 선택
              </label>

              {/* 쌀가공식품 */}
              <div className="text-xs font-bold text-matrix-green mt-4.5 mb-2.5 tracking-wider">
                쌀가공식품 · 오픈테스트
              </div>
              <div className="grid grid-cols-3 gap-2.5 mb-4">
                {bumanRice.map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => setSelectedBuman(item.code)}
                    className={`py-3.5 px-2 rounded-xl text-center border-2 transition-all cursor-pointer ${
                      selectedBuman === item.code
                        ? 'border-primary-dark bg-primary-dark text-white shadow-lg'
                        : 'border-[#e2e7ef] bg-white text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-xl font-extrabold">{item.code}</div>
                    <div className="text-xs font-semibold mt-1">{item.name}</div>
                  </button>
                ))}
              </div>

              {/* 우리술 */}
              <div className="text-xs font-bold text-matrix-blue mt-4.5 mb-2.5 tracking-wider">
                우리술 · 블라인드
              </div>
              <div className="grid grid-cols-4 gap-2.5">
                {bumanSul.map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => setSelectedBuman(item.code)}
                    className={`py-3.5 px-2 rounded-xl text-center border-2 transition-all cursor-pointer ${
                      selectedBuman === item.code
                        ? 'border-primary-dark bg-primary-dark text-white shadow-lg'
                        : 'border-[#e2e7ef] bg-white text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-xl font-extrabold">{item.title}</div>
                    <div className="text-[10px] md:text-xs font-semibold mt-1 truncate">{item.name}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 제출 버튼 */}
            <button
              type="submit"
              disabled={!isFormValid}
              className={`w-full h-14 rounded-xl text-lg font-bold mt-10 transition-all cursor-pointer flex items-center justify-center ${
                isFormValid
                  ? 'bg-primary-dark hover:bg-secondary-dark text-white shadow-lg hover:shadow-xl'
                  : 'bg-[#c3ccdb] text-white cursor-not-allowed'
              }`}
            >
              평가 시작하기 →
            </button>

          </form>
        </div>
      </div>

    </div>
  );
}

export default App;
