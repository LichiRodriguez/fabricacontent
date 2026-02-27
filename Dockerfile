FROM node:20-slim

WORKDIR /app

# Install build tools for better-sqlite3
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --production

COPY . .

# Create data directory
RUN mkdir -p /app/data

ENV DB_PATH=/app/data/factory.db

EXPOSE 3000

CMD ["node", "index.js"]
