<#
.SYNOPSIS
Launch a long-running Python job detached from the calling terminal or agent session (Windows).

.DESCRIPTION
The job runs as a hidden, independent process: closing the terminal, restarting an agent session or switching its
model does not kill it. stdout and stderr go to <LogDir>\<Name>.out.log and <Name>.err.log, and the process id to
<Name>.pid. Follow the job by reading the log files, not by holding the process. Combine it with resumable jobs
(services/garments/generate_sizes.py skips sizes whose outputs already exist and validate), so a killed run is simply
launched again.

.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File tools\launch_detached.ps1 -Name sizes-neutral `
    -Arguments "generate_sizes.py --bodies neutral --report ../../outputs/garment-tests/sizes-sprint-3a-neutral.json"

Then: Get-Content outputs\logs\sizes-neutral.out.log -Tail 5
Stop: Stop-Process -Id (Get-Content outputs\logs\sizes-neutral.pid)
#>
param(
    [Parameter(Mandatory = $true)][string]$Name,  # log/pid file stem
    [Parameter(Mandatory = $true)][string]$Arguments,  # arguments to Python (script path relative to -WorkDir)
    [string]$WorkDir = "",  # default: services\garments
    [string]$Python = "",  # default: external\mhr-venv\Scripts\python.exe
    [string]$LogDir = ""  # default: outputs\logs (outputs/ is git-ignored)
)
$ErrorActionPreference = "Stop"
# Windows PowerShell 5.1 does not set $PSScriptRoot while binding parameter defaults, so resolve them here.
$repo = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (-not $WorkDir) { $WorkDir = Join-Path $repo "services\garments" }
if (-not $Python) { $Python = Join-Path $repo "external\mhr-venv\Scripts\python.exe" }
if (-not $LogDir) { $LogDir = Join-Path $repo "outputs\logs" }
if (-not (Test-Path $Python)) { throw "Python not found: $Python (pass -Python)" }
if (-not (Test-Path $WorkDir)) { throw "Working directory not found: $WorkDir (pass -WorkDir)" }
New-Item -ItemType Directory -Force $LogDir | Out-Null
$LogDir = (Resolve-Path $LogDir).Path
$out = Join-Path $LogDir "$Name.out.log"
$err = Join-Path $LogDir "$Name.err.log"
$pidFile = Join-Path $LogDir "$Name.pid"
if (Test-Path $pidFile) {
    $previous = Get-Process -Id ([int](Get-Content $pidFile)) -ErrorAction SilentlyContinue
    if ($previous -and $previous.ProcessName -like "python*") { throw "$Name is still running (pid $($previous.Id)); stop it or pick another -Name" }
}
$env:PYTHONUNBUFFERED = "1"  # log lines appear as they are printed
$process = Start-Process -FilePath (Resolve-Path $Python).Path -ArgumentList $Arguments -WorkingDirectory (Resolve-Path $WorkDir).Path `
    -WindowStyle Hidden -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
Set-Content -Path $pidFile -Value $process.Id
"started $Name pid $($process.Id) at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'); stdout $out; stderr $err"
