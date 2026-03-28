@echo off
echo Starting OpenLabel API...
echo.

cd /d e:\PythonProjects\OpenLabel\server

REM Запуск API
.venv\Scripts\uvicorn.exe main:app --host 0.0.0.0 --port 8001 --reload

pause