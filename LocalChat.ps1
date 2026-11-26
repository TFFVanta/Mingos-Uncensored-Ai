# Starts Local Chat as a desktop app: the server runs hidden in the background and the
# chat opens in its own window. Closing the window stops the server (if this launch started it).
param([int]$Port = 3000)
$ErrorActionPreference = 'Stop'
$dir  = $PSScriptRoot
$port = $Port
$env:PORT = "$port"   # the server reads this
$url  = "http://localhost:$port"

function Show-Error($msg) {
  Add-Type -AssemblyName PresentationFramework
  [void][System.Windows.MessageBox]::Show($msg, 'Local Chat', 'OK', 'Warning')
}
function Test-Server {
  # 127.0.0.1, not localhost: Windows PowerShell tries IPv6 first for "localhost" and times out
  try { (Invoke-WebRequest "http://127.0.0.1:$port/store" -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch { $false }
}

# 1. Start the server unless it's already running
$server = $null
if (-not (Test-Server)) {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Show-Error "Local Chat needs Node.js, which wasn't found. Install it from nodejs.org and try again."
    exit 1
  }
  $server = Start-Process node -ArgumentList "`"$dir\server.js`"" -WorkingDirectory $dir -WindowStyle Hidden -PassThru
  for ($i = 0; $i -lt 40 -and -not (Test-Server); $i++) { Start-Sleep -Milliseconds 250 }
  if (-not (Test-Server)) {
    if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
    Show-Error "Local Chat couldn't start its server.`n`nIf an older Local Chat window (a black console window) is still open, close it and try again. Otherwise something else may be using port $port."
    exit 1
  }
}

# 2. Open the chat in its own app window (Edge, or Chrome as a fallback)
$browser = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $browser) {
  Start-Process $url   # no Edge/Chrome: use the default browser
  exit 0
}

# A separate browser profile keeps this window independent, so we can tell when it closes.
$appProfile = Join-Path $dir 'data\app-window'
$window = Start-Process $browser -PassThru -ArgumentList @(
  "--app=$url",
  "--user-data-dir=`"$appProfile`"",
  "--window-size=1320,880",
  "--no-first-run",
  "--no-default-browser-check"
)
$window.WaitForExit()

# 3. Window closed: stop the server and everything it started (image engine, search engine,
#    background browser, MCP servers) if this launch started it.
if ($server) {
  $keyFile = Join-Path $dir "data\.shutdown-key-$port"
  if (Test-Path $keyFile) {
    try { Invoke-WebRequest "http://127.0.0.1:$port/shutdown?key=$(Get-Content $keyFile -Raw)" -Method Post -UseBasicParsing -TimeoutSec 5 | Out-Null } catch {}
    for ($i = 0; $i -lt 20 -and -not $server.HasExited; $i++) { Start-Sleep -Milliseconds 250 }
  }
  if (-not $server.HasExited) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
  # Safety net in case a clean shutdown wasn't possible
  $engine = Join-Path $dir 'image-engine'
  $search = Join-Path $dir 'search-engine'
  Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
    Where-Object { ($_.ExecutablePath -and ($_.ExecutablePath.StartsWith($engine) -or $_.ExecutablePath.StartsWith($search))) -or ($_.CommandLine -and ($_.CommandLine.Contains($engine) -or $_.CommandLine.Contains('searx.webapp'))) } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}
