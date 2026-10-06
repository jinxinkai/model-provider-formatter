# syntax=docker/dockerfile:1

# ── Build the Vue frontend ──
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY vite.config.js ./
COPY web ./web
COPY src ./src
COPY server ./server
RUN npm run build

# ── Runtime: Koa + production deps only ──
FROM node:22-alpine
LABEL org.opencontainers.image.source="https://github.com/jinxinkai/model-provider-formatter"
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=15178
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server ./server
COPY src ./src
COPY bin ./bin
COPY --from=build /app/dist ./dist

USER node
EXPOSE 15178

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
