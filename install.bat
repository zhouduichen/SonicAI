@echo off
setlocal

set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "FRONTEND=%ROOT%frontend"
set "VENV=%ROOT%.venv"
set "PY=%VENV%\Scripts\python.exe"
set "BASE_PY="

echo === SonicAI One-Click Setup ===
echo.

echo [1/5] Preparing isolated Python environment...
for %%P in (
  "%LocalAppData%\Programs\Python\Python312\python.exe"
  "%LocalAppData%\Programs\Python\Python311\python.exe"
  "%LocalAppData%\Programs\Python\Python310\python.exe"
  "%LocalAppData%\Programs\Python\Python313\python.exe"
  "%ProgramFiles%\Python312\python.exe"
  "%ProgramFiles%\Python311\python.exe"
  "%ProgramFiles%\Python310\python.exe"
  "%ProgramFiles%\Python313\python.exe"
) do (
  if not defined BASE_PY if exist "%%~P" set "BASE_PY=%%~P"
)
if not defined BASE_PY (
  for %%V in (3.12 3.11 3.10) do (
    if not defined BASE_PY (
      for /f "delims=" %%P in ('py -%%V -c "import sys; print(sys.executable)" 2^>nul') do (
        if not defined BASE_PY set "BASE_PY=%%P"
      )
    )
  )
)
if not defined BASE_PY (
  for /f "delims=" %%P in ('where python 2^>nul') do (
    if not defined BASE_PY set "BASE_PY=%%P"
  )
)
if not defined BASE_PY (
  echo Python 3.10-3.12 was not found. Install Python 3.11 or 3.12 and run this script again.
  pause
  exit /b 1
)
"%BASE_PY%" -c "import sys; print(sys.executable); print('Python', sys.version); sys.exit(0 if (3, 10) <= sys.version_info[:2] < (3, 13) else 1)"
if errorlevel 1 (
  echo SonicAI requires Python 3.10-3.12 for the audio/ML dependency stack.
  echo Install Python 3.11 or 3.12 and run this script again.
  pause
  exit /b 1
)
if exist "%PY%" (
  "%PY%" -c "import sys; sys.exit(0 if (3, 10) <= sys.version_info[:2] < (3, 13) else 1)"
  if errorlevel 1 (
    echo Existing .venv uses an unsupported Python version. Recreating it...
    rmdir /s /q "%VENV%"
  )
)
if not exist "%PY%" (
  "%BASE_PY%" -m venv "%VENV%"
)
if not exist "%PY%" (
  echo Failed to create %VENV%.
  echo Please install Python 3.10+ and run this script again.
  pause
  exit /b 1
)
"%PY%" -m pip install --upgrade pip setuptools wheel
echo.

echo [2/5] Installing CUDA PyTorch for NVIDIA GPUs...
echo     This uses the official CUDA 12.8 wheel index; RTX 50-series needs a recent CUDA wheel.
"%PY%" -m pip install --upgrade torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu128
if errorlevel 1 (
  echo CUDA PyTorch install failed.
  pause
  exit /b 1
)
echo.

echo [3/5] Installing backend dependencies...
cd /d "%BACKEND%"
"%PY%" -m pip install -r requirements.txt
if errorlevel 1 (
  echo Backend dependency install failed.
  pause
  exit /b 1
)
echo.

echo [4/5] Installing frontend dependencies...
cd /d "%FRONTEND%"
call npm install
if errorlevel 1 (
  echo Frontend dependency install failed.
  pause
  exit /b 1
)
echo.

echo [5/5] Verifying GPU runtime and pre-caching AI models...
cd /d "%BACKEND%"
"%PY%" verify_models.py
"%PY%" -c "import sys, torch; print('PyTorch:', torch.__version__); print('CUDA available:', torch.cuda.is_available()); print('CUDA runtime:', torch.version.cuda); print('GPU count:', torch.cuda.device_count()); [print(f'GPU {i}: {torch.cuda.get_device_name(i)}') for i in range(torch.cuda.device_count())]; sys.exit(0 if torch.cuda.is_available() else 2)"
if errorlevel 2 (
  echo.
  echo WARNING: NVIDIA driver is visible only if nvidia-smi works, but PyTorch CUDA is not available.
  echo Training will fall back to CPU until CUDA PyTorch is fixed.
  echo.
)
if "%SONICAI_PRECACHE_MODELS%"=="1" (
  "%PY%" precache_models.py
) else (
  echo Skipping large model pre-cache. Set SONICAI_PRECACHE_MODELS=1 before running install.bat to pre-download models.
)
echo.

echo Done.
echo.
echo Run: "%PY%" "%ROOT%start_all.py" --async
echo Then open: http://localhost:3000
echo Default account: admin / admin123
pause
