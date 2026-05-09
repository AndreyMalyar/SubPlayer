@echo off
title SubPlayer - Launcher
cd /d "C:\Work\kotlin\SubPlayer"

echo ========================================
echo   SubPlayer - Starting...
echo ========================================
echo.

:: Step 1: Start Docker Desktop if not running
docker info >nul 2>&1
if errorlevel 1 (
    echo [1/4] Starting Docker Desktop...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    echo [*] Waiting for Docker Engine...
    :wait_docker
    timeout /t 3 /nobreak >nul
    docker info >nul 2>&1
    if errorlevel 1 goto wait_docker
    echo [*] Docker is ready!
    echo.
) else (
    echo [1/4] Docker already running.
    echo.
)

:: Step 2: Start containers
echo [2/4] Starting containers (edge-tts + LibreTranslate)...
docker-compose up -d
echo.

:: Step 3: Start Kotlin server in separate window
echo [3/4] Starting Kotlin server...
start "SubPlayer Server" cmd /k "cd /d C:\Work\kotlin\SubPlayer && gradlew.bat run"
echo.

:: Step 4: Wait for server and open browser
echo [4/4] Waiting for server (20 sec)...
timeout /t 20 /nobreak >nul
start http://localhost:8080

echo.
echo ========================================
echo   SubPlayer is running! localhost:8080
echo   You can close this window.
echo ========================================
pause
