# Build from the repository root:  docker build -f apps/api/Dockerfile -t roofdesk-api .
FROM node:22-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo
COPY . .
# Use --frozen-lockfile once pnpm-lock.yaml is committed, so every build installs exactly the same versions.
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @roofdesk/api build
# A trimmed copy of the API's production dependencies only.
RUN pnpm --filter @roofdesk/api deploy --prod /out

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
# Uploaded files live here when STORAGE_DRIVER=local. Mount a volume on it.
RUN mkdir -p /app/storage && chown node:node /app/storage
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
