# Spuštění OndiVerse na Windows – volá ho zástupce na ploše.
# 1) Pozná novou verzi (rozbalený ZIP): doinstaluje knihovny, sestaví ji a restartuje starý server.
# 2) Pokud server neběží, spustí ho v minimalizovaném okně (zavřením toho okna městečko vypneš).
# 3) Otevře městečko jako samostatné okno (Chrome/Edge v režimu aplikace) na zvoleném monitoru.
# Na začátku se podívá na GitHub, jestli není nová verze, a když ano, sama ji stáhne.
# -BezOkna: jen aktualizovat a restartovat server (tlačítko „Aktualizovat“ v městečku).
param([switch]$BezOkna)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
. (Join-Path $PSScriptRoot 'spolecne.ps1')
# Čerstvá PATH (např. po instalaci Node.js), aby se našel npm.
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')

function Zprava($text) {
  Add-Type -AssemblyName PresentationFramework
  [void][System.Windows.MessageBox]::Show($text, 'OndiVerse')
}

# Nastavení z .env
$nastaveni = @{}
if (Test-Path '.env') {
  foreach ($radek in [IO.File]::ReadAllLines((Join-Path $Root '.env'))) {
    if ($radek -match '^\s*([A-Z_]+)\s*=\s*(.*?)\s*$') { $nastaveni[$Matches[1]] = $Matches[2] }
  }
}
$port = if ($nastaveni['PORT']) { $nastaveni['PORT'] } else { '8787' }
# 127.0.0.1 místo „localhost“ – Windows by jinak zkoušel nejdřív IPv6 (::1), kde server neposlouchá.
$url = "http://127.0.0.1:$port"

# Běží server? Zkusíme se připojit na port (bez HTTP, aby do toho nemohla vstoupit proxy ani antivir).
function Bezi {
  $c = New-Object System.Net.Sockets.TcpClient
  try {
    $pokus = $c.BeginConnect('127.0.0.1', [int]$port, $null, $null)
    if (-not $pokus.AsyncWaitHandle.WaitOne(1000)) { return $false }
    $c.EndConnect($pokus)
    return $true
  } catch {
    return $false
  } finally {
    $c.Close()
  }
}

# Zastaví běžící server městečka (proces na portu i jeho okno).
function Zastav-Server {
  $pid0 = $null
  try {
    $spojeni = Get-NetTCPConnection -LocalPort ([int]$port) -State Listen -ErrorAction Stop | Select-Object -First 1
    if ($spojeni) { $pid0 = $spojeni.OwningProcess }
  } catch {
    # záloha přes netstat (starší Windows); stav je v češtině „NASLOUCHÁNÍ“, proto ho nekontrolujeme
    $radek = netstat -ano -p TCP | Select-String -Pattern "^\s*TCP\s+\S+:$port\s+\S+:0\s+\S+\s+(\d+)\s*$" | Select-Object -First 1
    if ($radek) { $pid0 = [int]$radek.Matches[0].Groups[1].Value }
  }
  if (-not $pid0) { return }
  $proces = Get-CimInstance Win32_Process -Filter "ProcessId=$pid0"
  $cil = $proces
  # najdeme okno serveru (cmd.exe s titulkem městečka), ať zmizí i ono
  $p = $proces
  for ($k = 0; $k -lt 6 -and $p -and $p.ParentProcessId; $k++) {
    $p = Get-CimInstance Win32_Process -Filter "ProcessId=$($p.ParentProcessId)"
    if ($p -and $p.Name -eq 'cmd.exe' -and ($p.CommandLine -like '*OndiVerse - server*' -or $p.CommandLine -like '*Mestecko Ondik - server*')) { $cil = $p; break }
  }
  & taskkill.exe /PID $cil.ProcessId /T /F | Out-Null
  for ($i = 0; $i -lt 20 -and (Bezi); $i++) { Start-Sleep -Milliseconds 500 }
}

if (-not (Test-Path 'node_modules') -and -not (Test-Path 'dist\index.html')) {
  Zprava 'Městečko ještě není nainstalované. Ve složce projektu spusť „Nainstalovat-Windows.bat“.'
  exit 1
}

# Nová verze na GitHubu? Stáhne se sama (sestavení a restart zařídí kód níže).
try { [void](Aktualizuj $Root $nastaveni) } catch { }

