# Společné funkce pro instalaci a spouštění Městečka Ondik (Windows).

# Otisk zdrojových souborů – změní se, kdykoli rozbalíš novou verzi (jiné velikosti/časy souborů).
function Otisk-Zdroju([string]$Root) {
  $soubory = @()
  foreach ($slozka in 'src', 'server', 'public', 'scripts') {
    $cesta = Join-Path $Root $slozka
    if (Test-Path $cesta) { $soubory += Get-ChildItem -Path $cesta -Recurse -File -ErrorAction SilentlyContinue }
  }
  foreach ($soubor in 'index.html', 'package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json') {
    $cesta = Join-Path $Root $soubor
    if (Test-Path $cesta) { $soubory += Get-Item $cesta }
  }
  $text = ($soubory | Sort-Object FullName | ForEach-Object { "$($_.FullName.Substring($Root.Length))|$($_.Length)|$($_.LastWriteTimeUtc.Ticks)" }) -join "`n"
  $sha = [Security.Cryptography.SHA256]::Create()
  return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($text))) -replace '-', '').Substring(0, 24)
}

# Otisk knihoven (package-lock.json) – když se změní, je potřeba npm install.
function Otisk-Knihoven([string]$Root) {
  $lock = Join-Path $Root 'package-lock.json'
  if (-not (Test-Path $lock)) { return 'zadny' }
  return (Get-FileHash -Path $lock -Algorithm SHA256).Hash.Substring(0, 24)
}

function Precti-Otisk([string]$Soubor) {
  if (Test-Path $Soubor) { return ([IO.File]::ReadAllText($Soubor)).Trim() }
  return ''
}

function Zapis-Otisk([string]$Soubor, [string]$Hodnota) {
  $slozka = Split-Path -Parent $Soubor
  if (-not (Test-Path $slozka)) { New-Item -ItemType Directory -Path $slozka | Out-Null }
  [IO.File]::WriteAllText($Soubor, $Hodnota, (New-Object System.Text.UTF8Encoding $false))
}

# Automatická aktualizace z GitHubu (repozitář je veřejný – bez hesla).
# Když je na GitHubu novější verze, stáhne ji a přepíše zdrojové soubory; .env, data/ a knihovny
# zůstanou. Sestavení a restart serveru pak zařídí spouštěč (pozná změnu otisku). Vypnutí: AKTUALIZACE=ne.
function Aktualizuj([string]$Root, [hashtable]$Nastaveni) {
  if ($Nastaveni['AKTUALIZACE'] -eq 'ne') { return $false }
  $repo = 'ondiktomek-ai/Asistent-Ondik'
  $vetev = if ($Nastaveni['AKTUALIZACE_VETEV']) { $Nastaveni['AKTUALIZACE_VETEV'] } else { 'claude/ai-agent-office-setup-2nah22' }
  $souborVerze = Join-Path $Root '.verze'
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  $sha = $null
  # nejdřív přes git rozhraní (nepočítá se do limitu API), záloha přes API GitHubu
  try {
    $refs = Invoke-WebRequest -Uri "https://github.com/$repo.git/info/refs?service=git-upload-pack" -Headers @{ 'User-Agent' = 'git/2.45.0 (MesteckoOndik)' } -UseBasicParsing -TimeoutSec 10
    $obsah = if ($refs.Content -is [byte[]]) { [Text.Encoding]::ASCII.GetString($refs.Content) } else { [string]$refs.Content }
    $m = [regex]::Match($obsah, '([0-9a-f]{40}) refs/heads/' + [regex]::Escape($vetev) + '(\s|\x00|$)')
    if ($m.Success) { $sha = $m.Groups[1].Value }
  } catch { }
  if (-not $sha) {
    try {
      $info = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/commits/$([uri]::EscapeDataString($vetev))" -Headers @{ 'User-Agent' = 'MesteckoOndik'; 'Accept' = 'application/vnd.github+json' } -TimeoutSec 10
      $sha = [string]$info.sha
    } catch { }
  }
  if (-not $sha) { return $false }   # bez internetu / GitHub neodpovídá → spustí se stávající verze
  if (-not $sha -or (Precti-Otisk $souborVerze) -eq $sha) { return $false }

  $tmp = Join-Path $env:TEMP 'mestecko-aktualizace'
  try {
    if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
    New-Item -ItemType Directory -Path $tmp | Out-Null
    $zip = Join-Path $tmp 'verze.zip'
    $ProgressPreference = 'SilentlyContinue'   # bez ukazatele průběhu je stahování mnohem rychlejší
    Invoke-WebRequest -Uri "https://codeload.github.com/$repo/zip/$sha" -OutFile $zip -UseBasicParsing -TimeoutSec 180
    Expand-Archive -Path $zip -DestinationPath $tmp -Force
    $zdroj = Get-ChildItem -Path $tmp -Directory | Select-Object -First 1
    if (-not $zdroj -or -not (Test-Path (Join-Path $zdroj.FullName 'package.json'))) { return $false }

    # složky se zdrojáky zrcadlíme (smazané soubory zmizí i u tebe), soubory v kořeni přepíšeme
    foreach ($slozka in 'src', 'server', 'public', 'scripts') {
      $z = Join-Path $zdroj.FullName $slozka
      if (Test-Path $z) { & robocopy.exe $z (Join-Path $Root $slozka) /MIR /R:2 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null }
    }
    Get-ChildItem -Path $zdroj.FullName -File -Force | ForEach-Object { Copy-Item -Path $_.FullName -Destination (Join-Path $Root $_.Name) -Force }
    Zapis-Otisk $souborVerze $sha
    return $true
  } catch {
    return $false
  } finally {
    if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }
  }
}
