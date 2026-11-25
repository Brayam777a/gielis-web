# Gielis Web

Interfaz web para GielisMeta-CST: diseño, previsualización y simulación en CST
Studio Suite de estructuras basadas en la súperfórmula de Gielis (modos
absorbente, transmisor y sensor). Reemplaza la interfaz de MATLAB App Designer.

## Estructura

```text
gielis-web/
|-- launch_gielis.ps1        Lanzador en 1 paso (crea .venv, compila front, detecta CST y abre /app/)
|-- GielisWeb.bat            Acceso directo doble clic en Windows (llama a launch_gielis.ps1)
|-- backend/
|   |-- gielis_geometry/     Geometría Gielis, envolvente radial, C1–C4 y puentes CSRR
|   |-- gielis_api/          API FastAPI, cola secuencial (JobManager) y MockSimulator
|   |   `-- cst/             Integración CST 2025 (CSTModelBuilder, CSTSimulator, results_reader)
|   |-- check_env.py         Diagnóstico rápido de Python, paquetes, frontend/dist y CST 2025
|   |-- start_cst_server.ps1 Script de arranque del servidor en el PC con CST (o mock)
|   |-- run_absorber_reference.py  Script directo de referencia en CST (absorber)
|   `-- export_cst_results.py      Exportador de curvas S de proyectos .cst a CSV
|-- frontend/                React + TypeScript (Vite)
`-- docs/
    `-- DOCUMENTACION.md     Qué hemos hecho, qué falta y cómo funciona cada parte
```

## Requisitos

- Windows 64 bits con **CST Studio Suite 2025** y licencia (solo en el PC servidor que ejecuta CST).
- **Python 3.12** de 64 bits. Python 3.14 no funciona con la librería de CST 2025.
- **Node.js LTS** (para compilar o desarrollar el frontend).

---

## Arranque rápido en 1 clic (Windows)

Haz doble clic en **`GielisWeb.bat`** (o ejecuta desde PowerShell en la raíz del repo):

```powershell
.\launch_gielis.ps1
```

El lanzador crea `backend\.venv` si falta, compila `frontend\dist`, verifica el entorno con `backend\check_env.py`, selecciona automáticamente `cst` (si detecta CST Studio Suite 2025) o `mock`, inicia el servidor y abre `http://127.0.0.1:8000/app/` en tu navegador.

Opciones útiles:

```powershell
.\launch_gielis.ps1 -CheckOnly        # solo diagnostica requisitos y dependencias
.\launch_gielis.ps1 -Mode mock        # fuerza simulador de prueba sin abrir CST
.\launch_gielis.ps1 -Token "mi-clave" # protege /api/simulations* con X-API-Key / Bearer
```

Diagnóstico manual desde cualquier sistema operativo:

```bash
python backend/check_env.py
```

---

## Escenario 1: Desarrollo local en un solo PC (modo prueba `mock`, sin CST)

Útil para diseñar, previsualizar geometrías y probar el flujo web sin necesitar licencia de CST:

```powershell
# Terminal 1: backend en modo prueba (mock)
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[api,test]"
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\python.exe -m uvicorn gielis_api.main:app --reload --port 8000

# Terminal 2: frontend Vite
cd ..\frontend
npm install
npm run dev
```

Abre en el navegador: `http://localhost:5173/`.

---

## Escenario 2: Conectar 2 o más computadores a 1 PC servidor con CST 2025

Esta arquitectura permite que un laboratorio o equipo de trabajo conecte **N computadores clientes** (sin necesidad de instalar CST, Python ni Node.js en ellos) hacia **1 único PC con CST Studio Suite 2025**.

```text
PCs clientes (Navegador: PC A, PC 2, ..., PC N)
         │
         │ HTTP/JSON (Red local LAN o VPN Tailscale)
         ▼
PC Servidor con CST 2025 (PC B: Uvicorn + JobManager + CSTSimulator)
         │  (cola secuencial: 1 simulación a la vez)
         ▼
CST Studio Suite 2025 (.cst, solver HF Frequency Domain, curvas S)
```

### Paso 1: Preparar y encender el PC Servidor (el que tiene CST 2025)

1. Instala dependencias del backend y compila la página web (solo la primera vez o tras actualizar):

   ```powershell
   cd <ruta-del-repo>\gielis-web
   git pull origin Rama-Miguel2

   cd backend
   py -3.12 -m venv .venv
   .\.venv\Scripts\python.exe -m pip install -e ".[api,test]"

   cd ..\frontend
   npm install
   npm run build
   ```

