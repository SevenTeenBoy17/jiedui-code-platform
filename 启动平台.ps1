# 结对编程智能体平台 · 一键启动（单进程：后端 + 前端产物同端口）
# 用法：右键本文件 → 使用 PowerShell 运行。停止：关掉弹出的窗口或 Ctrl+C。
# 老师只需要这一个脚本；端口/口令等配置见 server\.env 与 docs\进校首日检查单.md
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$py   = Join-Path $root 'server\.venv\Scripts\python.exe'
$dist = Join-Path $root 'web\dist'
$port = 12210

if (-not (Test-Path $py)) {
  Write-Host "未找到 Python 环境：$py" -ForegroundColor Red
  Write-Host "请先在 server 目录执行安装（见 docs\进校首日检查单.md A6）"; pause; exit 1
}
if (-not (Test-Path (Join-Path $dist 'index.html'))) {
  Write-Host "未找到前端产物 web\dist —— 先在 web 目录执行 npm run build" -ForegroundColor Yellow
  Write-Host "（没有产物也能启动，但只有 API，没有界面）"
}

# Windows 会把动态端口区间划为排除范围（Hyper-V 重启后还会漂移）——启动前先查，
# 端口被占就往上找一个可用的。9099 曾因此突然绑不上，这不是假想问题。
$excluded = @()
try {
  netsh interface ipv4 show excludedportrange protocol=tcp | ForEach-Object {
    if ($_ -match '^\s*(\d+)\s+(\d+)') { $excluded += ,@([int]$Matches[1], [int]$Matches[2]) }
  }
} catch {}
function Test-PortFree([int]$p) {
  foreach ($r in $excluded) { if ($p -ge $r[0] -and $p -le $r[1]) { return $false } }
  try { $l = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $p); $l.Start(); $l.Stop(); return $true }
  catch { return $false }
}
while (-not (Test-PortFree $port)) {
  Write-Host "端口 $port 不可用（被占用或落在系统排除区间），尝试 $($port+1)" -ForegroundColor Yellow
  $port += 1
}

# 提醒两项进校必配（不拦截启动：教室里网络不通时也要能先把平台跑起来排查）
$envFile = Join-Path $root 'server\.env'
$envText = if (Test-Path $envFile) { Get-Content $envFile -Raw } else { '' }
if ($envText -notmatch '(?m)^\s*JIEDUI_TEACHER_PASSWORD\s*=\s*\S') {
  Write-Host "⚠ 未设置教师口令（JIEDUI_TEACHER_PASSWORD）——演示模式下学生可自选教师页签！" -ForegroundColor Red
  Write-Host "  正式上课前请在 server\.env 里设置（见 docs\进校首日检查单.md A1）" -ForegroundColor Red
}

Write-Host ""
Write-Host "启动平台：http://127.0.0.1:$port  （关闭本窗口即停止）" -ForegroundColor Green
Start-Process "http://127.0.0.1:$port"
$env:PYTHONUTF8 = '1'
Set-Location (Join-Path $root 'server')
& $py -m uvicorn app.main:app --host 0.0.0.0 --port $port
