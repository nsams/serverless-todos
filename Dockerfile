# The app on the Node platform (src/server.node.ts), e.g. for bunny.net Magic Containers (see README "Deployment (bunny.net)").
# Applies the pending migrations to the database (BUNNY_DATABASE_URL) and starts the server on port 3000.

FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:node
# The only dependencies at runtime (the server bundle contains all others): libSQL (native bindings), drizzle-orm (migrations, scripts/migrate.ts)
# and the HTTP server srvx, in the versions of the lockfile
RUN mkdir /runtime \
    && node -e 'const p = require("./package-lock.json").packages; console.log(JSON.stringify({ private: true, type: "module", dependencies: Object.fromEntries(["@libsql/client", "drizzle-orm", "srvx"].map((name) => [name, p["node_modules/" + name].version])) }))' > /runtime/package.json \
    && cd /runtime && npm install --omit=dev --no-audit --no-fund

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /runtime/package.json ./
COPY --from=build /runtime/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY drizzle ./drizzle
COPY scripts/migrate.ts scripts/libsql.ts ./scripts/
# without BUNNY_DATABASE_URL a SQLite file in the container (lost on every deployment; for trying it out)
RUN mkdir .data && chown node .data
USER node
EXPOSE 3000
CMD ["sh", "-c", "node scripts/migrate.ts && exec node_modules/.bin/srvx --prod --port 3000 --static ../client dist/server/server.node.js"]
