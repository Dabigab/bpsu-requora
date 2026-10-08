FROM node:20-alpine

WORKDIR /app

COPY backend/package*.json ./

RUN npm install --omit=dev

COPY backend/ ./backend/
COPY frontend/ ./frontend/

RUN mkdir -p /app/data /app/uploads

EXPOSE 5000

CMD ["node", "backend/server.js"]