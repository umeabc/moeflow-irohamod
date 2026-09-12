# 多阶段构建：imgstore（Go 单二进制，最终镜像 ~8MB）
FROM golang:1.22-alpine AS build
WORKDIR /src
COPY go.mod main.go ./
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /imgstore .

FROM scratch
COPY --from=build /imgstore /imgstore
# 数据目录（Dockerfile 无法 mkdir scratch 镜像，由入口脚本创建）
VOLUME /data
EXPOSE 8080
ENV IMGSTORE_DATA_DIR=/data \
    IMGSTORE_LISTEN=:8080
ENTRYPOINT ["/imgstore"]
