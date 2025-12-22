# =============================================================================
# Dockerfile - Quant Trading System
# Multi-stage build for production-ready container
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Dependencies Builder
# Install all dependencies including native modules
# -----------------------------------------------------------------------------
FROM node:20-alpine AS deps-builder

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install pnpm and dependencies
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --frozen-lockfile --prod=false

# -----------------------------------------------------------------------------
# Stage 2: Production Dependencies
# Separate production dependencies for smaller final image
# -----------------------------------------------------------------------------
FROM node:20-alpine AS prod-deps

RUN apk add --no-cache \
    python3 \
    make \
    g++

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --frozen-lockfile --prod

# -----------------------------------------------------------------------------
# Stage 3: Test Runner (optional, for CI)
# -----------------------------------------------------------------------------
FROM node:20-alpine AS test

RUN apk add --no-cache \
    python3 \
    make \
    g++

WORKDIR /app

COPY --from=deps-builder /app/node_modules ./node_modules
COPY . .

# Run linting and tests
RUN corepack enable && corepack prepare pnpm@latest --activate
CMD ["pnpm", "test"]

# -----------------------------------------------------------------------------
# Stage 4: Production Runtime
# Minimal production image
# -----------------------------------------------------------------------------
FROM node:20-alpine AS production

# Security: Run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# Install runtime dependencies only
RUN apk add --no-cache \
    # For health checks
    curl \
    # For timezone support
    tzdata \
    # For better-sqlite3 runtime
    libstdc++ \
    # For DNS resolution
    bind-tools

# Set timezone
ENV TZ=Asia/Shanghai
RUN cp /usr/share/zoneinfo/$TZ /etc/localtime && \
    echo $TZ > /etc/timezone

WORKDIR /app

# Copy production dependencies
COPY --from=prod-deps /app/node_modules ./node_modules

# Copy application source
COPY --chown=nodejs:nodejs package.json ./
COPY --chown=nodejs:nodejs src/ ./src/
COPY --chown=nodejs:nodejs config/ ./config/
COPY --chown=nodejs:nodejs scripts/ ./scripts/

# Create necessary directories
RUN mkdir -p logs data backups && \
    chown -R nodejs:nodejs logs data backups

# Switch to non-root user
USER nodejs

# Environment variables
ENV NODE_ENV=production
ENV LOG_LEVEL=info

# Expose ports
# Main API port
EXPOSE 3000
# Metrics port
EXPOSE 9091
# WebSocket port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Default command - can be overridden
CMD ["node", "src/main.js", "shadow"]

# -----------------------------------------------------------------------------
# Stage 5: Development Runtime
# Full development environment with hot reload
# -----------------------------------------------------------------------------
FROM node:20-alpine AS development

RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    curl \
    tzdata

ENV TZ=Asia/Shanghai
RUN cp /usr/share/zoneinfo/$TZ /etc/localtime

WORKDIR /app

# Copy all dependencies (including dev)
COPY --from=deps-builder /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=development

EXPOSE 3000 9091 8080

CMD ["node", "--watch", "src/main.js", "shadow", "--verbose"]
