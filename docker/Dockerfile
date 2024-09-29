FROM alpine:3 AS dependencies
WORKDIR /temp
COPY package.json .
RUN set -ex; \
  apk add --no-cache --virtual .build-deps jq; \
  jq --sort-keys '{ dependencies, devDependencies }' < package.json > dependencies.json; \
  apk del .build-deps;

FROM node:18-alpine AS build
WORKDIR /build

COPY --from=dependencies /temp/dependencies.json package.json

RUN set -ex; \
  apk add --no-cache --virtual .build-deps git; \
  npm install; \
  apk del .build-deps;

COPY . .
RUN set -ex; npm run build;

FROM node:18-alpine
ENV WORKDIR /demo-app
WORKDIR $WORKDIR

COPY docker/wait-for /usr/local/bin/
RUN chmod +x /usr/local/bin/wait-for

COPY package.json .
COPY --from=build /build/dist .
COPY --from=build /build/node_modules ./node_modules

CMD node demo/app.js
