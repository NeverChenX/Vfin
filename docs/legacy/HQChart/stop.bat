@echo off
chcp 65001 >nul
title VFin HQChart - Stop

echo ========================================
echo   VFin HQChart - Stopping
echo ========================================
echo.

echo Stopping server...
for /f "tokens=2" %%a in ('tasklist /fi "WINDOWTITLE eq VFin-Gateway*" /fo list ^| findstr "PID:"') do (
    taskkill /pid %%a /t /f >nul 2>&1
)

:: Fallback: kill by port
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":18080 " ^| findstr "LISTENING"') do (
    taskkill /pid %%a /f >nul 2>&1
)

echo.
echo   Server stopped.
echo.
pause
