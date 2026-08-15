@echo off
REM Opens the marketing site bypassing cached co.il redirect (Chrome, clean profile)
set URL=https://ai-4biz.github.io/ihoogi-marketing-site/
set PROFILE=%TEMP%\ihoogi-site-profile
start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --user-data-dir="%PROFILE%" --disable-http-cache "%URL%"
