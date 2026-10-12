@echo off
cd /d "%~dp0"
set "PATH=%LOCALAPPDATA%\Programs\Git\cmd;%PATH%"

echo ===================================================
echo  Tray Hardware Monitor - GitHub'a Yukleniyor...
echo ===================================================
echo.
git push -u origin main
echo.
if %ERRORLEVEL% equ 0 (
    echo [BASARILI] Proje GitHub'a basariyla yuklendi!
) else (
    echo [BILGI] Eger ilk kez yukluyorsaniz, tarayicida acilan pencereden GitHub oturumunuzu onaylayin.
)
echo.
pause
