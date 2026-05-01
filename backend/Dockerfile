# ── Stage 1: Builder ────────────────────────────────────────────────────────
# Use standard Node.js 20 on Ubuntu Jammy (same OS as before, just official image)
FROM node:20 AS builder

WORKDIR /app

# Copy package files first — Docker caches this layer.
# npm install only re-runs if package.json changes (fast rebuilds!)
COPY package*.json ./

# Install ALL deps including devDependencies (needed to compile TypeScript)
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Compile TypeScript → JavaScript into /app/dist
RUN npm run build
# Copy raw SQL files since tsc ignores them
RUN cp -r src/database/migrations dist/database/migrations && \
    cp -r src/database/seeds dist/database/seeds


# ── Stage 2: Production Runner ───────────────────────────────────────────────
# Fresh Node image — no devDependencies or TypeScript source in the final image
FROM node:20 AS runner

WORKDIR /app

# Install system-level dependencies that Playwright/Chromium needs on Linux
# This is what the Microsoft Playwright image used to do for us automatically
RUN apt-get update && apt-get install -y \
    libnss3 libnspr4 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 \
    libatspi2.0-0 libx11-6 libxcb1 libxext6 fonts-liberation \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

# Install only production Node dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Set Playwright browser path — must match the PLAYWRIGHT_BROWSERS_PATH env var
# in docker-compose.yml so the app finds the browser at runtime
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx playwright install chromium

# Copy compiled JavaScript from the builder stage
COPY --from=builder /app/dist ./dist

# Create session-store directory (overridden by Docker volume mount at runtime)
RUN mkdir -p session-store

# Expose the API port
EXPOSE 3000

# Health check — Docker monitors this every 30s after startup
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start the server
CMD ["node", "dist/server.js"]
