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
echo Starting HRMS at http://localhost:3000  (admin: jin@company.com / changeme123)
npm run dev
