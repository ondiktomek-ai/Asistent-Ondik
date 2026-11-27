# Povolení mikrofonu pro okno OndiVerse (když ho omylem zakážeš).
# Okno městečka má vlastní profil prohlížeče – tento skript ho zavře, smaže uložená oprávnění
# (a s nimi i zapamatovanou polohu okna) a městečko znovu otevře. Pak stačí u Jarvise dát „Povolit“.

$ErrorActionPreference = 'Continue'
$profily = Join-Path $env:LOCALAPPDATA 'MesteckoOndik'

# 1) zavřít jen okno městečka (prohlížeč s profilem MesteckoOndik), ne tvůj běžný Edge/Chrome
try {
  Get-CimInstance Win32_Process -Filter "Name = 'msedge.exe' OR Name = 'chrome.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine -like '*MesteckoOndik*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
} catch {
  Write-Host 'Okno městečka se nepodařilo zavřít automaticky – zavři ho prosím ručně a spusť tohle znovu.'
}
Start-Sleep -Seconds 2

# 2) smazat profil okna (oprávnění, poloha okna) – data městečka (chaty, paměť) zůstávají
foreach ($slozka in @('okno-edge', 'okno')) {
  $cesta = Join-Path $profily $slozka
  if (Test-Path $cesta) { Remove-Item -Recurse -Force $cesta -ErrorAction SilentlyContinue }
}
Write-Host 'Hotovo – oprávnění okna jsou smazaná. Otevírám městečko…'

# 3) znovu otevřít městečko
& (Join-Path $PSScriptRoot 'spustit.ps1')
