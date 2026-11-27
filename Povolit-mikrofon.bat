@echo off
rem Povoli znovu mikrofon pro okno OndiVerse (smaze ulozena opravneni okna a otevre ho znovu).
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\povolit-mikrofon.ps1"
