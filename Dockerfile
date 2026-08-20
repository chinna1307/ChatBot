# ── Stage 1: deps ────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Copy manifests first for maximum layer-cache reuse
COPY package.json package-lock.json ./

# Install production-only dependencies
RUN npm ci --omit=dev

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

# Security: run as non-root
RUN addgroup -S jarvis && adduser -S jarvis -G jarvis

WORKDIR /app

# Copy production node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source (excludes everything in .dockerignore)
COPY package.json ./
COPY server.js    ./
COPY public/      ./public/

# Drop to non-root user
USER jarvis

# Render (and most cloud platforms) inject $PORT at runtime.
# Default to 10000 so `docker run` without -e PORT also works.
ENV PORT=10000
ENV NODE_ENV=production

EXPOSE 10000

# Use the existing start script from package.json
CMD ["node", "server.js"]