# Je potřeba něco aktualizovat?
$otisk = Otisk-Zdroju $Root
$otiskKnihoven = Otisk-Knihoven $Root
$souborOtisku = Join-Path $Root 'dist\.otisk'
$souborKnihoven = Join-Path $Root 'node_modules\.otisk-knihoven'
$souborSpusteni = Join-Path $Root 'data\spusteno.txt'
$potrebaKnihoven = (Precti-Otisk $souborKnihoven) -ne $otiskKnihoven
$potrebaSestavit = $potrebaKnihoven -or (Precti-Otisk $souborOtisku) -ne $otisk -or -not (Test-Path 'dist\index.html')

# Běží server ze starší verze? (spustila ho starší ikona nebo jiné soubory) → restart
if ((Bezi) -and ($potrebaSestavit -or (Precti-Otisk $souborSpusteni) -ne $otisk)) {
  Zastav-Server
}

if (-not (Bezi)) {
  $kroky = @()
  if ($potrebaKnihoven) { $kroky += "echo Aktualizuji knihovny... && npm install --no-fund --no-audit && (echo $otiskKnihoven)>node_modules\.otisk-knihoven" }
  if ($potrebaSestavit) { $kroky += "echo Sestavuji novou verzi mestecka... && npm run build && (echo $otisk)>dist\.otisk" }
  # smyčka: když server požádá o restart (obnova po výpadku služeb), spustí se znovu
  $kroky += 'call scripts\server-smycka.cmd'
  $prikaz = 'title OndiVerse - server (zavrenim tohoto okna mestecko vypnes) & ' + ($kroky -join ' && ') + ' & pause'
  # při aktualizaci okno ukážeme, ať je vidět, že se něco děje
  $styl = if ($potrebaSestavit) { 'Normal' } else { 'Minimized' }
  $server = Start-Process -FilePath 'cmd.exe' -WorkingDirectory $Root -WindowStyle $styl -PassThru -ArgumentList '/c', $prikaz
  Zapis-Otisk $souborSpusteni $otisk
  $limit = if ($potrebaSestavit) { 480 } else { 60 }   # půlsekundy: sestavení může trvat pár minut
  for ($i = 0; $i -lt $limit; $i++) {
    Start-Sleep -Milliseconds 500
    if (Bezi) { break }
    if ($server.HasExited) {
      Zprava 'Server městečka se nepodařilo spustit. Spusť znovu „Nainstalovat-Windows.bat“ a kdyžtak pošli text chyby.'
      exit 1
    }
  }
  # I kdyby kontrola nic nenašla, server běží (okno je otevřené) – okno městečka otevřeme tak jako tak.
}

# Okno městečka – přednostně Edge (má kvalitní české hlasy pro Jarvise: Antonín, Vlasta).
# Kdo chce Chrome, dá do .env řádek PROHLIZEC=chrome.
$edge = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)
$chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$prohlizece = if ($nastaveni['PROHLIZEC'] -eq 'chrome') { $chrome + $edge } else { $edge + $chrome }
$prohlizec = $prohlizece | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

# aktualizace z městečka: okno už je otevřené a samo se obnoví
if ($BezOkna) { exit 0 }

if ($prohlizec) {
  # Vlastní profil: okno se nemíchá s běžným prohlížením a pamatuje si svou polohu.
  # Edge a Chrome nesmí sdílet jeden profil – každý má svou složku.
  $slozka = if ($prohlizec -match 'msedge') { 'okno-edge' } else { 'okno' }
  $okno = Join-Path $env:LOCALAPPDATA "MesteckoOndik\$slozka"
  # autoplay: Jarvis smí sám promluvit (autopilot – pozdrav po spuštění, ranní hlášení, připomínky)
  $argumenty = @("--app=$url", "--user-data-dir=`"$okno`"", '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required')
  if ($nastaveni['OKNO_POZICE'] -match '^-?\d+,-?\d+$') { $argumenty += "--window-position=$($nastaveni['OKNO_POZICE'])" }
  if ($nastaveni['OKNO_CELA_OBRAZOVKA'] -eq 'ano') { $argumenty += '--start-fullscreen' }
  Start-Process -FilePath $prohlizec -ArgumentList $argumenty
} else {
  Start-Process $url
}
