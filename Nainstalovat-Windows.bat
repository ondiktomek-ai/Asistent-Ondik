@echo off
rem Instalace OndiVerse - staci dvojklik. Podrobnosti v scripts\instalace.ps1
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\instalace.ps1"
