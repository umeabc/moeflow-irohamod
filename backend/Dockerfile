# 不使用 # syntax=docker/dockerfile:1：该指令触发 BuildKit 从 Docker Hub 拉取语法镜像，
# 在无法访问 auth.docker.io 的网络（如内网测试机）下构建直接超时；默认前端已支持多阶段构建。

# ============================================================================
# Stage 1: Builder - Install dependencies and compile translations
# ============================================================================
FROM python:3.11-slim AS builder

# Install only essential build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    make \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir --user -r /tmp/requirements.txt

# Copy application code
COPY . /app
WORKDIR /app

# Compile translation files (.po -> .mo)
RUN BIN_PREFIX=/root/.local/bin make babel-update-mo

# ============================================================================
# Stage 2: Runtime - Minimal production image
# ============================================================================
FROM python:3.11-slim

LABEL project="moeflow-backend"

# Install only runtime dependencies (for Pillow, cryptography, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libjpeg62-turbo \
    libpng16-16 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Copy Python packages from builder
COPY --from=builder /root/.local /root/.local

# Copy application code (excluding tests)
COPY --from=builder /app /app

# Remove test directory to save space
RUN rm -rf /app/tests /app/.pytest_cache /app/.ruff_cache

WORKDIR /app

# Make sure scripts in .local are usable
ENV PATH=/root/.local/bin:$PATH

# Build metadata
ARG MOEFLOW_BUILD_ID=unknown
ENV MOEFLOW_BUILD_ID=${MOEFLOW_BUILD_ID}

EXPOSE 5000
