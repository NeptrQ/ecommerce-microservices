FROM node:20-alpine

WORKDIR /app

COPY login-service/package*.json ./
RUN npm ci --omit=dev

COPY login-service/server.js ./
COPY utils/logger.js /utils/logger.js

ENV NODE_ENV=production
EXPOSE 5002

USER node
CMD ["node", "server.js"]
