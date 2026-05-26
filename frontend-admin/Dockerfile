# ── Stage 1: Build ──────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Build with production env (picks up .env.production)
RUN npm run build

# ── Stage 2: Serve static files ─────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

RUN npm install -g serve

# Copy only the built output
COPY --from=builder /app/dist ./dist

EXPOSE 5173

# serve the dist folder; nginx strips the /admin prefix before proxying
CMD ["serve", "dist", "-l", "5173", "--single"]
