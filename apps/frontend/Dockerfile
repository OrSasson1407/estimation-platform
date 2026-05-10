FROM node:18-alpine AS builder
WORKDIR /usr/src/app

COPY package*.json ./

RUN node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('package.json')); ['dependencies','devDependencies','peerDependencies'].forEach(d=>{ if(p[d]) { Object.keys(p[d]).forEach(k=>{ if(k.startsWith('@estimation/')) delete p[d][k]; }); } }); fs.writeFileSync('package.json', JSON.stringify(p,null,2));"

RUN npm install --legacy-peer-deps

COPY . .

RUN npm run build

FROM node:18-alpine
WORKDIR /usr/src/app

RUN npm install -g serve

COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 3000

CMD ["serve", "-s", "dist", "-l", "3000"]
