FROM node:24.15.0-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4181 DB_PATH=/data/shopping.sqlite
WORKDIR /app
RUN mkdir -p /data && chown node:node /data
COPY package.json ./
COPY server/ server/
COPY shared/ shared/
USER node
EXPOSE 4181
CMD ["node", "server/index.ts"]
