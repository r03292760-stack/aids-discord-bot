#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d .venv ]; then
    echo "Eenmalig de bot klaarzetten..."
    python3 -m venv .venv
    .venv/bin/python -m pip install --upgrade pip
    .venv/bin/python -m pip install -r requirements.txt
fi

if [ ! -f .env ]; then
    cp .env.example .env
    echo "Er is een bestand .env aangemaakt. Plak je bot-token erin en start opnieuw."
    exit 1
fi

exec .venv/bin/python main.py
