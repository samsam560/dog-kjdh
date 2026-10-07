@echo off
chcp 65001 >nul
setlocal
set HERE=%~dp0
echo == 还原 DeepSeek Harness 桌面壳（撤销退场动画补丁）==
echo.
node "%HERE%patch-asar.mjs" --restore %*
echo.
if errorlevel 1 (echo 失败：请把上面的输出发给 AI 排查。) else (echo 完成：重启 DeepSeek Harness 后点 X 不再播退场动画。)
echo.
pause
