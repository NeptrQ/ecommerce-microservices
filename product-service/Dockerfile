FROM node:20-alpine

WORKDIR /app

COPY product-service/package*.json ./
RUN npm ci --omit=dev

COPY product-service/server.js ./
COPY utils/logger.js /utils/logger.js

ENV NODE_ENV=production
EXPOSE 5005

USER node
CMD ["node", "server.js"]
