FROM node:20-alpine

WORKDIR /app

COPY auth-service/package*.json ./
RUN npm ci --omit=dev

COPY auth-service/server.js ./
COPY utils/logger.js /utils/logger.js

ENV NODE_ENV=production
EXPOSE 5001

USER node
CMD ["node", "server.js"]
