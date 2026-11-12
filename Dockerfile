# Imagem única: web (npm start) ou worker (npm run worker). Chromium só é necessário se um conector usar Playwright (nenhum hoje).
FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build:docker
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
