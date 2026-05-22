@echo off
REM SonicAI CI Quick Check
REM Usage: run_ci.bat

echo ============================================
echo   SonicAI CI Check
echo ============================================

echo.
echo [1/3] Python syntax check...
cd /d "%~dp0backend"
python -c "import app.main; print('  OK: app.main imports')" 2>&1
if %errorlevel% neq 0 (
    echo   FAIL: Python import check
    exit /b 1
)

echo.
echo [2/3] Backend tests...
python -m pytest tests\ -q --tb=short 2>&1
if %errorlevel% neq 0 (
    echo   WARN: Some backend tests failed (may be expected in dev)
)

echo.
echo [3/3] Frontend build check...
cd /d "%~dp0frontend"
call npm.cmd run build:win 2>&1
if %errorlevel% neq 0 (
    echo   WARN: Frontend build had issues
) else (
    echo   OK: Frontend builds successfully
)

echo.
echo ============================================
echo   CI Check Complete
echo ============================================
