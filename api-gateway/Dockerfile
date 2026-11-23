FROM node:20-alpine

WORKDIR /app

COPY api-gateway/package*.json ./
RUN npm ci --omit=dev

COPY api-gateway/server.js ./
COPY utils/logger.js /utils/logger.js

ENV NODE_ENV=production
EXPOSE 5000

USER node
CMD ["node", "server.js"]