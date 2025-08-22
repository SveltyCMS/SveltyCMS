# Multi-stage build for SveltyCMS
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY . .

# Generate SvelteKit files and build
RUN npx svelte-kit sync && npm run build

# Production stage
FROM node:20-alpine AS production

# Add non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S sveltycms -u 1001

# Set working directory
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder --chown=sveltycms:nodejs /app/build ./build
COPY --from=builder --chown=sveltycms:nodejs /app/package*.json ./
COPY --from=builder --chown=sveltycms:nodejs /app/node_modules ./node_modules

# Copy additional necessary files
COPY --from=builder --chown=sveltycms:nodejs /app/static ./static
COPY --from=builder --chown=sveltycms:nodejs /app/config ./config

# Create directories for uploads and logs
RUN mkdir -p /app/uploads /app/logs && chown -R sveltycms:nodejs /app/uploads /app/logs

# Switch to non-root user
USER sveltycms

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node --version || exit 1

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Start the application
CMD ["node", "build/index.js"]