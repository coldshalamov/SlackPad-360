@echo off
REM ============================================================
REM  SlackPad 360 - Browser build (MOUSE / DEV-PAD ONLY)
REM  Serves the optimized production build with `vite preview`
REM  in your web browser. Browsers CANNOT see individual trackpad
REM  contacts, so real trackpad play does NOT work here - use the
REM  on-screen DEV PAD (mouse: LMB=foot A, Shift=foot B, Space=kick).
REM
REM  To play with your REAL trackpad, run play.bat instead (it
REM  launches the native WebView2 host).
REM
REM  Double-click this file to play. Close the window to stop.
REM ============================================================
setlocal
title SlackPad 360 (browser / dev-pad)

cd /d "%~dp0"

REM --- Node present? ---
where node >nul 2>nul
if errorlevel 1 (
  echo [SlackPad] Node.js not found.
  echo [SlackPad] Install Node ^>=20 from https://nodejs.org then run this again.
  echo.
  pause
  exit /b 1
)

REM --- Port to serve on (change if something else uses it) ---
set "PORT=4321"

REM --- Install dependencies once if missing ---
if not exist "node_modules" (
  echo [SlackPad] First launch: installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [Slackpad] npm install failed. See output above.
    pause
    exit /b 1
  )
)

REM --- Build the optimized bundle if there is no build yet ---
REM     (delete packages\game\dist to force a rebuild)
if not exist "packages\game\dist\index.html" (
  echo [SlackPad] First launch: building optimized game...
  call npm run build
  if errorlevel 1 (
    echo [SlackPad] Build failed. See output above.
    pause
    exit /b 1
  )
)

echo [SlackPad] Launching the optimized game in your browser (mouse / DEV PAD only)...
echo [SlackPad] Open http://localhost:%PORT%/ if it doesn't appear.
echo [SlackPad] (Close this window when you're done playing.)
echo.

REM vite preview must run from packages\game (where dist/ lives).
cd "packages\game"

REM --open pops the browser; --strictPort fails fast if PORT is taken.
start "" http://localhost:%PORT%/
call npx vite preview --port %PORT% --strictPort

cd /d "%~dp0"
pause
