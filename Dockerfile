FROM oven/bun:1.1.20

WORKDIR /app
COPY package.json bunfig.toml ./
RUN bun install

COPY src ./src
COPY spec ./spec
COPY src/sql/schema.sql ./src/sql/schema.sql

EXPOSE 3000
CMD ["bun", "run", "dev"]
