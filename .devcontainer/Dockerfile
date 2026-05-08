FROM node:20.9.0-bookworm

# Install system dependencies needed for Playwright/Cypress browser testing and general development
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    wget \
    unzip \
    build-essential \
    libssl-dev \
    ca-certificates \
    # Playwright/Chromium dependencies
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install Yarn 1.22.22 globally (--force needed because node:bookworm ships with yarn)
RUN npm install -g yarn@1.22.22 --force

# Install Bun globally (latest stable) and make it accessible to all users
RUN curl -fsSL https://bun.sh/install | bash \
    && mv /root/.bun/bin/bun /usr/local/bin/bun \
    && chmod 755 /usr/local/bin/bun

# Install Playwright browser dependencies
RUN npx --yes playwright install-deps chromium

WORKDIR /workspaces/Viewers

# Pre-create the node_modules directory with node ownership so the Docker
# volume mounted at this path initializes with the correct permissions.
RUN mkdir -p /workspaces/Viewers/node_modules && chown node:node /workspaces/Viewers/node_modules

# Use the non-root node user for security
USER node
