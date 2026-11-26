@echo off
rem Povoli znovu mikrofon pro okno Mestecka Ondik (smaze ulozena opravneni okna a otevre ho znovu).
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\povolit-mikrofon.ps1"
