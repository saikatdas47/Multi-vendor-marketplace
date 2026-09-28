#!/usr/bin/env bash
set -euo pipefail

npm ci --prefix backend --omit=dev
npm ci --prefix frontend
npm run build --prefix frontend
mkdir -p backend/public
cp -R frontend/dist/. backend/public/
