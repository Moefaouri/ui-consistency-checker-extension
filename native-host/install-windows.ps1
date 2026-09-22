param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-p]{32}$')]
  [string]$ExtensionId
)

$ErrorActionPreference = 'Stop'
$hostName = 'com.hakeem.ui_checker_ai'
$sourcePath = Join-Path $PSScriptRoot 'NativeHost.cs'
$buildRoot = Join-Path $env:LOCALAPPDATA 'UIConsistencyChecker\NativeHost'
$exePath = Join-Path $buildRoot 'UICheckerNativeHost.exe'
$manifestPath = Join-Path $buildRoot "$hostName.json"

New-Item -ItemType Directory -Path $buildRoot -Force | Out-Null
if (Test-Path -LiteralPath $exePath) { Remove-Item -LiteralPath $exePath -Force }
Add-Type -TypeDefinition (Get-Content -LiteralPath $sourcePath -Raw) -Language CSharp -ReferencedAssemblies 'System.Web.Extensions.dll' -OutputAssembly $exePath -OutputType ConsoleApplication

$manifest = @{
  name = $hostName
  description = 'Local Codex and Claude account bridge for UI Consistency Checker'
  path = $exePath
  type = 'stdio'
  allowed_origins = @("chrome-extension://$ExtensionId/")
} | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText($manifestPath, $manifest, [System.Text.UTF8Encoding]::new($false))

$registryPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName"
New-Item -Path $registryPath -Force | Out-Null
Set-ItemProperty -Path $registryPath -Name '(default)' -Value $manifestPath

Write-Host "Installed UI Checker local companion for extension $ExtensionId."
Write-Host 'Reload the extension before using account mode.'
