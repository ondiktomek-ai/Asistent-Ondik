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
