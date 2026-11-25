# Gielis Web

Interfaz web para GielisMeta-CST. Permite diseñar, previsualizar y simular en CST Studio Suite estructuras microstrip basadas en la súperfórmula de Gielis (absorbente, transmisor y sensor), sin depender de MATLAB App Designer.

## Requisitos

- Windows 64 bits con CST Studio Suite 2025 y licencia (solo en el PC que corre CST).
- Python 3.12 de 64 bits. Python 3.14 no es compatible con las librerías de CST 2025.
- Node.js LTS para compilar o desarrollar la interfaz web.

## Arranque rápido en Windows

Haz doble clic en `GielisWeb.bat` o ejecuta desde PowerShell en la raíz del proyecto:

```powershell
.\launch_gielis.ps1
```

El script crea `backend\.venv` si falta, compila la web, revisa dependencias con `backend/check_env.py`, elige `cst` o `mock` según encuentre CST 2025 y abre `http://127.0.0.1:8000/app/`.

Opciones habituales:

```powershell
.\launch_gielis.ps1 -Mode mock        # simula en modo prueba sin abrir CST
.\launch_gielis.ps1 -Token "mi-clave" # protege /api/simulations con token
.\launch_gielis.ps1 -CheckOnly        # solo verifica dependencias
```

Si quieres revisar el entorno en cualquier sistema operativo:

```bash
python backend/check_env.py
```

## Conectar varios PCs a un servidor con CST

Un equipo con CST Studio Suite 2025 atiende a cualquier navegador en la red local o por Tailscale, ejecutando una simulación a la vez para no chocar licencias.

1. **En el PC con CST:** actualiza la rama e inicia el servidor:

   ```powershell
   git pull origin Rama-Miguel2
   .\backend\start_cst_server.ps1
   ```

   Si quieres pedir token a los clientes, agrega `-Token "tu-clave"`. Si los demás equipos no logran entrar al puerto `8000`, abre la regla de firewall como administrador:

   ```powershell
   New-NetFirewallRule -DisplayName "Gielis CST Server" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow -Profile Private
   ```

2. **En los otros PCs (misma red local):** abre en el navegador la dirección `[LAN]` que imprimió el servidor (`http://<IP-LAN>:8000/app/`), o entra desde Vite/GitHub Pages y cambia la URL desde el botón `Servidor` arriba a la derecha.

3. **En los otros PCs (otra red):** instala [Tailscale](https://tailscale.com/download) en ambos equipos con la misma cuenta (`winget install tailscale.tailscale`) y usa la IP `[Tailscale]` (`100.x.y.z`) que muestra `start_cst_server.ps1`.

No expongas FastAPI directo a Internet sin token ni túnel privado. Por defecto, cada simulación tiene un límite de 30 minutos (`GIELIS_SIM_TIMEOUT_SECONDS=1800`) y el servidor conserva las últimas 50 corridas (`GIELIS_MAX_RUNS=50`).

## Desarrollo y pruebas a mano

```powershell
# Backend (modo mock, sin CST)
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[api,test]"
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\python.exe -m uvicorn gielis_api.main:app --reload --port 8000
```

```powershell
# Frontend
cd frontend
npm install
npm test
npm run dev
```

## Dónde está cada cosa

- `launch_gielis.ps1`, `GielisWeb.bat`: arranque automático en Windows.
- `backend/gielis_geometry/`: cálculo de curva de Gielis, envolvente radial, anillos y puentes CSRR.
- `backend/gielis_api/`: servidor FastAPI, cola secuencial (`JobManager`), `MockSimulator` e integración CST 2025 (`cst/`).
- `frontend/`: aplicación React + TypeScript con Vite.
- `docs/DOCUMENTACION.md` y `docs/CAMBIOS_WEB_2026-11-24.md`: arquitectura detallada y registro de cambios.
