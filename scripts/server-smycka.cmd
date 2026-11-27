@echo off
rem Spousti server mestecka a po "restartuj me" (kod 75 - obnova po vypadku sluzeb) ho spusti znovu.
rem Vola ho scripts\spustit.ps1 v okne serveru. Zavrenim okna se mestecko vypne.
set MESTECKO_SMYCKA=1
:znovu
call npm run serve
if "%ERRORLEVEL%"=="75" (
  echo.
  echo Server se restartuje po vypadku sluzeb - za 3 sekundy bezi znovu...
  timeout /t 3 /nobreak >nul
  goto znovu
)
