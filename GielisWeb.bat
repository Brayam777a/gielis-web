@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch_gielis.ps1" %*
if errorlevel 1 (
    echo.
    echo Ocurrio un error al iniciar Gielis Web. Revisa los mensajes arriba.
    pause
    exit /b 1
)
