# Build stage
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src/
RUN npm run build

# Production stage
FROM node:22-alpine AS runner
WORKDIR /app

RUN addgroup -g 1000 app && adduser -u 1000 -G app -s /bin/sh -D app

# Only production deps
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy generated Prisma client and compiled output
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/dist ./dist
COPY prisma ./prisma/

RUN chown -R app:app /app
USER app

EXPOSE 3000
CMD ["node", "dist/main.js"]
