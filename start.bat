@echo off
setlocal EnableDelayedExpansion
title Bloxy
cd /d "%~dp0"

echo.
echo   ===============================================
echo     Bloxy  -  AI that builds inside Roblox Studio
echo   ===============================================
echo.

rem ---------- 1. Node.js ----------
where node >nul 2>nul
if errorlevel 1 (
  echo [X] Node.js is not installed. Get the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do echo [OK] Node.js %%v

rem ---------- 2. Packages ----------
if not exist "node_modules" (
  echo [..] Installing packages, first run only...
  call npm install
  if errorlevel 1 (
    echo [X] npm install failed.
    pause
    exit /b 1
  )
)

rem ---------- 3. Blender: real 3D meshes ----------
set "BLENDER_PATH="
for /d %%D in ("%ProgramFiles%\Blender Foundation\Blender*") do (
  if exist "%%D\blender.exe" set "BLENDER_PATH=%%D\blender.exe"
)
if defined BLENDER_PATH (
  echo [OK] Blender: !BLENDER_PATH!
) else (
  echo [ ] Blender not found. "Real mesh" 3D is off. Install it from https://www.blender.org/download/
)

rem ---------- 4. Roblox Studio, no plugin needed ----------
rem Bloxy talks to Studio through Roblox's own built-in Studio MCP server.
if exist "%LOCALAPPDATA%\Roblox\mcp.bat" (
  echo [OK] Roblox Studio MCP server found. No Bloxy plugin needed.
) else (
  echo [ ] Roblox Studio MCP not found. Install or update Roblox Studio to connect without the plugin.
)

set "STUDIO_EXE="
for /d %%V in ("%LOCALAPPDATA%\Roblox\Versions\version-*") do (
  if exist "%%V\RobloxStudioBeta.exe" set "STUDIO_EXE=%%V\RobloxStudioBeta.exe"
)
tasklist /fi "imagename eq RobloxStudioBeta.exe" 2>nul | find /i "RobloxStudioBeta.exe" >nul
if errorlevel 1 (
  if defined STUDIO_EXE (
    echo [..] Opening Roblox Studio...
    start "" "!STUDIO_EXE!"
  ) else (
    echo [ ] Roblox Studio is not installed. Get it from https://create.roblox.com
  )
) else (
  echo [OK] Roblox Studio is already open.
)
echo      In Studio, open a place and make sure its MCP server is turned on
echo      (Assistant panel, MCP settings) so Bloxy can build in it.

rem ---------- 5. Bloxy ----------
echo.
echo [..] Starting Bloxy on http://localhost:3000
echo      Close this window to stop it.
echo.
start "" /min cmd /c "for /l %%i in (1,1,60) do (curl -s -o nul http://localhost:3000/api/studio-mcp && (start http://localhost:3000/studio & exit) || timeout /t 2 >nul)"
call npm run dev
pause
