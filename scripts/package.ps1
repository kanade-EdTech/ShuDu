$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$projectRoot = Split-Path -Parent $PSScriptRoot
$distRoot = Join-Path $projectRoot 'dist'
foreach ($targetName in @('toy', 'xhs')) {
    $sourcePath = (Resolve-Path -LiteralPath (Join-Path $distRoot $targetName)).Path
    $zipPath = Join-Path $distRoot ('vocal-sudoku-' + $targetName + '.zip')
    if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
    [IO.Compression.ZipFile]::CreateFromDirectory($sourcePath, $zipPath, [IO.Compression.CompressionLevel]::Optimal, $false)
    $archive = [IO.Compression.ZipFile]::OpenRead($zipPath)
    try {
        if (-not ($archive.Entries | Where-Object { $_.FullName -eq 'index.html' })) { throw 'ZIP root entry missing' }
        foreach ($entry in $archive.Entries) {
            if ($entry.FullName -match '^[/\\]|\.\.') { throw 'Unsafe ZIP entry' }
            $sourceFile = Join-Path $sourcePath $entry.FullName
            $stream = $entry.Open()
            $hash = [Security.Cryptography.SHA256]::Create()
            try { $zipHash = [BitConverter]::ToString($hash.ComputeHash($stream)) }
            finally { $stream.Dispose(); $hash.Dispose() }
            $sourceStream = [IO.File]::OpenRead($sourceFile)
            $hash = [Security.Cryptography.SHA256]::Create()
            try { $sourceHash = [BitConverter]::ToString($hash.ComputeHash($sourceStream)) }
            finally { $sourceStream.Dispose(); $hash.Dispose() }
            if ($zipHash -ne $sourceHash) { throw ('ZIP entry mismatch: ' + $entry.FullName) }
        }
        $zipSize = (Get-Item -LiteralPath $zipPath).Length
        if ($zipSize -gt 10MB) { throw 'ZIP exceeds 10 MiB' }
        Write-Output ('Packaged ' + $targetName + ': ' + $archive.Entries.Count + ' entries, ' + $zipSize + ' bytes; all entry hashes verified.')
    } finally { $archive.Dispose() }
}
