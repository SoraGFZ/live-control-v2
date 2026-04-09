FROM node:22-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/src ./src
ENV NODE_ENV=production
ENV PORT=8080
ENV LIVE_CONTROL_STORAGE_DIR=/data
EXPOSE 8080
CMD ["npm", "run", "start"]
