@echo off
title Obnovlenie sever-18.ru
color 0A

set FTP_USER=mastesu6_7
set FTP_HOST=mastesu6.beget.tech
set /p FTP_PASS=<"%~dp0ftp_pass.txt"

cd /d %~dp0

echo [1/4] Skachivayem kod s GitHub...
curl -L -o update.zip https://github.com/MrDavid2009/Davit-Hovhannisyan/archive/refs/heads/main.zip
tar -xf update.zip --strip-components=1 -C . >nul 2>&1
del update.zip >nul 2>&1
echo      OK!

echo [2/4] Ustanavlivayem pakety...
call npm install --silent
echo      OK!

echo [3/4] Sobiraem sayt...
call npm run build
echo      OK!

echo [4/4] Zagruzhaem na server...
curl -T dist/index.html ftp://%FTP_HOST%/sever-18.ru/public_html/index.html --user %FTP_USER%:%FTP_PASS% --ftp-pasv --silent
curl -T dist/sw.js ftp://%FTP_HOST%/sever-18.ru/public_html/sw.js --user %FTP_USER%:%FTP_PASS% --ftp-pasv --silent

for %%f in (dist\assets\*) do (
    curl -T "%%f" ftp://%FTP_HOST%/sever-18.ru/public_html/assets/%%~nxf --user %FTP_USER%:%FTP_PASS% --ftp-pasv --silent
)

echo.
echo *** SAYT USPESHNO OBNOVLEN! ***
echo.
pause
