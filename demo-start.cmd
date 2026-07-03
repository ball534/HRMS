@echo off
rem One-click demo launcher: starts the local Postgres (portable install in
rem ..\.localdb, port 5455) if it isn't running, then the Next.js dev server.
set PGBIN=%~dp0..\.localdb\pgsql\bin
set PGDATA=%~dp0..\.localdb\data

"%PGBIN%\pg_ctl.exe" status -D "%PGDATA%" >nul 2>&1
if errorlevel 1 (
  echo Starting local PostgreSQL...
  "%PGBIN%\pg_ctl.exe" -D "%PGDATA%" -l "%~dp0..\.localdb\pg.log" -o "-p 5455" start
) else (
  echo PostgreSQL already running.
)

cd /d "%~dp0"
echo.
echo ==============================================================
echo  HRMS demo starting at http://localhost:3000
echo.
echo  Demo logins (password for all: test123)
echo    Admin     jin@company.com
echo    HR        grace@iora.demo
echo    Manager   sara@iora.demo    (signer/boss)
echo    Employee  weiling@iora.demo (rich Journey data)
echo ==============================================================
echo.
npm run dev
