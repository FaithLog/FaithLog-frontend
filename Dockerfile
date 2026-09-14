FROM node:26.8-bookworm-slim@sha256:cd9f682fa2885cd1056e830424764158570061c59736a1da836bc3d73df095ae

WORKDIR /app

ENV CI=1
ENV EXPO_NO_TELEMETRY=1

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 8081 19000 19001 19002

CMD ["npm", "run", "start"]
