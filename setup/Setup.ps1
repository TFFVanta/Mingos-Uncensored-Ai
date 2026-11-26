# Mingo's Uncensored AI - installer
# Installs the app's dependencies and optional components from their official sources, pinned to tested
# versions, and verifies every download against its published SHA-256 where one exists.
#
#   Install.cmd                         interactive: choose components
#   Install.cmd -Yes                    install the recommended set without asking
#   Install.cmd -DryRun                 show what would happen, change nothing
#   Install.cmd -Components core,voice  install only these
#
# Components: core, pictures, pictures-plus, voice, search, sandbox, ocr
param(
  [string[]]$Components,
  [switch]$Yes,
  [switch]$DryRun,
  [string]$Model = "huihui_ai/qwen3-abliterated:8b",
  [switch]$NoShortcuts
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$App = Split-Path -Parent $PSScriptRoot
$Name = "Mingo's Uncensored AI"
$UA = @{ "User-Agent" = "mingos-uncensored-ai-setup" }
$Curl = Join-Path $env:SystemRoot "System32\curl.exe"
$Models = Join-Path $App "image-engine\ComfyUI_windows_portable\ComfyUI\models"

function Say($msg, $color = "Gray") { Write-Host $msg -ForegroundColor $color }
function Step($msg) { Write-Host ""; Write-Host "== $msg ==" -ForegroundColor Cyan }
function Ask($q) { if ($Yes) { return $true }; $a = Read-Host "$q [y/N]"; return $a -match '^(y|yes)$' }
function Fail($msg) { Write-Host ""; Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }
function Have($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

# ---------------------------------------------------------------------------
# Pinned components (tested together). Sizes are approximate, for the menu.
# ---------------------------------------------------------------------------
$Catalog = [ordered]@{
  "core"          = @{ Label = "Core app + chat model ($Model) + library search model"; MB = 5300; Recommended = $true }
  "pictures"      = @{ Label = "Pictures: ComfyUI image engine + SDXL model";             MB = 9000; Recommended = $true }
  "pictures-plus" = @{ Label = "Picture extras: fast mode, outline, style, upscale";      MB = 3900; Recommended = $false }
  "voice"         = @{ Label = "Private voice: Whisper typing + Piper read-aloud";        MB = 250;  Recommended = $true }
  "search"        = @{ Label = "Private web search: SearXNG (needs Python 3.11)";         MB = 250;  Recommended = $true }
  "sandbox"       = @{ Label = "Code sandbox for agents: Pyodide + numpy/pandas/matplotlib"; MB = 30; Recommended = $true }
  "ocr"           = @{ Label = "OCR: read text in pictures and scanned PDFs";             MB = 3;    Recommended = $true }
}
$Pins = @{
  ComfyTag = "v0.46.0"; PyodideVer = "314.0.8"; WhisperTag = "b5907"; PiperTag = "2023.11.14-2"
  SearxCommit = "a7163d0"; IPAdapterCommit = "a0f451a"; EsrganTag = "v0.1.0"
}

# ---------------------------------------------------------------------------
# Download helpers with verification
# ---------------------------------------------------------------------------
function Get-HFHash($repo, $file) {
  $dir = Split-Path $file -Parent; $dir = $dir -replace '\\', '/'
  $url = "https://huggingface.co/api/models/$repo/tree/main" + $(if ($dir) { "/$dir" } else { "" })
  $entry = (Invoke-RestMethod $url -Headers $UA) | Where-Object { $_.path -eq ($file -replace '\\', '/') }
  if ($entry.lfs) { return @{ Sha = $entry.lfs.oid; Size = $entry.lfs.size } }
  return @{ Sha = $null; Size = $entry.size }
}
function Get-GHAsset($repo, $tag, $asset) {
  $rel = Invoke-RestMethod "https://api.github.com/repos/$repo/releases/tags/$tag" -Headers $UA
  $a = $rel.assets | Where-Object { $_.name -eq $asset }
  if (-not $a) { Fail "Couldn't find $asset in $repo release $tag." }
  return @{ Url = $a.browser_download_url; Sha = ($a.digest -replace '^sha256:', ''); Size = $a.size }
}
function Save-Verified($url, $dest, $sha, $size) {
  $leaf = Split-Path $dest -Leaf
  if ((Test-Path $dest) -and $size -and (Get-Item $dest).Length -eq $size) { Say "  already have $leaf"; return }
  if ((Test-Path $dest) -and -not $size -and $sha -and (Get-FileHash $dest -Algorithm SHA256).Hash.ToLower() -eq $sha.ToLower()) { Say "  already have $leaf"; return }
  if ($DryRun) { Say "  would download $leaf ($([math]::Round($size / 1MB)) MB) from $url"; return }
  New-Item -ItemType Directory -Force (Split-Path $dest -Parent) | Out-Null
  Say "  downloading $leaf ($([math]::Round($size / 1MB)) MB)..."
  & $Curl -L --fail --retry 5 --retry-delay 5 -C - -sS -o "$dest.part" $url
  if ($LASTEXITCODE -ne 0) { Fail "Download failed: $url" }
  if ($size -and (Get-Item "$dest.part").Length -ne $size) { Remove-Item "$dest.part"; Fail "$leaf has the wrong size." }
  if ($sha) {
    $got = (Get-FileHash "$dest.part" -Algorithm SHA256).Hash.ToLower()
    if ($got -ne $sha.ToLower()) { Remove-Item "$dest.part"; Fail "$leaf failed its fingerprint check (expected $sha, got $got)." }
    Say "  verified $leaf (sha256)" "Green"
  } else { Say "  downloaded $leaf (size checked)" "Green" }
  Move-Item -Force "$dest.part" $dest
}
function Save-HF($repo, $file, $dest) { $h = Get-HFHash $repo $file; Save-Verified "https://huggingface.co/$repo/resolve/main/$file" $dest $h.Sha $h.Size }
function Save-GH($repo, $tag, $asset, $dest) { $a = Get-GHAsset $repo $tag $asset; Save-Verified $a.Url $dest $a.Sha $a.Size }
function Expand-Archive7z($archive, $dest, [string[]]$extra) {
  if ($DryRun) { Say "  would unpack $(Split-Path $archive -Leaf)"; return }
  $sz = Join-Path $env:ProgramFiles "7-Zip\7z.exe"
  New-Item -ItemType Directory -Force $dest | Out-Null
  if (Test-Path $sz) { & $sz x $archive "-o$dest" -y -bso0 -bsp0 @extra; if ($LASTEXITCODE -ne 0) { Fail "Couldn't unpack $archive" } }
  else { & (Join-Path $env:SystemRoot "System32\tar.exe") -xf $archive -C $dest; if ($LASTEXITCODE -ne 0) { Fail "Couldn't unpack $archive. Installing 7-Zip (7-zip.org) usually fixes this." } }
}
function Pull-Model($m) {
  if ((Have ollama) -and ((& ollama list) -match [regex]::Escape($m))) { Say "  already have $m"; return }
  if ($DryRun) { Say "  would download model $m"; return }
  Say "  downloading model $m (Ollama verifies it)..."
  & ollama pull $m; if ($LASTEXITCODE -ne 0) { Fail "Couldn't download $m." }
}
function Offer-Winget($id, $what) {
  if (-not (Have winget)) { Fail "$what is needed. Install it, then run this installer again." }
  if (-not (Ask "$what is needed but not installed. Install it now with winget ($id)?")) { Fail "$what is needed. Install it, then run this installer again." }
  if ($DryRun) { Say "  would run: winget install $id"; return }
  & winget install --id $id -e --accept-source-agreements --accept-package-agreements
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
}

# ---------------------------------------------------------------------------
# Choose components
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "  $Name - installer" -ForegroundColor White
Write-Host "  Created by Mingo. Everything runs on your PC." -ForegroundColor DarkGray
if ($DryRun) { Say "  (dry run: nothing will be changed)" "Yellow" }

if (-not $Components) {
  if ($Yes) { $Components = @($Catalog.Keys | Where-Object { $Catalog[$_].Recommended }) }
  else {
    $Components = @("core")
    Step "Choose what to install"
    foreach ($k in $Catalog.Keys) {
      if ($k -eq "core") { Say ("  [always] {0} (~{1:N1} GB)" -f $Catalog[$k].Label, ($Catalog[$k].MB / 1024)); continue }
      $d = if ($Catalog[$k].Recommended) { "Y/n" } else { "y/N" }
      $a = Read-Host ("  {0} (~{1:N1} GB)? [{2}]" -f $Catalog[$k].Label, ($Catalog[$k].MB / 1024), $d)
      if (($Catalog[$k].Recommended -and $a -notmatch '^(n|no)$') -or (-not $Catalog[$k].Recommended -and $a -match '^(y|yes)$')) { $Components += $k }
    }
  }
}
# "-Components a,b" arrives as one string when run through Install.cmd: split it.
$Components = @($Components | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim().ToLower() } | Where-Object { $_ })
foreach ($c in $Components) { if (-not $Catalog.Contains($c)) { Fail "Unknown component '$c'. Choose from: $($Catalog.Keys -join ', ')" } }
if ($Components -notcontains "core") { $Components = @("core") + $Components }
if ($Components -contains "pictures-plus" -and $Components -notcontains "pictures") { $Components += "pictures" }
$totalGB = ($Components | ForEach-Object { $Catalog[$_].MB } | Measure-Object -Sum).Sum / 1024
$freeGB = (Get-PSDrive ($App.Substring(0, 1))).Free / 1GB
Say ("`n  Installing: {0}" -f ($Components -join ", ")) "White"
Say ("  Download size up to ~{0:N1} GB; free space on this drive: {1:N1} GB" -f $totalGB, $freeGB)
if ($freeGB -lt $totalGB + 2) { Say "  Warning: that's tight. Leave at least 2 GB free for Windows." "Yellow"; if (-not (Ask "Continue anyway?")) { exit 1 } }
Say "  By installing you agree to the Terms of Use and Acceptable Use Policy (TERMS.md, ACCEPTABLE_USE.md)," "DarkGray"
Say "  and to each downloaded component's own license (THIRD_PARTY_NOTICES.md)." "DarkGray"
if (-not $Yes -and -not (Ask "Start?")) { exit 1 }

# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------
Step "Checking requirements"
if (-not (Have node) -or [int]((& node -p "process.versions.node") -split '\.')[0] -lt 22) { Offer-Winget "OpenJS.NodeJS.LTS" "Node.js 22 or newer" }
else { Say "  Node.js $(& node -p 'process.versions.node')" "Green" }
if (-not (Have ollama)) { Offer-Winget "Ollama.Ollama" "Ollama" } else { Say "  Ollama found" "Green" }

Step "Core app"
if ($DryRun) { Say "  would run: npm ci" } else {
  Push-Location $App
  & npm ci --no-audit --no-fund --loglevel=error; if ($LASTEXITCODE -ne 0) { Pop-Location; Fail "npm ci failed." }
  Pop-Location; Say "  app packages installed" "Green"
}
Pull-Model $Model
Pull-Model "nomic-embed-text"

# ---------------------------------------------------------------------------
# Optional components
# ---------------------------------------------------------------------------
$dl = Join-Path $App "setup\downloads"
if ($Components -contains "pictures") {
  Step "Pictures (ComfyUI + SDXL)"
  $comfy = Join-Path $App "image-engine\ComfyUI_windows_portable"
  if (Test-Path (Join-Path $comfy "python_embeded\python.exe")) { Say "  ComfyUI already installed" }
  else {
    Save-GH "Comfy-Org/ComfyUI" $Pins.ComfyTag "ComfyUI_windows_portable_nvidia.7z" "$dl\comfyui.7z"
    Expand-Archive7z "$dl\comfyui.7z" (Join-Path $App "image-engine")
    if (-not $DryRun) { Remove-Item "$dl\comfyui.7z" }
  }
  Save-HF "stabilityai/stable-diffusion-xl-base-1.0" "sd_xl_base_1.0.safetensors" "$Models\checkpoints\sd_xl_base_1.0.safetensors"
}
if ($Components -contains "pictures-plus") {
  Step "Picture extras"
  Save-HF "ByteDance/SDXL-Lightning" "sdxl_lightning_4step_lora.safetensors" "$Models\loras\sdxl_lightning_4step_lora.safetensors"
  Save-HF "diffusers/controlnet-canny-sdxl-1.0-small" "diffusion_pytorch_model.fp16.safetensors" "$Models\controlnet\controlnet-canny-sdxl-small.fp16.safetensors"
  Save-GH "xinntao/Real-ESRGAN" $Pins.EsrganTag "RealESRGAN_x4plus.pth" "$Models\upscale_models\RealESRGAN_x4plus.pth"
  Save-HF "h94/IP-Adapter" "sdxl_models/ip-adapter_sdxl_vit-h.safetensors" "$Models\ipadapter\ip-adapter_sdxl_vit-h.safetensors"
  Save-HF "h94/IP-Adapter" "models/image_encoder/model.safetensors" "$Models\clip_vision\CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors"
  $node = Join-Path $App "image-engine\ComfyUI_windows_portable\ComfyUI\custom_nodes\ComfyUI_IPAdapter_plus"
  if (Test-Path $node) { Say "  IP-Adapter add-on already installed" }
  elseif ($DryRun) { Say "  would download the ComfyUI_IPAdapter_plus add-on ($($Pins.IPAdapterCommit))" }
  else {
    & $Curl -L --fail -sS -o "$dl\ipadapter.zip" "https://codeload.github.com/cubiq/ComfyUI_IPAdapter_plus/zip/$($Pins.IPAdapterCommit)"
    Expand-Archive7z "$dl\ipadapter.zip" "$dl\ipa"
    Move-Item (Get-ChildItem "$dl\ipa" -Directory | Select-Object -First 1).FullName $node
    Remove-Item "$dl\ipadapter.zip", "$dl\ipa" -Recurse -Force; Say "  IP-Adapter add-on installed" "Green"
  }
}
if ($Components -contains "voice") {
  Step "Private voice"
  $v = Join-Path $App "voice"
  if (-not (Test-Path "$v\whisper")) { Save-GH "ggml-org/whisper.cpp" $Pins.WhisperTag "whisper-blas-bin-x64.zip" "$dl\whisper.zip"; Expand-Archive7z "$dl\whisper.zip" "$v\whisper" }
  Save-HF "ggerganov/whisper.cpp" "ggml-base.en.bin" "$v\whisper\ggml-base.en.bin"
  if (-not (Test-Path "$v\piper")) { Save-GH "rhasspy/piper" $Pins.PiperTag "piper_windows_amd64.zip" "$dl\piper.zip"; Expand-Archive7z "$dl\piper.zip" $v }
  Save-HF "rhasspy/piper-voices" "en/en_US/lessac/medium/en_US-lessac-medium.onnx" "$v\piper-voices\en_US-lessac-medium.onnx"
  Save-HF "rhasspy/piper-voices" "en/en_US/lessac/medium/en_US-lessac-medium.onnx.json" "$v\piper-voices\en_US-lessac-medium.onnx.json"
}
if ($Components -contains "search") {
  Step "Private web search (SearXNG)"
  $s = Join-Path $App "search-engine"
  $py = $null
  foreach ($c in @("$env:LOCALAPPDATA\Programs\Python\Python311\python.exe")) { if (Test-Path $c) { $py = $c } }
  if (-not $py -and (Have py)) { try { $py = (& py -3.11 -c "import sys; print(sys.executable)") } catch {} }
  if (-not $py) { Offer-Winget "Python.Python.3.11" "Python 3.11"; $py = "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe" }
  if (-not (Test-Path "$s\searxng\searx\webapp.py")) {
    if ($DryRun) { Say "  would download SearXNG ($($Pins.SearxCommit)) and install its Python packages" }
    else {
      & $Curl -L --fail -sS -o "$dl\searxng.zip" "https://codeload.github.com/searxng/searxng/zip/$($Pins.SearxCommit)"
      # Linux-only server templates have file names Windows doesn't allow; they aren't needed here.
      Expand-Archive7z "$dl\searxng.zip" "$dl\sx" @('-x!*\utils\templates\*')
      Move-Item (Get-ChildItem "$dl\sx" -Directory | Select-Object -First 1).FullName "$s\searxng"
      Remove-Item "$dl\searxng.zip", "$dl\sx" -Recurse -Force
    }
  } else { Say "  SearXNG already installed" }
  if (-not $DryRun) {
    if (-not (Test-Path "$s\venv\Scripts\python.exe")) { & $py -m venv "$s\venv" }
    & "$s\venv\Scripts\python.exe" -m pip install --no-cache-dir --disable-pip-version-check -q -r "$s\searxng\requirements.txt"
    if ($LASTEXITCODE -ne 0) { Fail "Installing SearXNG's Python packages failed." }
    Copy-Item "$s\windows-fix\pwd.py" "$s\venv\Lib\site-packages\pwd.py" -Force
    if (-not (Test-Path "$s\settings.yml")) {
      $key = -join ((1..48) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
      (Get-Content "$s\settings.example.yml" -Raw) -replace 'REPLACE_WITH_A_LONG_RANDOM_STRING', $key | Set-Content "$s\settings.yml" -Encoding ascii
    }
    Say "  SearXNG ready" "Green"
  }
}
if ($Components -contains "sandbox") {
  Step "Code sandbox (Pyodide)"
  $p = Join-Path $App "vendor\pyodide"
  if (-not (Test-Path "$p\pyodide.js")) {
    Save-GH "pyodide/pyodide" $Pins.PyodideVer "pyodide-core-$($Pins.PyodideVer).tar.bz2" "$dl\pyodide-core.tar.bz2"
    if (-not $DryRun) {
      Expand-Archive7z "$dl\pyodide-core.tar.bz2" $dl
      Expand-Archive7z "$dl\pyodide-core.tar" (Join-Path $App "vendor")
      Remove-Item "$dl\pyodide-core.tar*"
    }
  }
  if ($DryRun) { Say "  would download numpy, pandas, matplotlib and dependencies (sha256 from pyodide-lock.json)" }
  else {
    $lock = Get-Content "$p\pyodide-lock.json" -Raw | ConvertFrom-Json
    $need = New-Object System.Collections.Generic.HashSet[string]
    $queue = New-Object System.Collections.Queue; foreach ($n in "numpy", "pandas", "matplotlib", "micropip") { $queue.Enqueue($n) }
    while ($queue.Count) { $n = $queue.Dequeue().ToLower(); if ($need.Add($n)) { foreach ($d in $lock.packages.$n.depends) { $queue.Enqueue($d) } } }
    foreach ($n in $need) {
      $pk = $lock.packages.$n
      Save-Verified "https://cdn.jsdelivr.net/pyodide/v$($Pins.PyodideVer)/full/$($pk.file_name)" "$p\$($pk.file_name)" $pk.sha256 $null
    }
  }
}
if ($Components -contains "ocr") {
  Step "OCR"
  # Published fingerprint (jsDelivr, base64 SHA-256): RbTLNGckrBd08cNvQvGCuIe82yjr5j5v/5CsQfP8/5E=
  $sha = (-join ([Convert]::FromBase64String("RbTLNGckrBd08cNvQvGCuIe82yjr5j5v/5CsQfP8/5E=") | ForEach-Object { $_.ToString("x2") }))
  Save-Verified "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz" (Join-Path $App "vendor\tessdata\eng.traineddata.gz") $sha 2952873
}
if ((Test-Path $dl) -and -not $DryRun) { Remove-Item $dl -Recurse -Force -ErrorAction SilentlyContinue }

# ---------------------------------------------------------------------------
# Shortcuts
# ---------------------------------------------------------------------------
if (-not $NoShortcuts) {
  Step "Shortcuts"
  $targets = @([Environment]::GetFolderPath("Desktop"), (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"))
  foreach ($t in $targets) {
    $lnk = Join-Path $t "$Name.lnk"
    if ($DryRun) { Say "  would create $lnk"; continue }
    $ws = New-Object -ComObject WScript.Shell
    $s = $ws.CreateShortcut($lnk)
    $s.TargetPath = Join-Path $env:SystemRoot "System32\conhost.exe"
    $s.Arguments = "--headless `"$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe`" -NoProfile -ExecutionPolicy Bypass -File `"$App\LocalChat.ps1`""
    $s.WorkingDirectory = $App
    $s.IconLocation = "$App\LocalChat.ico,0"
    $s.Description = "$Name - private AI on your PC"
    $s.Save()
    Say "  created $lnk" "Green"
  }
}

Write-Host ""
Write-Host "  Done! Start $Name from the desktop shortcut." -ForegroundColor Green
Write-Host "  New here? Read INSTRUCTIONS.md (or Settings > General > About > User guide in the app)." -ForegroundColor DarkGray
