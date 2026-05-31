# ── Stage 1: Build ──────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ARG VITE_API_URL=https://campussanchalika.iitgn.ac.in/api
ENV VITE_API_URL=$VITE_API_URL

# Build with injected production env
RUN npm run build

# ── Stage 2: Serve static files ─────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

RUN npm install -g serve@14

# Copy only the built output
COPY --from=builder /app/dist ./dist

EXPOSE 5173

# serve the dist folder; nginx strips the /admin prefix before proxying
CMD ["serve", "-s", "dist", "-l", "5173"]
