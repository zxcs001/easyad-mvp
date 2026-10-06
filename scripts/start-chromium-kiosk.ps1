# Launches a persistent display profile. Does not change Windows startup or power settings.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$AppOrigin,
    [string]$BrowserPath,
    [string]$ProfileDirectory = (Join-Path $env:LOCALAPPDATA 'EasyAD\ChromiumKiosk')
)

$ErrorActionPreference = 'Stop'
[Uri]$origin = $null
if (-not [Uri]::TryCreate($AppOrigin, [UriKind]::Absolute, [ref]$origin) -or
    $origin.Scheme -notin @('https', 'http') -or $origin.UserInfo -or
    $origin.AbsolutePath -ne '/' -or $origin.Query -or $origin.Fragment) {
    throw 'AppOrigin must be an origin such as https://display.example.com or http://localhost:3001.'
}
if ($origin.Scheme -eq 'http' -and -not $origin.IsLoopback) {
    throw 'Use HTTPS for a remote server. The player requires a secure context for offline recovery.'
}

if (-not $BrowserPath) {
    $installRoots = @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:LOCALAPPDATA) | Where-Object { $_ }
    $candidates = @($installRoots | ForEach-Object { Join-Path $_ 'Google\Chrome\Application\chrome.exe' })
    $candidates += Join-Path $env:LOCALAPPDATA 'Chromium\Application\chrome.exe'
    $BrowserPath = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
}
if (-not $BrowserPath -or -not (Test-Path -LiteralPath $BrowserPath -PathType Leaf)) {
    throw 'Chrome/Chromium was not found. Supply -BrowserPath with the installed browser executable.'
}
if ([IO.Path]::GetFileName($BrowserPath) -ieq 'msedge.exe') {
    throw 'Edge native kiosk uses InPrivate storage. Use Chrome/Chromium to preserve EasyAD pairing and offline data.'
}
if ($ProfileDirectory -match '["\r\n]') { throw 'ProfileDirectory cannot contain quotes or line breaks.' }
$profilePath = [IO.Path]::GetFullPath($ProfileDirectory)
[void][IO.Directory]::CreateDirectory($profilePath)
$playerUrl = $origin.GetLeftPart([UriPartial]::Authority) + '/player?kiosk=1'
$arguments = @(
    "--user-data-dir=`"$profilePath`"",
    '--kiosk',
    '--no-first-run',
    '--no-default-browser-check',
    "`"$playerUrl`""
)
Start-Process -FilePath $BrowserPath -ArgumentList $arguments
Write-Host "Opened $playerUrl"
Write-Host "Display profile: $profilePath"
Write-Host 'Pair this profile once. Reuse the same profile and origin after restarting.'
