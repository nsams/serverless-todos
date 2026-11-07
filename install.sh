#!/usr/bin/env bash
set -e

. ~/.nvm/nvm.sh

# jump into project dir
cd "$(dirname "$0")"

# create .env.local
if [[ ! -f .env.local ]]; then
    echo "# override for local env" >.env.local
fi

# use correct node version and install dependencies
nvm install
nvm use

npm install

# generate types for worker env
npm run typegen

# create local D1 database
npm run db:migrate
