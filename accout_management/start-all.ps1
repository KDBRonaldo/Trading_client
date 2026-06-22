param(
    [string]$DbUser = "root",
    [string]$DbPassword = "MySQL5201104",
    [string]$DbName = "account_db",
    [string]$BlacklistBaseUrl = "http://10.196.95.30:8081",
    [switch]$ResetDb
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendRoot = Join-Path $repoRoot "frontend"
$scriptsRoot = Join-Path $repoRoot "scripts"
$logsRoot = Join-Path $repoRoot "logs"

New-Item -ItemType Directory -Force -Path $logsRoot | Out-Null

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Get-MysqlExe {
    $candidates = @(
        "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe",
        "C:\Program Files\MySQL\MySQL Workbench 8.0 CE\mysql.exe"
    )

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    $fromPath = Get-Command mysql.exe -ErrorAction SilentlyContinue
    if ($fromPath) {
        return $fromPath.Source
    }

    throw "mysql.exe not found."
}

function Ensure-ServiceRunning {
    param([string]$ServiceName)

    $service = Get-Service -Name $ServiceName -ErrorAction Stop
    if ($service.Status -ne "Running") {
        Start-Service -Name $ServiceName
        $service.WaitForStatus("Running", [TimeSpan]::FromSeconds(20))
    }
}

function Invoke-MysqlScript {
    param(
        [string]$MysqlExe,
        [string]$Database,
        [string]$SqlFile
    )

    # MySQL 的 source 命令在 Windows 下不能解析反斜杠路径（会将 \U 等视为转义）。
    $mysqlSourcePath = $SqlFile -replace "\\", "/"
    $arguments = @(
        "-u", $DbUser,
        "--password=$DbPassword",
        "--default-character-set=utf8mb4",
        $Database
    )

    Get-Content -Raw -Encoding UTF8 $SqlFile | & $MysqlExe @arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to execute SQL script: $SqlFile"
    }
}

function Invoke-MysqlQuery {
    param(
        [string]$MysqlExe,
        [string]$Database,
        [string]$Query
    )

    $arguments = @(
        "-N",
        "-s",
        "-u", $DbUser,
        "--password=$DbPassword",
        "--default-character-set=utf8mb4",
        $Database,
        "-e", $Query
    )

    $result = & $MysqlExe @arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to execute SQL query: $Query"
    }
    return ($result | Out-String).Trim()
}

function Test-PortListening {
    param([int]$Port)
    return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Wait-PortListening {
    param(
        [int]$Port,
        [int]$TimeoutSeconds = 60
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-PortListening -Port $Port) {
            return
        }
        Start-Sleep -Seconds 2
    }

    throw "Timed out waiting for port: $Port"
}

function Wait-HttpReachable {
    param(
        [string]$Url,
        [int]$TimeoutSeconds = 60
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5 | Out-Null
            return
        } catch {
            Start-Sleep -Seconds 2
        }
    }

    throw "Timed out waiting for: $Url"
}

function Ensure-DatabaseReady {
    param([string]$MysqlExe)

    Write-Step "Checking database"

    & $MysqlExe -u $DbUser "--password=$DbPassword" --default-character-set=utf8mb4 -e "CREATE DATABASE IF NOT EXISTS $DbName DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_0900_ai_ci;"
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to create database: $DbName"
    }

    $staffTableExists = Invoke-MysqlQuery -MysqlExe $MysqlExe -Database $DbName -Query "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '$DbName' AND table_name = 'staff';"
    $staffCount = "0"
    if ($staffTableExists -eq "1") {
        $staffCount = Invoke-MysqlQuery -MysqlExe $MysqlExe -Database $DbName -Query "SELECT COUNT(*) FROM staff;"
    }

    if ($ResetDb -or $staffTableExists -ne "1" -or $staffCount -eq "0") {
        Write-Host "Initializing database schema and seed data..." -ForegroundColor Yellow
        Invoke-MysqlScript -MysqlExe $MysqlExe -Database $DbName -SqlFile (Join-Path $scriptsRoot "mysql_schema_current.sql")
        Invoke-MysqlScript -MysqlExe $MysqlExe -Database $DbName -SqlFile (Join-Path $scriptsRoot "mysql_seed_smoke.sql")
    } else {
        Write-Host "Database already has base data. Skip init." -ForegroundColor Green
    }
}

function Start-Backend {
    Write-Step "Starting backend"

    if (Test-PortListening -Port 8080) {
        Write-Host "Backend already listening on 8080." -ForegroundColor Green
        return
    }

    $backendLog = Join-Path $logsRoot "backend.log"
    $command = "cd '$repoRoot'; " +
        "`$env:ACCOUNT_DB_USERNAME='$DbUser'; " +
        "`$env:ACCOUNT_DB_PASSWORD='$DbPassword'; " +
        "`$env:ACCOUNT_BLACKLIST_BASE_URL='$BlacklistBaseUrl'; " +
        "mvn spring-boot:run *> '$backendLog'"

    Start-Process powershell -ArgumentList "-NoProfile", "-Command", $command -WindowStyle Hidden | Out-Null
    Wait-PortListening -Port 8080 -TimeoutSeconds 90
}

function Start-Frontend {
    Write-Step "Starting frontend"

    if (Test-PortListening -Port 5173) {
        Write-Host "Frontend already listening on 5173." -ForegroundColor Green
        return
    }

    $frontendLog = Join-Path $logsRoot "frontend.log"
    $viteBlacklistBase = "$BlacklistBaseUrl/api/trade-management"
    $command = "cd '$frontendRoot'; " +
        "`$env:VITE_TRADE_MANAGEMENT_API_BASE='$viteBlacklistBase'; " +
        "npm run dev -- --host 0.0.0.0 *> '$frontendLog'"

    Start-Process powershell -ArgumentList "-NoProfile", "-Command", $command -WindowStyle Hidden | Out-Null
    Wait-HttpReachable -Url "http://localhost:5173/login" -TimeoutSeconds 90
}

Write-Step "Checking MySQL service"
Ensure-ServiceRunning -ServiceName "MySQL80"

$mysqlExe = Get-MysqlExe
Ensure-DatabaseReady -MysqlExe $mysqlExe
Start-Backend
Start-Frontend

Write-Step "All services are ready"
Write-Host "Backend : http://localhost:8080" -ForegroundColor Green
Write-Host "Frontend: http://localhost:5173/login" -ForegroundColor Green
Write-Host "Database: mysql://localhost:3306/$DbName" -ForegroundColor Green
Write-Host "Blacklist: $BlacklistBaseUrl" -ForegroundColor Green
Write-Host "Backend log : $(Join-Path $logsRoot 'backend.log')" -ForegroundColor Green
Write-Host "Frontend log: $(Join-Path $logsRoot 'frontend.log')" -ForegroundColor Green
