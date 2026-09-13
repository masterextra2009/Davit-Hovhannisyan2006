@echo off
title Obnovlenie sever-18.ru
color 0A

REM Sayt sobirayetsya iz papki na etom kompyutere (Desktop\sever-18).
REM Ranshe skript kachal kod s GitHub iz repozitoriya MrDavid2009/Davit-Hovhannisyan,
REM kotorogo bolshe net (GitHub otvechayet 404), a vash repozitoriy chastnyy i bez
REM parolya ne skachivayetsya. Poetomu sborka idet iz lokalnoy papki.

set FTP_USER=mastesu6
set FTP_HOST=mastesu6.beget.tech
set /p FTP_PASS=<"%~dp0ftp_pass.txt"

cd /d "%~dp0.."

echo.
echo === CHTO BUDET VYLOZHENO NA sever-18.ru ===
for /f "delims=" %%b in ('git branch --show-current') do echo Vetka: %%b
for /f "delims=" %%c in ('git log -1 --format^="%%h %%s"') do echo Posledniy kommit: %%c
echo.
echo Budet sobrano iz etoy papki i zalito na BOYEVOY sayt.
set /p OK=Prodolzhit? (da/net):
if /i not "%OK%"=="da" goto :otmena

echo [1/3] Ustanavlivayem pakety...
call npm install --silent
if errorlevel 1 goto :oshibka

echo [2/3] Sobiraem sayt...
call npm run build
if errorlevel 1 goto :oshibka
if not exist "dist\index.html" goto :oshibka

echo [3/3] Zagruzhaem na server...
curl -T dist/index.html ftp://%FTP_HOST%/sever-18.ru/public_html/index.html --user %FTP_USER%:%FTP_PASS% --ftp-pasv --silent --show-error
if errorlevel 1 goto :oshibka
if exist "dist\sw.js" curl -T dist/sw.js ftp://%FTP_HOST%/sever-18.ru/public_html/sw.js --user %FTP_USER%:%FTP_PASS% --ftp-pasv --silent --show-error

for %%f in (dist\assets\*) do (
    curl -T "%%f" ftp://%FTP_HOST%/sever-18.ru/public_html/assets/%%~nxf --user %FTP_USER%:%FTP_PASS% --ftp-pasv --silent --show-error
)

echo.
echo *** SAYT USPESHNO OBNOVLEN! ***
echo Otkroyte sever-18.ru i obnovite stranitsu (Ctrl+F5).
echo.
pause
exit /b 0

:otmena
echo.
echo Otmeneno. Nichego ne izmenilos.
echo.
pause
exit /b 0

:oshibka
color 0C
echo.
echo *** OSHIBKA! Sayt NE obnovlen. ***
echo Nichego ne zalito - staryy sayt prodolzhayet rabotat.
echo Pokazhite eto okno Klodu.
echo.
pause
exit /b 1