2. Arranca el servidor CST con un solo comando desde la raíz del repo:

   ```powershell
   cd <ruta-del-repo>\gielis-web
   .\backend\start_cst_server.ps1
   ```

   *(Para probar sin lanzar CST, usa `.\backend\start_cst_server.ps1 -Simulator mock`).*

   El script configura `PYTHONPATH` hacia `C:\Program Files (x86)\CST Studio Suite 2025\AMD64\python_cst_libraries`, activa `GIELIS_SIMULATOR=cst` e imprime las direcciones listas para usar, por ejemplo:

   ```text
   Direcciones disponibles para conectar desde otros PCs:
     [LAN] http://10.2.4.40:8000/app/
     [LAN API] http://10.2.4.40:8000
     [Tailscale] http://100.85.10.20:8000/app/
     [Tailscale API] http://100.85.10.20:8000
   ```

3. **Firewall de Windows (si los otros PCs no logran conectar al puerto `8000`):**
   Ejecuta en PowerShell como **Administrador** en el PC servidor:

   ```powershell
   New-NetFirewallRule -DisplayName "Gielis CST Server" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow -Profile Private
   ```

### Paso 2: Conectar desde los PCs clientes

Elige el caso según dónde estén ubicados los computadores:

#### Caso A — Todos en la misma red local (LAN / WiFi del laboratorio)

- **Opción más rápida (sin instalar nada en los clientes):**
  Abre el navegador en cualquier PC y entra directamente a la URL `[LAN]` que imprimió el servidor:
  `http://<IP-LAN-DEL-SERVIDOR>:8000/app/` (por ejemplo `http://10.2.4.40:8000/app/`).
- **Opción desde Vite (`http://localhost:5173/`) o GitHub Pages:**
  1. En la barra superior derecha haz clic en el botón **`Servidor: ...`**.
  2. Escribe `http://<IP-LAN-DEL-SERVIDOR>:8000` y pulsa **Conectar**.
  *(La dirección queda guardada en el navegador con `localStorage`, no hace falta crear archivos `.env.local`).*

#### Caso B — Computadores en redes distintas (ej. PC A en casa ↔ PC B en universidad)

Como las IPs privadas de redes distintas no son visibles entre sí y los túneles temporales cambian de URL o se bloquean en redes institucionales, usa **Tailscale** (red privada virtual gratuita entre tus propios dispositivos):

1. Instala **Tailscale** en el **PC Servidor** y en cada **PC cliente** (`https://tailscale.com/download` o por consola):
   ```powershell
   winget install tailscale.tailscale
   ```
2. Inicia sesión con la misma cuenta (o red Tailscale compartida) en ambos equipos.
3. Vuelve a ejecutar `.\backend\start_cst_server.ps1` en el PC Servidor; verás aparecer la IP fija `[Tailscale]` (`100.x.y.z`).
4. Desde cualquier PC cliente, abre `http://<IP-TAILSCALE>:8000/app/` o introduce `http://<IP-TAILSCALE>:8000` en el botón **`Servidor: ...`** de la página.

> **Seguridad, límites y retención:**
> - Para proteger tu licencia de CST en redes compartidas, pasa un token al servidor (`.\backend\start_cst_server.ps1 -Token "tu-clave"` o `$env:GIELIS_API_TOKEN`) e ingrésalo en el botón **`Servidor: ...`** del navegador.
> - Por defecto el backend aplica un tiempo límite de 30 minutos por simulación (`GIELIS_SIM_TIMEOUT_SECONDS=1800`), cierra el proyecto CST al terminar o fallar (guardando `error.txt` en la carpeta de la corrida) y conserva en disco las últimas 50 simulaciones (`GIELIS_MAX_RUNS=50`).
> - No expongas FastAPI directamente a Internet sin token ni túnel privado (Tailscale).

### Cómo funciona la cola multi-usuario (`JobManager`)

- Aunque varios computadores envíen simulaciones al mismo tiempo, `JobManager` las ordena en una **cola secuencial** (1 simulación CST a la vez) para evitar choques de licencia o proyectos abiertos en CST Studio Suite.
- Cada simulación crea su propia carpeta independiente en `backend/runs/cst_<fecha>_<modo>_<id>/` con `input.json`, `metadata.json`, `cst_result_tree.txt` y el proyecto `.cst`, sin sobrescribir corridas anteriores.
- Cada cliente ve en **Resultados** el avance en tiempo real, las líneas/tabla de referencia del artículo SoftwareX, el historial compartido del servidor y puede descargar S-parámetros en CSV, copiar el resumen o exportar la placa en SVG.

## Reglas de trabajo

- Lee primero `docs/DOCUMENTACION.md`: explica cada parte del proyecto.
- Commits pequeños, uno por tarea.
