# Builds the stdio MCP server in `mcp-server/`, not the Next.js app.
#
# The site deploys as a Cloudflare Worker (see `wrangler.jsonc`) and has no
# container in its path. This image exists because directories that verify an
# MCP server do it by running one: Glama's server listing asks for a Dockerfile
# and checks that the process starts and answers introspection. That is exactly
# what `mcp-server/` does, and it reaches the same published JSON-LD the remote
# endpoint at `/mcp` serves, so listing it needs no new surface.
#
# The package is also on npm as `aboard-mcp-server`, which is the route most
# clients should take. This is the container equivalent, not a replacement.
#
#   docker build -t aboard-mcp-server .
#   docker run --rm -i aboard-mcp-server
#
# It speaks stdio, so `-i` is required and there is nothing to publish a port
# for. stdout carries protocol frames exclusively; diagnostics go to stderr.

# Node 22 matches the version CI runs; `engines` in mcp-server/package.json
# declares >=20, so this is inside the supported range rather than at its floor.
FROM node:22-alpine AS build
WORKDIR /app

# Dependencies first, so a source-only edit does not re-resolve the tree.
COPY mcp-server/package.json mcp-server/package-lock.json ./
RUN npm ci

COPY mcp-server/tsconfig.json ./
COPY mcp-server/src ./src

# `tsc` with the committed tsconfig, which is the same config `npm run build`
# uses to produce the published artifact — deliberately not a --noEmit variant.
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Runtime dependencies only: the SDK and zod. `tsx` and `typescript` stay in
# the build stage.
COPY mcp-server/package.json mcp-server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY LICENSE ./LICENSE

# The image runs untrusted-adjacent input (whatever a client sends over stdio),
# so it does not run as root. `node` is provided by the base image.
USER node

ENTRYPOINT ["node", "dist/index.js"]
