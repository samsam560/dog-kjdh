@echo off
chcp 65001 >nul
setlocal
set HERE=%~dp0
echo == 给 DeepSeek Harness 桌面壳打「退场动画」补丁 ==
echo （会先备份原始 main.js 区域，等长替换，可随时还原）
echo.
node "%HERE%patch-asar.mjs" --apply %*
echo.
if errorlevel 1 (echo 失败：请把上面的输出发给 AI 排查。) else (echo 完成：完全退出并重启 DeepSeek Harness 后生效。)
echo.
pause
