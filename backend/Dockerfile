FROM oven/bun:1-alpine AS dependencies

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1-alpine AS runtime

WORKDIR /app

ENV HOST=0.0.0.0 \
    NODE_ENV=production \
    PORT=3000

COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json bun.lock tsconfig.json ./
COPY src ./src

RUN mkdir -p /app/data/documents && chown -R bun:bun /app

USER bun

EXPOSE 3000

CMD ["bun", "run", "start"]
