# FastAPI 백엔드 애플리케이션의 컨테이너 이미지를 빌드하는 설정 파일
FROM python:3.10-slim

WORKDIR /app

# 시스템 라이브러리 설치 (필요시 컴파일 대비)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
