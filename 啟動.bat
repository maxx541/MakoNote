@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
  echo 第一次啟動，正在安裝套件...
  call npm install
)
call npm start
