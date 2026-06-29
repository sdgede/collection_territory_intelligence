# Step 1: Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package lock and configurations
COPY package*.json tsconfig.json vite.config.ts ./

# Install development dependencies
RUN npm ci

# Copy codebase
COPY . .

# Run production build (compiles react app and bundles express server)
RUN npm run build

# Step 2: Production runner stage
FROM node:20-alpine

WORKDIR /app

# Copy package definitions
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy compiled bundles from the builder stage
COPY --from=builder /app/dist ./dist

# Expose port (Cloud Run defaults to 8080)
EXPOSE 8080
ENV PORT=8080
ENV NODE_ENV=production

# Run the bundled commonjs express server
CMD ["node", "dist/server.cjs"]
