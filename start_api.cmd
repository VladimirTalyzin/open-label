@echo off
echo Starting OpenLabel API...
echo.

REM Запуск API
e:\PythonProjects\PDFParser\.venv\Scripts\uvicorn.exe main:app --host 0.0.0.0 --port 8011 --reload

pause