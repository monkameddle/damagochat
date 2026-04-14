# Build stage
FROM node:22-slim AS builder
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

# Single npm install; prune dev deps after build so runner copies only prod modules
RUN npm ci --no-audit --fund=false
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src/
RUN npm run build

# Remove dev deps in-place to keep the copied node_modules lean
RUN npm prune --omit=dev

# Production stage
FROM node:22-slim AS runner
WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

RUN groupadd -g 1001 app && useradd -u 1001 -g app -s /bin/sh -m app

# Copy everything from builder — no second npm install needed
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/dist ./dist
COPY prisma ./prisma/
COPY package.json ./

RUN chown -R app:app /app
USER app

EXPOSE 3000
CMD ["node", "dist/main.js"]
