# Приложение «Верста»: веб и API в одном контейнере (F-04).
# Сборка из корня репозитория: docker build -f infra/app.Dockerfile .
FROM node:22-slim AS build
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/calc/package.json packages/calc/
COPY packages/route-format/package.json packages/route-format/
# Необязательный корневой сертификат для сборки за прокси с подменой TLS:
# docker build --secret id=extra_ca,src=/путь/ca.crt ...
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @versta/web build && pnpm --filter @versta/api build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080 WEB_DIR=/app/web TILES_DIR=/tiles
COPY --from=build /src/apps/api/dist/server.js ./server.js
COPY --from=build /src/apps/web/dist ./web
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
