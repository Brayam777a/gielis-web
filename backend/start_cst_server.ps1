param(
    [ValidateSet("cst", "mock")]
    [string]$Simulator = "cst",
    [int]$Port = 8000,
    [string]$Token = "",
    [int]$MaxRuns = 50,
    [int]$TimeoutSeconds = 1800
)

$ErrorActionPreference = "Stop"
$BackendDir = $PSScriptRoot
Set-Location $BackendDir

$CstLibs = "C:\Program Files (x86)\CST Studio Suite 2025\AMD64\python_cst_libraries"
if ($Simulator -eq "cst") {
    if (-not (Test-Path $CstLibs)) {
        Write-Warning "No se encontro CST en '$CstLibs'. Verifica la ruta o usa -Simulator mock."
    } elseif ($env:PYTHONPATH) {
        if ($env:PYTHONPATH -notlike "*$CstLibs*") {
            $env:PYTHONPATH = "$CstLibs;$env:PYTHONPATH"
        }
    } else {
        $env:PYTHONPATH = $CstLibs
    }
}

$env:GIELIS_SIMULATOR = $Simulator
$env:GIELIS_MAX_RUNS = "$MaxRuns"
$env:GIELIS_SIM_TIMEOUT_SECONDS = "$TimeoutSeconds"
if ($Token) {
    $env:GIELIS_API_TOKEN = $Token
    Write-Host "Autenticacion por token ACTIVADA (X-API-Key / Bearer)." -ForegroundColor Yellow
}

$Python = Join-Path $BackendDir ".venv\Scripts\python.exe"
if (-not (Test-Path $Python)) {
    throw "No se encontro el entorno virtual en '$Python'."
}

Write-Host "Iniciando Gielis Web ($Simulator) en puerto $Port..." -ForegroundColor Green
Write-Host "Direcciones disponibles para conectar desde otros PCs:"
Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "169.254.*" -and $_.IPAddress -ne "127.0.0.1" } |
    ForEach-Object {
        $ip = $_.IPAddress
        $alias = $_.InterfaceAlias
        $tag = if ($ip -like "100.*") {
            "Tailscale"
        } elseif ($ip -like "192.168.56.*" -or $alias -like "*VirtualBox*" -or $alias -like "*VMware*") {
            "Host-Only"
        } else {
            "LAN"
        }
        Write-Host ("  [{0}] http://{1}:{2}/app/" -f $tag, $ip, $Port)
        Write-Host ("  [{0} API] http://{1}:{2}" -f $tag, $ip, $Port)
    }

& $Python -m uvicorn gielis_api.main:app --host 0.0.0.0 --port $Port
