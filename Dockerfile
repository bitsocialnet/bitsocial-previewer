# Debian-slim (not alpine): pkc-js pulls in heavy libp2p deps that are happiest
# on glibc. Node 22+ is required: pkc-js depends on undici@8, which needs
# node >=22.19 (on node 20 it crashes with "markAsUncloneable is not a function").
FROM node:22-bookworm-slim

WORKDIR /app

# Install production deps first for better layer caching.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

ENV NODE_ENV=production
EXPOSE 3924

CMD ["node", "start.js"]
