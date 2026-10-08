# ReQuora backend — Node/Express API
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Data and uploaded photos should live on a mounted volume in production
# (see docker-compose.yml) so they survive container rebuilds.
RUN mkdir -p /app/data /app/uploads

EXPOSE 5000
CMD ["node", "server.js"]
