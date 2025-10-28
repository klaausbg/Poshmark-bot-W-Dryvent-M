# Base Node.js 18
FROM node:18-bullseye

# Instala dependências do Chromium
RUN apt-get update && apt-get install -y \
  libnss3 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  libgbm1 \
  libasound2 \
  libgtk-3-0 \
  libxshmfence1 \
  libglu1-mesa \
  fonts-liberation \
  libappindicator3-1 \
  xdg-utils \
  chromium \
  && rm -rf /var/lib/apt/lists/*

# Define diretório de trabalho
WORKDIR /app

# Copia arquivos e instala dependências
COPY package*.json ./
RUN npm ci

# Copia o resto do código
COPY . .

# Comando de inicialização
CMD ["node", "hyvent.js"]
