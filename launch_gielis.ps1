param(
    [ValidateSet("auto", "cst", "mock")]
    [string]$Mode = "auto",
    [int]$Port = 8000,
    [string]$Token = "",
    [switch]$NoBrowser,
    [switch]$CheckOnly,
    [switch]$RebuildFrontend
)

$ErrorActionPreference = "Stop"
$RepoRoot = $PSScriptRoot
$BackendDir = Join-Path $RepoRoot "backend"
$FrontendDir = Join-Path $RepoRoot "frontend"
$VenvPython = Join-Path $BackendDir ".venv\Scripts\python.exe"

if (-not (Test-Path $VenvPython)) {
    Write-Host "Creando entorno virtual Python en backend\.venv..." -ForegroundColor Cyan
    $SysPy = Get-Command python -ErrorAction SilentlyContinue
    if (-not $SysPy) {
        $SysPy = Get-Command py -ErrorAction Stop
        & $SysPy.Source -3 -m venv (Join-Path $BackendDir ".venv")
    } else {
        & $SysPy.Source -m venv (Join-Path $BackendDir ".venv")
    }
    & $VenvPython -m pip install --upgrade pip
    & $VenvPython -m pip install -e "$BackendDir[api,test]"
}

if ($CheckOnly) {
    & $VenvPython (Join-Path $BackendDir "check_env.py") --port $Port
    exit $LASTEXITCODE
}

$DistIndex = Join-Path $FrontendDir "dist\index.html"
if ($RebuildFrontend -or -not (Test-Path $DistIndex)) {
    $Npm = Get-Command npm -ErrorAction SilentlyContinue
    if (-not $Npm) {
        Write-Warning "No se encontro 'npm'. El servidor arrancara sin compilar frontend/dist."
    } else {
        if (-not (Test-Path (Join-Path $FrontendDir "node_modules"))) {
            Write-Host "Instalando dependencias del frontend..." -ForegroundColor Cyan
            & $Npm.Source --prefix $FrontendDir install
        }
        Write-Host "Compilando interfaz web en frontend\dist..." -ForegroundColor Cyan
        & $Npm.Source --prefix $FrontendDir run build
    }
}

$CheckJson = & $VenvPython (Join-Path $BackendDir "check_env.py") --json --port $Port
$CheckCode = $LASTEXITCODE
$Report = $CheckJson | ConvertFrom-Json
if ($CheckCode -ne 0) {
    & $VenvPython (Join-Path $BackendDir "check_env.py") --port $Port
    throw "Faltan dependencias requeridas en backend\.venv."
}

$ResolvedMode = if ($Mode -eq "auto") { $Report.recommended_mode } else { $Mode }
Write-Host ("Modo seleccionado: {0}" -f $ResolvedMode) -ForegroundColor Cyan

if (-not $NoBrowser) {
    $TargetUrl = "http://127.0.0.1:$Port/app/"
    $HealthUrl = "http://127.0.0.1:$Port/api/health"
    Start-Job -ScriptBlock {
        param($Health, $AppUrl)
        for ($i = 0; $i -lt 30; $i++) {
            try {
                $r = Invoke-RestMethod -Uri $Health -TimeoutSec 1
                if ($r.status -eq "ok") {
                    Start-Process $AppUrl
                    return
                }
            } catch {}
            Start-Sleep -Milliseconds 350
        }
    } -ArgumentList $HealthUrl, $TargetUrl | Out-Null
}

$ServerScript = Join-Path $BackendDir "start_cst_server.ps1"
$ServerArgs = @{
    Simulator = $ResolvedMode
    Port = $Port
}
if ($Token) {
    $ServerArgs.Token = $Token
}
& $ServerScript @ServerArgs
