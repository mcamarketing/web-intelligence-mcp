# Web Intelligence MCP Server - Apify Actor Dockerfile
# Build: 2

FROM node:20-slim

# Install dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-freefont-ttf \
    libharfbuzz0b \
    libnss3 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set Puppeteer to use system Chrome
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Create app directory
WORKDIR /usr/src/app

# Copy package files first (for better caching)
COPY package*.json tsconfig.json ./

# Install ALL dependencies (including devDependencies for TypeScript build)
RUN npm ci

# Copy source code
COPY src ./src
COPY .actor ./.actor

# Build TypeScript - this creates the dist folder
RUN npm run build && ls -la dist/

# Verify main.js exists
RUN test -f dist/main.js && echo "Build successful: dist/main.js exists"

# Expose port (Apify sets APIFY_WEB_SERVER_PORT)
EXPOSE 3000

# Start the Actor
CMD ["node", "dist/main.js"]
