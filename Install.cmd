@echo off
title Mingo's Uncensored AI - installer
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup\Setup.ps1" %*
echo.
pause
