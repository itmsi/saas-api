# Satu image untuk dua proses:
#   saas-api    -> npm run start:api    (default)
#   saas-worker -> npm run start:worker
# ---------- Stage 1: install dependency produksi ----------
FROM node:22-alpine AS deps
WORKDIR /app

# toolchain cadangan jika bcrypt perlu di-compile (tidak ikut ke image akhir)
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---------- Stage 2: runtime ----------
FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production \
    PORT=9061 \
    TZ=Asia/Jakarta

# postgresql-client: pg_dump untuk backup deprovision (worker)
RUN apk add --no-cache tzdata postgresql16-client

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src

RUN mkdir -p /backups && chown node:node /backups

USER node
EXPOSE 9061 3100

CMD ["node", "src/api.js"]
