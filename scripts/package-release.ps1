param([switch]$IncludeRuntime, [switch]$IncludePortable)

$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$releaseRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot 'release'))
if ([IO.Path]::GetDirectoryName($releaseRoot) -ne $projectRoot) {
    throw 'Refusing to package outside the project root.'
}

$package = Get-Content -Raw -LiteralPath (Join-Path $projectRoot 'package.json') | ConvertFrom-Json
$version = [string]$package.version
$sourceName = "Yituliu-Local-Roster-Workbench-Source-v$version"
$runtimeName = "Yituliu-Local-Roster-Workbench-Windows-v$version"

if (Test-Path -LiteralPath $releaseRoot) {
    # This directory is generated solely by this script and was validated above.
    Remove-Item -LiteralPath $releaseRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $releaseRoot | Out-Null

$sourceStage = Join-Path $releaseRoot $sourceName
New-Item -ItemType Directory -Path $sourceStage | Out-Null
foreach ($directory in @('.github', 'assets', 'scripts', 'src', 'docs')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $directory) -Destination $sourceStage -Recurse
}
New-Item -ItemType Directory -Path (Join-Path $sourceStage 'data') | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'data\README.md') -Destination (Join-Path $sourceStage 'data')
foreach ($file in @(
    '.editorconfig', '.gitattributes', '.gitignore', 'LICENSE', 'CHANGELOG.md',
    'CONTRIBUTING.md', 'DESIGN_AND_RISKS.md', 'PUBLISHING.md', 'README.md',
    'README.en.md', 'README.zh-CN.md', 'SECURITY.md', 'THIRD_PARTY_NOTICES.md', 'arkprts_export.py',
    'index.html', 'package.json', 'server.ps1'
)) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination $sourceStage
}
Get-ChildItem -LiteralPath $projectRoot -File | Where-Object { $_.Extension -in '.cmd', '.txt' } | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $sourceStage
}

# ZIP extraction bypasses Git's eol rules. Normalize Windows entry points here
# so a downloaded source archive behaves like a proper Windows checkout.
$utf8Bom = New-Object Text.UTF8Encoding($true)
$utf8NoBom = New-Object Text.UTF8Encoding($false)
foreach ($cmd in Get-ChildItem -LiteralPath $sourceStage -Filter '*.cmd') {
    $text = [IO.File]::ReadAllText($cmd.FullName).Replace("`r`n", "`n").Replace("`n", "`r`n")
    [IO.File]::WriteAllText($cmd.FullName, $text, $utf8NoBom)
}
$serverPath = Join-Path $sourceStage 'server.ps1'
$serverText = [IO.File]::ReadAllText($serverPath).TrimStart([char]0xFEFF).Replace("`r`n", "`n").Replace("`n", "`r`n")
[IO.File]::WriteAllText($serverPath, $serverText, $utf8Bom)

$sourceZip = Join-Path $releaseRoot "$sourceName.zip"
Compress-Archive -LiteralPath $sourceStage -DestinationPath $sourceZip -CompressionLevel Optimal

if ($IncludeRuntime) {
    Write-Host 'Runtime packaging explicitly enabled. Refreshing public data first.' -ForegroundColor Yellow
    & node (Join-Path $projectRoot 'scripts\fetch-public-data.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Public-data update failed.' }
    & node (Join-Path $projectRoot 'scripts\build.mjs') (Join-Path $projectRoot 'dist')
    if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
    & node (Join-Path $projectRoot 'scripts\validate.mjs') (Join-Path $projectRoot 'dist')
    if ($LASTEXITCODE -ne 0) { throw 'Validation failed.' }
    $runtimeStage = Join-Path $releaseRoot $runtimeName
    Copy-Item -LiteralPath (Join-Path $projectRoot 'dist') -Destination $runtimeStage -Recurse
    Compress-Archive -LiteralPath $runtimeStage -DestinationPath (Join-Path $releaseRoot "$runtimeName.zip") -CompressionLevel Optimal
}

if ($IncludePortable) {
    & (Join-Path $PSScriptRoot 'package-portable.ps1') -SourceStage $sourceStage -ReleaseRoot $releaseRoot -Version $version
}

$hashLines = Get-ChildItem -LiteralPath $releaseRoot -Filter '*.zip' | Sort-Object Name | ForEach-Object {
    "{0}  {1}" -f (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant(), $_.Name
}
[IO.File]::WriteAllLines((Join-Path $releaseRoot 'SHA256SUMS.txt'), $hashLines, $utf8NoBom)
Write-Host "Release files prepared in $releaseRoot" -ForegroundColor Green
