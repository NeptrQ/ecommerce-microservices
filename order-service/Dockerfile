FROM node:20-alpine

WORKDIR /app

COPY order-service/package*.json ./
RUN npm ci --omit=dev

COPY order-service/server.js ./
COPY utils/logger.js /utils/logger.js

ENV NODE_ENV=production
EXPOSE 5004

USER node
CMD ["node", "server.js"]
