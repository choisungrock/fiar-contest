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
    <div className="w-screen h-screen overflow-hidden bg-[#eef1f6] text-[#2b3646] flex flex-col">
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

        {/* 우측 로그인 폼 영역 (bg-white 제거하여 부모 배경색 eef1f6 투과) */}
        <div className="flex-1 min-w-0 p-[48px] flex items-center justify-center overflow-auto">
          <div className="w-full max-w-[640px]">
            <h2 className="text-[24px] font-extrabold text-[#1b2a4a]">
              평가 시작
            </h2>
            <p className="text-[15px] text-[#6b7890] mt-[8px] font-semibold">
              평가자명을 입력하고 담당 부문을 선택하세요.
            </p>

            <form onSubmit={handleSubmit}>
              
              {/* 성명 입력 */}
              <div className="mt-[32px]">
                <label className="block text-[14px] font-bold text-textSub">
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
                <div className="text-[14px] font-bold text-textSub">
                  담당 부문 선택
                </div>

                {/* 쌀가공식품 */}
                <div className="text-[12px] font-extrabold text-brandGreen mt-[14px] mb-[8px] tracking-[1px]">
                  쌀가공식품 · 오픈테스트
                </div>
                <div className="grid grid-cols-3 gap-[10px] mt-[8px]">
                  {bumanRice.map((item) => (
                    <button
                      key={item.code}
                      type="button"
                      onClick={() => setSelectedBuman(item.code)}
                      className={`py-[16px] px-[8px] rounded-[12px] text-center border-2 transition-all cursor-pointer ${
                        selectedBuman === item.code
                          ? 'border-[#1b2a4a] bg-[#1b2a4a] text-white shadow-[0_6px_18px_rgba(27,42,74,0.22)]'
                          : 'border-[#e2e7ef] bg-white text-textSub hover:border-gray-300 shadow-none'
                      }`}
                    >
                      <div className="text-[22px] font-extrabold">{item.code}</div>
                      <div className="text-[14px] font-semibold mt-[4px]">{item.name}</div>
                    </button>
                  ))}
                </div>

                {/* 우리술 */}
                <div className="text-[12px] font-extrabold text-brandBlue mt-[18px] mb-[8px] tracking-[1px]">
                  우리술 · 블라인드
                </div>
                <div className="grid grid-cols-4 gap-[10px] mt-[8px]">
                  {bumanSul.map((item) => (
                    <button
                      key={item.code}
                      type="button"
                      onClick={() => setSelectedBuman(item.code)}
                      className={`py-[16px] px-[8px] rounded-[12px] text-center border-2 transition-all cursor-pointer ${
                        selectedBuman === item.code
                          ? 'border-[#1b2a4a] bg-[#1b2a4a] text-white shadow-[0_6px_18px_rgba(27,42,74,0.22)]'
                          : 'border-[#e2e7ef] bg-white text-textSub hover:border-gray-300 shadow-none'
                      }`}
                    >
                      <div className="text-[22px] font-extrabold">{item.title}</div>
                      <div className="text-[13px] font-semibold mt-[4px] truncate">{item.name}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 제출 버튼 */}
              <button
                type="submit"
                disabled={!isFormValid}
                className={`w-full h-[56px] rounded-[12px] text-[18px] mt-[40px] transition-all flex items-center justify-center ${
                  isFormValid
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
    </div>
  );
}

export default App;
