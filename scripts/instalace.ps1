# Instalace OndiVerse na Windows.
# Spouští se dvojklikem na „Nainstalovat-Windows.bat“ v kořeni projektu.
# Dá se pustit opakovaně (např. po stažení nové verze) – existující nastavení (.env) nepřepíše.

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
. (Join-Path $PSScriptRoot 'spolecne.ps1')
$Host.UI.RawUI.WindowTitle = 'OndiVerse – instalace'

function Krok($text) { Write-Host ''; Write-Host "> $text" -ForegroundColor Yellow }
function Ok($text) { Write-Host "  OK  $text" -ForegroundColor Green }
function Konec($text, $kod = 1) {
  Write-Host ''
  if ($kod -ne 0) { Write-Host "  CHYBA  $text" -ForegroundColor Red } else { Write-Host $text -ForegroundColor Cyan }
  Read-Host 'Stiskni Enter pro zavření'
  exit $kod
}
function ObnovPath {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}
function VerzeNode {
  try { return [int]((& node -v) -replace '^v(\d+).*', '$1') } catch { return 0 }
}

Write-Host '==============================================' -ForegroundColor Cyan
Write-Host '   OndiVerse – instalace' -ForegroundColor Cyan
Write-Host '==============================================' -ForegroundColor Cyan
Write-Host "Složka: $Root"

# 1) Node.js ---------------------------------------------------------------
Krok 'Kontroluji Node.js'
if ((VerzeNode) -lt 22) {
  Write-Host '  Node.js 22 nebo novější tu není.'
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    $odp = Read-Host '  Mám ho teď nainstalovat? (A/N)'
    if ($odp -match '^[aAyY]') {
      & winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
      ObnovPath
    }
  }
  if ((VerzeNode) -lt 22) {
    Start-Process 'https://nodejs.org/cs/download'
    Konec 'Nainstaluj Node.js (verze LTS) z otevřené stránky a pak spusť instalaci znovu.'
  }
}
Ok "Node.js $(& node -v)"

# 2) Závislosti -------------------------------------------------------------
Krok 'Stahuji knihovny (poprvé to může trvat pár minut)'
& npm install --no-fund --no-audit
if ($LASTEXITCODE -ne 0) { Konec 'npm install selhal – zkontroluj připojení k internetu a zkus to znovu.' }
Zapis-Otisk (Join-Path $Root 'node_modules\.otisk-knihoven') (Otisk-Knihoven $Root)
Ok 'Knihovny jsou připravené'

# 3) Nastavení (.env) --------------------------------------------------------
$envFile = Join-Path $Root '.env'
$utf8 = New-Object System.Text.UTF8Encoding $false   # bez BOM – jinak by ho Node nepřečetl
if (-not (Test-Path $envFile)) {
  Krok 'Nastavení'
  Write-Host '  API klíč najdeš na https://console.anthropic.com/settings/keys'
  Write-Host '  (vložíš ho pravým tlačítkem myši nebo Ctrl+V; při psaní není vidět)'
  $sec = Read-Host '  Claude API klíč' -AsSecureString
  $klic = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)).Trim()
  if ($klic -and -not $klic.StartsWith('sk-ant-')) { Write-Host '  Pozor: klíč obvykle začíná „sk-ant-“. Kdyžtak ho oprav v souboru .env.' -ForegroundColor Yellow }
  Write-Host ''
  Write-Host '  Heslo do městečka je potřeba jen pro přístup z telefonu.'
  $heslo = Read-Host '  Heslo (Enter = bez hesla, městečko poběží jen na tomhle počítači)'
  $radky = @(
    '# Nastavení OndiVerse (vytvořila instalace). Klíč nikomu neposílej.',
    "ANTHROPIC_API_KEY=$klic",
    "OFFICE_PASSWORD=$heslo",
    'PORT=8787'
  )
  [IO.File]::WriteAllText($envFile, (($radky -join "`n") + "`n"), $utf8)
  Ok 'Nastavení uloženo do .env'
} else {
  Ok 'Nastavení (.env) už existuje – nechávám ho beze změny'
}

