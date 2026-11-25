# Cambios realizados en Gielis Web (24/11/2026 — rama `Rama-Miguel2`)

Resumen técnico de las mejoras implementadas hoy sobre interfaz web, backend, arranque automático y pruebas automatizadas.

---

## 1. Interfaz web (`frontend/`)

- **Selector de tema `Sistema` / `Claro` / `Oscuro`:**
  - Nuevo módulo [`frontend/src/lib/theme.ts`](../frontend/src/lib/theme.ts) con persistencia en `localStorage` (`gielis.theme`) y soporte `data-theme="light|dark"` o preferencia del sistema.
  - Precarga en [`frontend/index.html`](../frontend/index.html) para evitar parpadeo al recargar.
  - Tokens de color completos para ambos modos en [`frontend/src/index.css`](../frontend/src/index.css).
- **Corrección de arrastre vertical en la placa:**
  - Se eliminó `transform: none !important` del selector universal `*` dentro de `@media (prefers-reduced-motion: reduce)` en `index.css` (que anulaba `<g transform="scale(1,-1)">` y `<text transform="rotate(...)">` en SVG cuando Windows tenía reducción de movimiento activa, invirtiendo el desplazamiento vertical).
  - La desactivación de escala por movimiento reducido se limitó solo a botones e ítems interactivos en [`frontend/src/App.css`](../frontend/src/App.css), manteniendo intacto el movimiento en la misma dirección del cursor.
- **Resúmenes en acordeones colapsados y cabecera:**
  - Badge de modo/estructura activo y selector de tema en el encabezado ([`frontend/src/App.tsx`](../frontend/src/App.tsx)).
  - Resúmenes automáticos en los `<summary>` cerrados (`Sustrato`, `Metal`, `Frecuencias`, `Curva de Gielis`, etc.) para leer los parámetros clave sin abrir cada bloque.
  - Al cambiar de modo (`Absorbente`, `Transmisor`, `Sensor`), si el formulario sigue con los valores del artículo sin editar, carga automáticamente el preset oficial del modo elegido.
- **Popover flotante de conexión al servidor:**
  - [`frontend/src/components/SimulateBar.tsx`](../frontend/src/components/SimulateBar.tsx) abre ahora un popover bajo `Servidor: ...` con URL, campo opcional `Token API`, cierre con `Escape` o clic fuera, indicador de trabajos en cola y aviso `Requiere token` si el backend tiene `GIELIS_API_TOKEN`.
- **Barra de herramientas propia en la placa:**
  - [`frontend/src/components/BoardPreview.tsx`](../frontend/src/components/BoardPreview.tsx) incorpora controles `Cuadrícula`, `Cotas` y `Exportar SVG` sobre el lienzo, dejando el pie solo para leyenda y escala.
- **Gráficas y columna derecha de resultados:**
  - [`frontend/src/components/ResultsChart.tsx`](../frontend/src/components/ResultsChart.tsx): tooltip SVG flotante (`.results-chart__tooltip`) al pasar el cursor, líneas punteadas de referencia del artículo SoftwareX y exportación `Exportar SVG` por gráfica.
  - [`frontend/src/components/ResultsView.tsx`](../frontend/src/components/ResultsView.tsx) y [`frontend/src/lib/examples.ts`](../frontend/src/lib/examples.ts): toggle para referencias SoftwareX, tabla comparativa con columna `Δf` (diferencia en MHz), notas del solver CST, botón `Copiar resumen` y bloque `Historial` plegable con contador.

---

## 2. Backend (`backend/gielis_api/`)

- **Seguridad opcional con token (`GIELIS_API_TOKEN`):**
  - [`backend/gielis_api/main.py`](../backend/gielis_api/main.py) protege todas las rutas `/api/simulations*` aceptando `X-API-Key` o `Authorization: Bearer` (sin exigir token si no se define).
  - `/api/health` informa `auth_required` y `queue_depth`.
- **Timeouts, aborto y retención de disco (`JobManager` y `CSTSimulator`):**
  - [`backend/gielis_api/jobs.py`](../backend/gielis_api/jobs.py) agrega `GIELIS_SIM_TIMEOUT_SECONDS` (1800 s por defecto) con aborto del simulador activo y `GIELIS_MAX_RUNS` (50 corridas más recientes en disco).
  - [`backend/gielis_api/cst/simulator.py`](../backend/gielis_api/cst/simulator.py) implementa `abort_active()`, cierra `project.close()` en `finally` y guarda `error.txt` ante fallos.

---

## 3. Lanzadores, diagnóstico y CI

- [`GielisWeb.bat`](../GielisWeb.bat) y [`launch_gielis.ps1`](../launch_gielis.ps1): arranque en 1 clic que crea `.venv` si falta, compila `frontend/dist`, detecta automáticamente `cst` vs `mock` y abre `/app/`.
- [`backend/check_env.py`](../backend/check_env.py): comprobador de Python, paquetes, `frontend/dist`, librerías CST 2025 y puerto `8000` (`--json` o tabla).
- [`backend/start_cst_server.ps1`](../backend/start_cst_server.ps1): soporta `-Token`, `-MaxRuns`, `-TimeoutSeconds` y etiqueta `192.168.56.*` como `[Host-Only]`.
- [`.github/workflows/ci.yml`](../.github/workflows/ci.yml): ejecuta pruebas backend (`pytest`), `py_compile`, `check_env.py --json` y suite frontend (`vitest`, `eslint`, `vite build`).

---

## 4. Estado de verificación

- **Validado localmente:** suite backend (`87` pruebas en `pytest`), suite frontend (`51` pruebas en `vitest`), `eslint`, `tsc -b && vite build`, smoke test HTTP con autenticación y pruebas interactivas en navegador sobre `MockSimulator`.
- **Pendiente en PC B (con CST Studio Suite 2025):** correr `git pull origin Rama-Miguel2` y `.\launch_gielis.ps1 -Mode cst -RebuildFrontend` para validar los tres modos contra el solver HF Frequency Domain real.
