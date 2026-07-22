// 관리자 로그인 기능 수행을 위한 비즈니스 로직 및 API 연동 스크립트

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginForm");
  
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      const email = document.getElementById("email").value;
      const password = document.getElementById("password").value;
      
      try {
        // 백엔드 API (api.aaa.com 목적 포트 18000) 호출 검증 테스트
        const response = await fetch("http://localhost:18000/api/admin/groups");
        
        if (!response.ok) {
          throw new Error(`HTTP 통신 에러: ${response.status}`);
        }
        
        const data = await response.json();
        console.log("백엔드 응답 데이터:", data);
        alert(`로그인 시뮬레이션 성공!\n백엔드 통신 결과: ${data.message}`);
      } catch (err) {
        console.error("API 호출 실패:", err);
        alert("백엔드 API 서버와 통신할 수 없습니다. 콘솔 로그를 확인하세요.");
      }
    });
  }
});
