@echo off
REM ============================================================
REM  SlackPad 360 - Play (NATIVE TRACKPAD build)
REM  Double-click to play with your REAL trackpad. This builds
REM  the game and the native WebView2 host if needed, then
REM  launches the host, which streams your individual trackpad
REM  contacts straight into the game. Plant two fingers to ride.
REM
REM  Flags:  --rebuild   force a fresh native-host build
REM
REM  (For the old mouse / on-screen DEV-PAD browser build, run
REM   play-browser.bat instead.)
REM ============================================================
setlocal
title SlackPad 360
cd /d "%~dp0"

set "EXE=host\SlackPad.Host\bin\Release\net10.0-windows\SlackPad.Host.exe"

set "REBUILD=0"
if /I "%~1"=="--rebuild" set "REBUILD=1"

REM --- Node present? ---
where node >nul 2>nul
if errorlevel 1 (
  echo [SlackPad] Node.js not found.
  echo [SlackPad] Install Node ^>=20 from https://nodejs.org then run this again.
  echo.
  pause
  exit /b 1
)

REM --- .NET SDK present? ---
where dotnet >nul 2>nul
if errorlevel 1 (
  echo [SlackPad] .NET SDK not found.
  echo [SlackPad] Install the .NET 10 SDK from https://dotnet.microsoft.com/download then run this again.
  echo.
  pause
  exit /b 1
)

REM --- .NET 10 SDK specifically? ---
dotnet --list-sdks | findstr /r /b "10\." >nul
if errorlevel 1 (
  echo [SlackPad] The .NET 10 SDK was not found. Installed SDKs:
  dotnet --list-sdks
  echo [SlackPad] Install the .NET 10 SDK from https://dotnet.microsoft.com/download then run this again.
  echo.
  pause
  exit /b 1
)

REM --- Install JS dependencies once if missing ---
if not exist "node_modules" (
  echo [SlackPad] First launch: installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [SlackPad] npm install failed. See output above.
    pause
    exit /b 1
  )
)

REM --- Build the optimized game bundle if missing ---
REM     (delete packages\game\dist to force a rebuild)
if not exist "packages\game\dist\index.html" (
  echo [SlackPad] Building the game...
  call npm run build
  if errorlevel 1 (
    echo [SlackPad] Game build failed. See output above.
    pause
    exit /b 1
  )
)

REM --- Build the native host if missing or --rebuild ---
set "NEEDHOST=0"
if "%REBUILD%"=="1" set "NEEDHOST=1"
if not exist "%EXE%" set "NEEDHOST=1"
if "%NEEDHOST%"=="1" (
  echo [SlackPad] Building the native WebView2 host...
  call dotnet build host\SlackPad.sln -c Release
  if errorlevel 1 (
    echo [SlackPad] Host build failed. See output above.
    pause
    exit /b 1
  )
)

if not exist "%EXE%" (
  echo [SlackPad] Host executable missing after build:
  echo            %EXE%
  pause
  exit /b 1
)

echo [SlackPad] Launching. Plant TWO fingers on the trackpad to ride; F11 = fullscreen.
echo [SlackPad] Close the game window when you're done.
start "" "%EXE%"

endlocal
exit /b 0
