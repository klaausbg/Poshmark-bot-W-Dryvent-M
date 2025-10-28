# Base Node.js 18 (Debian Bullseye)
FROM node:18-bullseye

# Instala dependências que o Puppeteer precisa para rodar o Chromium
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
  && rm -rf /var/lib/apt/lists/*

# Define diretório de trabalho
WORKDIR /app

# Copia pacotes e instala dependências
COPY package*.json ./
RUN npm install --omit=dev

# Copia o restante do código
COPY . .

# Define variáveis de ambiente padrão (caso precise)
ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=false \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Roda seu bot
CMD ["node", "hyvent.js"]
