#!/usr/bin/env bash
set -euo pipefail

if [[ -f backend/package-lock.json ]]; then
  npm ci --prefix backend --omit=dev
else
  npm install --prefix backend --omit=dev
fi

if [[ -f frontend/package-lock.json ]]; then
  npm ci --prefix frontend
else
  npm install --prefix frontend
fi

npm run build --prefix frontend
mkdir -p backend/public
cp -R frontend/dist/. backend/public/
