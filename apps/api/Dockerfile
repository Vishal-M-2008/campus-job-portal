FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN npm install
COPY . .
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["sh", "-c", "npx knex migrate:latest && npx tsx src/index.ts"]
