FROM node:22-bookworm-slim AS build

WORKDIR /micah

COPY package.json package-lock.json tsconfig.base.json tsconfig.json ./
COPY packages/core/package.json packages/core/
COPY packages/cli/package.json packages/cli/
COPY packages/slack/package.json packages/slack/
COPY packages/github/package.json packages/github/

RUN npm ci

COPY packages ./packages
COPY MICAH.md ./MICAH.md
COPY prompts ./prompts

RUN npm run build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV MICAH_WRITE_ENABLED=0

WORKDIR /micah

COPY --from=build /micah/package.json /micah/package-lock.json ./
COPY --from=build /micah/MICAH.md ./MICAH.md
COPY --from=build /micah/prompts ./prompts
COPY --from=build /micah/packages ./packages

RUN npm ci --omit=dev

ARG ADAPTER=slack
ENV MICAH_ADAPTER=$ADAPTER

USER node

CMD ["sh", "-c", "node --enable-source-maps packages/${MICAH_ADAPTER}/dist/index.js"]
