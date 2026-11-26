@echo off
title Mingo's Uncensored AI
cd /d "%~dp0"
rem Open the browser a moment after the server starts
start "" cmd /c "timeout /t 2 >nul & start http://localhost:3000"
node server.js
echo.
pause
