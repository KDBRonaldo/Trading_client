param(
    [switch]$StopMySql
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Test-IsAdministrator {
    $currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-ProcessChildren {
    param([int]$ParentId)

    Get-CimInstance Win32_Process -Filter "ParentProcessId = $ParentId" -ErrorAction SilentlyContinue
}

function Stop-ProcessTree {
    param([int]$ProcessId)

    $children = Get-ProcessChildren -ParentId $ProcessId
    foreach ($child in $children) {
        Stop-ProcessTree -ProcessId $child.ProcessId
    }

    $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if ($process) {
        Write-Host "Stopping PID $ProcessId ($($process.ProcessName))" -ForegroundColor Yellow
        Stop-Process -Id $ProcessId -Force
    }
}

function Stop-ByPort {
    param([int]$Port)

    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (-not $connections) {
        Write-Host "No listening process found on port $Port." -ForegroundColor Green
        return
    }

    $owningProcessIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($processId in $owningProcessIds) {
        Stop-ProcessTree -ProcessId $processId
    }
}

Write-Step "Stopping frontend on 5173"
Stop-ByPort -Port 5173

Write-Step "Stopping backend on 8080"
Stop-ByPort -Port 8080

if ($StopMySql) {
    Write-Step "Stopping MySQL80 service"
    $service = Get-Service -Name "MySQL80" -ErrorAction SilentlyContinue
    if (-not $service) {
        Write-Host "MySQL80 service not found." -ForegroundColor Yellow
    } elseif ($service.Status -eq "Running") {
        if (-not (Test-IsAdministrator)) {
            Write-Host "MySQL80 is running, but stopping Windows services requires an Administrator PowerShell window." -ForegroundColor Yellow
        } else {
            try {
                Stop-Service -Name "MySQL80" -ErrorAction Stop
                $service.WaitForStatus("Stopped", [TimeSpan]::FromSeconds(20))
                Write-Host "MySQL80 stopped." -ForegroundColor Green
            } catch {
                Write-Host "Failed to stop MySQL80: $($_.Exception.Message)" -ForegroundColor Yellow
            }
        }
    } else {
        Write-Host "MySQL80 is already stopped." -ForegroundColor Green
    }
}

Write-Step "Done"
Write-Host "Frontend and backend stop script finished." -ForegroundColor Green
if (-not $StopMySql) {
    Write-Host "MySQL80 was left running. Use -StopMySql if you also want to stop the database." -ForegroundColor Green
}
