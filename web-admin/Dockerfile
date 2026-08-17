# K-라이스페스타 관리자 콘솔 Nginx 멀티스테이지 Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

ARG VITE_API_URL
ARG VITE_ADMIN_API_SECRET
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_ADMIN_API_SECRET=$VITE_ADMIN_API_SECRET

COPY . .
RUN npm run build

FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
