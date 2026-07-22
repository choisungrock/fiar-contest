// 평가자 로그인 동작 제어 및 백엔드 API 연동을 위한 스크립트 파일

document.addEventListener("DOMContentLoaded", () => {
  let selectedBuman = "";
  const bumanButtons = document.querySelectorAll(".btn-buman");
  const judgeNameInput = document.getElementById("judgeName");
  const submitBtn = document.getElementById("submitBtn");
  const evaluationForm = document.getElementById("evaluationForm");

  // 부문 버튼 클릭 핸들러
  if (bumanButtons) {
    bumanButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        bumanButtons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        selectedBuman = btn.getAttribute("data-buman");
        checkFormValidity();
      });
    });
  }

  // 폼 입력 변화 핸들러
  if (judgeNameInput) {
    judgeNameInput.addEventListener("input", checkFormValidity);
  }

  function checkFormValidity() {
    if (!judgeNameInput || !submitBtn) return;
    
    const nameValid = judgeNameInput.value.trim().length > 0;
    const bumanValid = selectedBuman !== "";
    
    if (nameValid && bumanValid) {
      submitBtn.classList.add("active");
      submitBtn.removeAttribute("disabled");
    } else {
      submitBtn.classList.remove("active");
      submitBtn.setAttribute("disabled", "true");
    }
  }

  // 제출 처리
  if (evaluationForm) {
    evaluationForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      const judgeName = judgeNameInput.value.trim();
      
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
        alert(`로그인 성공!\n심사위원: ${data.judgeName}\n부문: ${data.buman}`);
      } catch (err) {
        console.error("API 호출 실패:", err);
        alert("백엔드 API 서버와 연결할 수 없습니다. 콘솔 로그를 확인하세요.");
      }
    });
  }
});
