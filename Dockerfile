FROM node:24.16.0-bookworm-slim
LABEL org.opencontainers.image.source="https://github.com/mot1us/ornament" \
      org.opencontainers.image.title="Ornament" \
      org.opencontainers.image.description="Self-hosted Secret Santa for family and friends." \
      org.opencontainers.image.licenses="MIT"
WORKDIR /app
COPY package*.json ./
COPY LICENSE ./LICENSE
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
COPY --chown=node:node scripts ./scripts
RUN mkdir -p /data /backups && chown node:node /data /backups
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3080 DATA_DIR=/data
EXPOSE 3080
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "fetch('http://127.0.0.1:3080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
