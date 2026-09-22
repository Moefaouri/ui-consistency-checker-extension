$ErrorActionPreference = 'Stop'
$registryPath = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.hakeem.ui_checker_ai'
$buildRoot = Join-Path $env:LOCALAPPDATA 'UIConsistencyChecker\NativeHost'
if (Test-Path -LiteralPath $registryPath) { Remove-Item -LiteralPath $registryPath -Recurse -Force }
if (Test-Path -LiteralPath $buildRoot) { Remove-Item -LiteralPath $buildRoot -Recurse -Force }
Write-Host 'Removed the UI Checker local companion.'
