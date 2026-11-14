@echo off
title A.I.D.S. bot
cd /d "%~dp0"

if not exist .venv (
    echo Eenmalig de bot klaarzetten...
    python -m venv .venv || py -3 -m venv .venv
    .venv\Scripts\python.exe -m pip install --upgrade pip
    .venv\Scripts\python.exe -m pip install -r requirements.txt
)

if not exist .env (
    copy .env.example .env >nul
    echo.
    echo Er is een bestand .env aangemaakt.
    echo Open dat bestand, plak je bot-token erin en start dit bestand opnieuw.
    echo.
    pause
    exit /b
)

.venv\Scripts\python.exe main.py
echo.
echo De bot is gestopt. Druk op een toets om dit venster te sluiten.
pause >nul
