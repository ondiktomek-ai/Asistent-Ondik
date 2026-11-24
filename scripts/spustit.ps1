# Spuštění Městečka Ondik na Windows – volá ho zástupce na ploše.
# 1) Pokud server neběží, spustí ho v minimalizovaném okně (zavřením toho okna městečko vypneš).
# 2) Otevře městečko jako samostatné okno (Chrome/Edge v režimu aplikace) na zvoleném monitoru.

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
# Čerstvá PATH (např. po instalaci Node.js), aby se našel npm.
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')

function Zprava($text) {
  Add-Type -AssemblyName PresentationFramework
  [void][System.Windows.MessageBox]::Show($text, 'Městečko Ondik')
}

# Nastavení z .env
$nastaveni = @{}
if (Test-Path '.env') {
  foreach ($radek in [IO.File]::ReadAllLines((Join-Path $Root '.env'))) {
    if ($radek -match '^\s*([A-Z_]+)\s*=\s*(.*?)\s*$') { $nastaveni[$Matches[1]] = $Matches[2] }
  }
}
$port = if ($nastaveni['PORT']) { $nastaveni['PORT'] } else { '8787' }
$url = "http://localhost:$port"

function Bezi {
  try { return (Invoke-WebRequest -Uri "$url/api/status" -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch { return $false }
}

if (-not (Bezi)) {
  if (-not (Test-Path 'node_modules') -or -not (Test-Path 'dist\index.html')) {
    Zprava 'Městečko ještě není nainstalované. Ve složce projektu spusť „Nainstalovat-Windows.bat“.'
    exit 1
  }
  Start-Process -FilePath 'cmd.exe' -WorkingDirectory $Root -WindowStyle Minimized `
    -ArgumentList '/c', 'title Mestecko Ondik - server (zavrenim tohoto okna mestecko vypnes) & npm run serve & pause'
  $nahozeno = $false
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 500
    if (Bezi) { $nahozeno = $true; break }
  }
  if (-not $nahozeno) {
    Zprava 'Server městečka se nepodařilo spustit. Otevři minimalizované okno „Mestecko Ondik - server“ na liště a podívej se, co píše.'
    exit 1
  }
}

# Okno městečka
$prohlizece = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)
$prohlizec = $prohlizece | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

if ($prohlizec) {
  # Vlastní profil: okno se nemíchá s běžným prohlížením a pamatuje si svou polohu.
  $okno = Join-Path $env:LOCALAPPDATA 'MesteckoOndik\okno'
  $argumenty = @("--app=$url", "--user-data-dir=`"$okno`"", '--no-first-run', '--no-default-browser-check')
  if ($nastaveni['OKNO_POZICE'] -match '^-?\d+,-?\d+$') { $argumenty += "--window-position=$($nastaveni['OKNO_POZICE'])" }
  if ($nastaveni['OKNO_CELA_OBRAZOVKA'] -eq 'ano') { $argumenty += '--start-fullscreen' }
  Start-Process -FilePath $prohlizec -ArgumentList $argumenty
} else {
  Start-Process $url
}
