param([Parameter(Mandatory=$true)][string]$SourceStage, [Parameter(Mandatory=$true)][string]$ReleaseRoot, [Parameter(Mandatory=$true)][string]$Version)
$ErrorActionPreference = 'Stop'
# Pinned official Node.js build; verify before extracting or redistributing.
$nodeVersion = '22.23.2'
$expected = '1177b4137ba5adaa56354ae40f1080c7450e8ae09cecb47da459d1c52ac99f97'
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('roster-node-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tempRoot | Out-Null
try {
    $archive = Join-Path $tempRoot 'node.zip'
    Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/v$nodeVersion/node-v$nodeVersion-win-x64.zip" -OutFile $archive
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'Node.js checksum mismatch' }
    Expand-Archive -LiteralPath $archive -DestinationPath $tempRoot
    $stage = Join-Path $ReleaseRoot "Yituliu-Workbench-Windows-x64-v$Version"
    Copy-Item -LiteralPath $SourceStage -Destination $stage -Recurse
    $runtime = Join-Path $stage 'runtime'
    New-Item -ItemType Directory -Path $runtime | Out-Null
    $nodeRoot = Join-Path $tempRoot "node-v$nodeVersion-win-x64"
    Copy-Item -LiteralPath (Join-Path $nodeRoot 'node.exe') -Destination $runtime
    Copy-Item -LiteralPath (Join-Path $nodeRoot 'LICENSE') -Destination (Join-Path $runtime 'NODE-LICENSE.txt')
    if (Test-Path -LiteralPath (Join-Path $stage 'data/operator-catalog.json')) { throw 'Portable package must not contain a generated game catalog' }
    Compress-Archive -LiteralPath $stage -DestinationPath "$stage.zip" -CompressionLevel Optimal
} finally {
    $resolved = [IO.Path]::GetFullPath($tempRoot)
    $tempPrefix = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if (-not $resolved.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected temporary path' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
