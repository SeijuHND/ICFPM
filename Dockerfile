FROM ghcr.io/puppeteer/puppeteer:22.12.1

ENV puppeteer_skip_chromium_download=true
    puppeteer_executable_path=/usr/bin/google-chrome-stable

workdir /usr/src/app
copy package.json package-lock.json ./
run npm ci
copy . .
CMD ["node", "test.js"]