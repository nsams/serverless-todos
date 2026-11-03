#!/usr/bin/env bash
. ~/.nvm/nvm.sh

# jump into project dir
cd $(dirname $0)

# create .env.local
if [[ ! -f .env.local ]]; then
    echo "# override for local env" >.env.local
fi

# use correct node version and install dependencies
nvm install
nvm use
corepack enable

pnpm install

# generate types for worker env and routes
pnpm run typegen

# create local D1 database
pnpm run db:migrate:d1
