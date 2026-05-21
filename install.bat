@echo off
echo === SonicAI One-Click Setup ===
echo.

echo [1/3] Installing Python dependencies...
cd /d D:\aimusic\backend
pip install -r requirements.txt
echo.

echo [2/3] Installing Node.js dependencies...
cd /d D:\aimusic\frontend
call npm install
echo.

echo [3/3] Done!
echo.
echo Run: python D:\aimusic\control.py
echo Then open: http://localhost:5000
pause
