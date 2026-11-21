# The VranceFlex voice worker. Build from the repository root so the shared call
# rules in lib/domain are included:
#   docker build -f voice-worker/Dockerfile -t vranceflex-voice-worker .
FROM node:24-slim
WORKDIR /app
COPY voice-worker/package.json voice-worker/package-lock.json ./voice-worker/
RUN cd voice-worker && npm ci --omit=dev
COPY voice-worker ./voice-worker
COPY lib/domain/voice.ts lib/domain/voice-signature.ts ./lib/domain/
WORKDIR /app/voice-worker
ENV NODE_ENV=production
CMD ["node", "--import", "tsx", "src/main.ts", "start"]
