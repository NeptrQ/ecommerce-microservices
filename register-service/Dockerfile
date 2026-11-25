FROM node:20-alpine

WORKDIR /app

COPY register-service/package*.json ./
RUN npm ci --omit=dev

COPY register-service/server.js ./
COPY utils/logger.js /utils/logger.js

ENV NODE_ENV=production
EXPOSE 5003

USER node
CMD ["node", "server.js"]
 