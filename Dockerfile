# --- build stage: compile TypeScript, no Chrome download needed here ---
FROM node:24-slim AS build
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- runtime stage: official Puppeteer image, matching Chrome preinstalled ---
FROM ghcr.io/puppeteer/puppeteer:25.3.0 AS runtime
WORKDIR /home/pptruser/app

# Puppeteer's postinstall reuses the browser already cached in this image's
# $HOME/.cache/puppeteer as long as the puppeteer version in package.json
# matches the image tag above, so this install needs no network access.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY public ./public

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/health', r => process.exit(r.statusCode===200?0:1)).on('error', () => process.exit(1))"

CMD ["node", "dist/server.js"]
