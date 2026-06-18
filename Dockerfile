FROM node:22.13.1-bookworm-slim

WORKDIR /app

ENV CI=1
ENV EXPO_NO_TELEMETRY=1

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 8081 19000 19001 19002

CMD ["npm", "run", "start", "--", "--host", "0.0.0.0"]
