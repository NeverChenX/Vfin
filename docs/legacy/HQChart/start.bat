@echo off
chcp 65001 >nul
title VFin HQChart

echo ========================================
echo   VFin HQChart - Starting
echo ========================================
echo.

:: Stop existing process on port 18080
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":18080 " ^| findstr "LISTENING"') do (
    echo Stopping existing process PID %%a
    taskkill /pid %%a /f >nul 2>&1
)
timeout /t 1 /nobreak >nul

echo Starting server...
start "VFin-Gateway" /min cmd /c "cd /d "%~dp0backend\gateway" && node src/server.js"

timeout /t 2 /nobreak >nul

echo.
echo ========================================
echo   http://localhost:18080/frontend/app/
echo ========================================
echo.
start http://localhost:18080/frontend/app/
