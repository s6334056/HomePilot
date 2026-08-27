@echo off
node "%~dp0start-homepilot.js" %*
if %ERRORLEVEL% neq 0 (
  echo.
  echo HomePilot exited with an error.
  echo Press any key to close this window...
  pause >nul
)
