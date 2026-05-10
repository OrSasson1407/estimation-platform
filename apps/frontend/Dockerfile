FROM node:18-alpine AS builder
WORKDIR /usr/src/app

COPY package*.json ./

# Strip @estimation/* workspace deps that Docker cannot resolve via monorepo symlinks.
RUN node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('package.json')); ['dependencies','devDependencies','peerDependencies'].forEach(d=>{ if(p[d]) { Object.keys(p[d]).forEach(k=>{ if(k.startsWith('@estimation/')) delete p[d][k]; }); } }); fs.writeFileSync('package.json', JSON.stringify(p,null,2));"

RUN npm install --legacy-peer-deps

COPY . .

# FIX #4: VITE_* vars must be present at build time, not runtime.
# Receive them as build args and expose to Vite via ARG (Vite reads these
# as import.meta.env.* during the build step below).
ARG VITE_API_URL=http://localhost:4000/api/v1
ARG VITE_WS_URL=http://localhost:3004
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL

# FIX #1: Use vite build directly — bypasses tsc which errors on missing
# @estimation/* types after the workspace-strip above.
RUN npx vite build

# FIX #4: nginx-alpine instead of serve — production-hardened static server
FROM nginx:1.25-alpine
COPY --from=builder /usr/src/app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
