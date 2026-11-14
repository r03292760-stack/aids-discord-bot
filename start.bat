@echo off
title A.I.D.S. bot
cd /d "%~dp0"

if not exist node_modules (
    echo Eenmalig de bot klaarzetten...
    call npm install
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

node src\index.js
echo.
echo De bot is gestopt. Druk op een toets om dit venster te sluiten.
pause >nul
