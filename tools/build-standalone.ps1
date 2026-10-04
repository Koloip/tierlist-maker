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
foreach ($js in 'i18n.js', 'spin.js', 'tour.js', 'folder.js', 'own.js', 'app.js') {
  $html = $html.Replace("<script src=""$js""></script>", "<script>`n" + (Read-Src $js) + "</script>")
}
if ($html -match '<script src=|href="style\.css"') { throw 'Some file was not inlined - check the tags in index.html' }

$dist = Join-Path $root 'dist'
New-Item -ItemType Directory -Force -Path $dist | Out-Null
$out = Join-Path $dist 'tierlist-maker.html'
[IO.File]::WriteAllText($out, $html, $utf8)
"Built $out ($([math]::Round((Get-Item -LiteralPath $out).Length / 1KB)) KB)"
