#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
    echo "Eenmalig de bot klaarzetten..."
    npm install
fi

if [ ! -f .env ]; then
    cp .env.example .env
    echo "Er is een bestand .env aangemaakt. Plak je bot-token erin en start opnieuw."
    exit 1
fi

exec node src/index.js
