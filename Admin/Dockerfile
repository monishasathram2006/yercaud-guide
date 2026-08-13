# Node >=22.12 required by @tanstack/react-start.
FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .

EXPOSE 5174

CMD ["npm", "run", "dev"]
