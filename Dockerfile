# Multi-stage Dockerfile for Angular SSR Application

# Stage 1: Build Stage
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies) for building
RUN npm ci && npm cache clean --force

# Copy source code
COPY . .

# Build the application for production
RUN npm run build:prod

# Stage 2: Production Stage
FROM node:20-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app directory and user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S angular -u 1001

# Set working directory
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder --chown=angular:nodejs /app/dist ./dist
COPY --from=builder --chown=angular:nodejs /app/package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Environment variables with defaults
ENV NODE_ENV=production
ENV PORT=4000
ENV OPENCAGE_API_KEY=""
ENV API_BASE_URL=""
ENV MAP_TILE_URL="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
ENV APP_VERSION="1.0.0"
ENV APP_NAME="Fervo Weather"

# Switch to non-root user
USER angular

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "const http = require('http'); \
    const options = { hostname: 'localhost', port: 4000, path: '/', timeout: 2000 }; \
    const req = http.request(options, (res) => { \
    if (res.statusCode === 200) process.exit(0); \
    else process.exit(1); \
    }); \
    req.on('error', () => process.exit(1)); \
    req.on('timeout', () => process.exit(1)); \
    req.end();"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/fervo-weather/server/server.mjs"]

# Stage 3: Development Stage (optional)
FROM node:20-alpine AS development

# Install development dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Expose development port
EXPOSE 4200

# Start development server
CMD ["npm", "run", "start", "--", "--host", "0.0.0.0", "--port", "4200"]