# 4) Monitor ----------------------------------------------------------------
$obsah = [IO.File]::ReadAllText($envFile)
if ($obsah -notmatch '(?m)^\s*OKNO_POZICE\s*=') {
  Add-Type -AssemblyName System.Windows.Forms
  $obrazovky = [System.Windows.Forms.Screen]::AllScreens
  $pozice = ''
  $cela = 'ne'
  if ($obrazovky.Count -gt 1) {
    Krok 'Na kterém monitoru má městečko běžet?'
    for ($i = 0; $i -lt $obrazovky.Count; $i++) {
      $o = $obrazovky[$i]
      $popis = if ($o.Primary) { 'hlavní' } else { 'vedlejší' }
      Write-Host ("  {0}) {1}  {2}×{3}  (pozice {4},{5})" -f ($i + 1), $popis, $o.Bounds.Width, $o.Bounds.Height, $o.Bounds.X, $o.Bounds.Y)
    }
    $vyber = Read-Host '  Číslo monitoru (Enter = vedlejší)'
    $idx = -1
    if ($vyber -match '^\d+$') {
      $idx = [int]$vyber - 1
    } else {
      for ($i = 0; $i -lt $obrazovky.Count; $i++) { if (-not $obrazovky[$i].Primary) { $idx = $i; break } }
    }
    if ($idx -ge 0 -and $idx -lt $obrazovky.Count) {
      $b = $obrazovky[$idx].Bounds
      $pozice = "$($b.X + 80),$($b.Y + 80)"
    }
    $odp = Read-Host '  Spouštět přes celou obrazovku? (A/N, Enter = A)'
    if (-not $odp -or $odp -match '^[aAyY]') { $cela = 'ano' }
  }
  [IO.File]::AppendAllText($envFile, "`n# Okno městečka: pozice levého horního rohu (x,y) a celá obrazovka (ano/ne)`nOKNO_POZICE=$pozice`nOKNO_CELA_OBRAZOVKA=$cela`n", $utf8)
  if ($pozice) { Ok "Okno se bude otevírat na zvoleném monitoru ($pozice)" }
}

# 5) Sestavení --------------------------------------------------------------
Krok 'Sestavuji městečko'
& npm run build
if ($LASTEXITCODE -ne 0) { Konec 'Sestavení selhalo – pošli mi prosím text chyby výše.' }
Zapis-Otisk (Join-Path $Root 'dist\.otisk') (Otisk-Zdroju $Root)
Ok 'Hotovo'

# 6) Zástupce na ploše -------------------------------------------------------
Krok 'Vytvářím zástupce na ploše'
$plocha = [Environment]::GetFolderPath('Desktop')
$lnk = Join-Path $plocha 'OndiVerse.lnk'
# ikona se starým názvem (dřív „Městečko Ondik“) by jinak zůstala na ploše
$stara = Join-Path $plocha "M$([char]0x011B)ste$([char]0x010D)ko Ondik.lnk"
if (Test-Path $stara) { Remove-Item $stara -Force -ErrorAction SilentlyContinue }
$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut($lnk)
$sc.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$sc.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Root\scripts\spustit.ps1`""
$sc.WorkingDirectory = $Root
$sc.IconLocation = "$Root\scripts\ikona.ico,0"
$sc.Description = 'Spustí OndiVerse'
$sc.WindowStyle = 7
$sc.Save()
Ok "Zástupce: $lnk"

Write-Host ''
Write-Host '==============================================' -ForegroundColor Cyan
Write-Host '   Hotovo! Městečko spustíš ikonou na ploše.' -ForegroundColor Cyan
Write-Host '==============================================' -ForegroundColor Cyan
$odp = Read-Host 'Spustit městečko hned teď? (A/N, Enter = A)'
if (-not $odp -or $odp -match '^[aAyY]') { & (Join-Path $PSScriptRoot 'spustit.ps1') }
