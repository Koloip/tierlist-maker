# Builds dist/tierlist-maker.html: the whole app in one file (styles, translations and scripts inlined),
# which people can download from a release and open with a double click.
# Usage (from the repository folder):  powershell -ExecutionPolicy Bypass -File tools/build-standalone.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding($false)
function Read-Src($name) { [IO.File]::ReadAllText((Join-Path $root $name), [Text.Encoding]::UTF8) }

$html = Read-Src 'index.html'
# a single local file cannot be installed as an app, so the PWA links are dropped
$html = [regex]::Replace($html, '<link rel="(manifest|apple-touch-icon)"[^>]*>\r?\n', '')
$html = $html.Replace('<link rel="stylesheet" href="style.css">', "<style>`n" + (Read-Src 'style.css') + "</style>")
# The scripts become inline, so the security policy allows exactly these scripts by their SHA-256 instead of 'self'
# (the browser hashes the text with line breaks turned into LF, so the text is written that way too)
$sha = [Security.Cryptography.SHA256]::Create(); $hashes = @()
foreach ($js in 'i18n.js', 'spin.js', 'tour.js', 'folder.js', 'own.js', 'stats.js', 'steam.js', 'share.js', 'twitch.js', 'app.js') {
  $code = "`n" + (Read-Src $js).Replace("`r`n", "`n").Replace("`r", "`n")
  $hashes += "'sha256-" + [Convert]::ToBase64String($sha.ComputeHash($utf8.GetBytes($code))) + "'"
  $html = $html.Replace("<script src=""$js""></script>", "<script>" + $code + "</script>")
}
if ($html -match '<script src=|href="style\.css"') { throw 'Some file was not inlined - check the tags in index.html' }
if (-not $html.Contains("script-src 'self'")) { throw 'The security policy in index.html has changed - update this script' }
$html = $html.Replace("script-src 'self'", "script-src " + ($hashes -join ' '))

$dist = Join-Path $root 'dist'
New-Item -ItemType Directory -Force -Path $dist | Out-Null
$out = Join-Path $dist 'tierlist-maker.html'
[IO.File]::WriteAllText($out, $html, $utf8)
"Built $out ($([math]::Round((Get-Item -LiteralPath $out).Length / 1KB)) KB)"
