# Contrato API — Gielis Web

Versión 1.0 · 30/10/2026 · Fuente: documento «Contrato API — Gielis Web» en claude.ai

## Reglas generales

Este contrato fija qué JSON envía el front (React) y qué responde el backend (FastAPI en el PC con CST). Ninguno de los dos lo cambia sin avisar al otro.

- **Base URL:** `http://127.0.0.1:8000/api/v1` (backend y front corren en el PC de CST). Mientras el backend no exista, el front usa MSW con estas mismas rutas.
- **Nombres:** `snake_case`, iguales a los que ya usa `GielisGeometryService` (`size1`, `gap_mm`, `rotation_deg`).
- **Unidades en el nombre:** `_mm`, `_ghz`, `_deg`, `_db`, `_pct`. Sin unidades implícitas.
- **Versión:** todo request lleva `schema_version: "1.0"`. Un cambio que rompa compatibilidad sube a `2.0`.
- **Cambios:** se proponen editando `CONTRATO.md` en el repo, y el otro lo aprueba antes de tocar código.
- **CORS:** el backend permite el origen `http://localhost:5173` (Vite).

## Endpoints

Son 9 rutas. Las tres primeras de la tabla no necesitan CST, así que permiten avanzar el front desde el primer día.

| Método | Ruta | Para qué | Respuesta |
| --- | --- | --- | --- |
| GET | `/health` | Saber si el backend y CST están disponibles | `200` `{status, cst_available, version}` |
| GET | `/materials` | Lista fija de materiales para los selectores | `200` lista de `{id, name, kind, eps_r?, loss_tangent?}` |
| GET | `/examples` | Cargar los 3 casos de ejemplo en el formulario | `200` lista de `CaseRequest` con `id` y `name` |
| POST | `/geometry/preview` | Contorno real que irá a CST, sin simular | `200` ver «Previsualización» |
| POST | `/simulations` | Encolar una simulación | `202` `{job_id, status: "queued"}` |
| GET | `/simulations` | Historial de simulaciones | `200` lista de estados |
| GET | `/simulations/{job_id}` | Consultar el estado (polling cada 3 s) | `200` estado del job |
| GET | `/simulations/{job_id}/results` | Curvas y resonancias | `200` resultados, o `409` si no ha terminado |
| DELETE | `/simulations/{job_id}` | Cancelar | `200` estado `cancelled` |

## JSON de entrada del caso (CaseRequest)

Un solo formato sirve para los tres modos; `transmission_line` solo existe en el sensor. Ejemplo con el caso absorbente de `examples/`:

```json
{
  "schema_version": "1.0",
  "mode": "absorber",
  "structure_type": "normal",
  "gielis": { "a": 4, "b": 3.6, "m": 8, "n1": 1.1, "n2": 1.7, "n3": 1.7 },
  "substrate": {
    "material": "FR-4 (lossy)",
    "width_mm": 30, "length_mm": 30, "thickness_mm": 1.6,
    "eps_r": 4.3, "loss_tangent": 0.02
  },
  "metal": { "material": "Copper (annealed)", "thickness_mm": 0.035 },
  "concentric": {
    "gap_mm": 1.6, "size1": 1.5, "size2": 1.0,
    "rotation_deg": 0, "dx_mm": 0, "dy_mm": 0
  },
  "transmission_line": null,
  "frequency": { "min_ghz": 1, "max_ghz": 8 },
  "field_monitors": []
}
```

| Campo | Tipo | Notas |
| --- | --- | --- |
| `mode` | `absorber` \| `transmitter` \| `sensor` | Define puertos, fronteras y postproceso |
| `structure_type` | `normal` \| `complementary` | En `sensor` siempre `complementary` |
| `gielis` | `a, b, m, n1, n2, n3` | Mismos nombres que `GielisParameters` |
| `substrate` | material + dimensiones en mm | `eps_r` y `loss_tangent` editables |
| `metal` | material + `thickness_mm` |  |
| `concentric` | `gap_mm, size1, size2, rotation_deg, dx_mm, dy_mm` | Mismos nombres que `ConcentricParameters` |
| `transmission_line` | `{ "width_mm": 3 }` o `null` | Obligatorio solo en `sensor` |
| `frequency` | `min_ghz, max_ghz` |  |
| `field_monitors` | lista de `{ "type": "e" \| "h", "freq_ghz" }` | Opcional; equivale a los monitores de campo de la app |

## Reglas de validación

Las reglas de formulario se validan en los dos lados: Zod en el front para avisar al instante, Pydantic en el backend como última palabra. Las geométricas solo las puede comprobar el backend.

| Regla | Front (Zod) | Backend (Pydantic) | Mensaje al usuario |
| --- | --- | --- | --- |
| `a`, `b`, `n1` distintos de 0 | Sí | Sí | «a, b y n1 deben ser distintos de cero» |
| `m` mayor que 0 y con máximo 2 decimales | Sí | Sí | «m admite hasta 2 decimales» |
| `size1 > size2 > 0.05` | Sí | Sí | «El anillo 2 debe ser menor que el anillo 1» |
| `gap_mm > 0` | Sí | Sí | «El gap debe ser mayor que 0 mm» |
| Espesores > 0, `eps_r` ≥ 1, `loss_tangent` ≥ 0 | Sí | Sí | Mensaje por campo |
| `max_ghz > min_ghz > 0` | Sí | Sí | «La frecuencia máxima debe superar la mínima» |
| `sensor` exige `transmission_line` y `complementary` | Sí | Sí | «El modo sensor requiere ancho de línea» |
| La curva de Gielis da valores finitos | Solo aviso | Sí | «Estos parámetros generan una curva inválida» |
| El anillo 2 cabe dentro del anillo 1 | No | Sí, puede autoajustar | Advertencia con el valor ajustado |
| La estructura cabe en el sustrato | No | Sí | «La estructura se sale del sustrato» |

El límite de 2 decimales en `m` evita un problema real: con `m = 3.14159`, Python calcula un periodo de 400 000π y MATLAB uno de 452π, y con 8000 muestras ninguna de las dos curvas sale bien.

## Previsualización de geometría

El backend es la única fuente de verdad de la geometría que va a CST. El front dibuja la curva cruda al instante en el navegador, y pide `/geometry/preview` (con un retardo de unos 300 ms tras el último cambio) para mostrar el contorno real.

**Request:** el mismo `CaseRequest`; el backend ignora `frequency` y `field_monitors`.

**Respuesta:**

```json
{
  "envelope": [[x, y], ...],
  "contours": { "c1": [[x, y], ...], "c2": [...], "c3": [...], "c4": [...] },
  "bridges": [[[x, y], ...], [[x, y], ...]],
  "effective": { "gap_mm": 1.6, "size1": 1.5, "size2": 1.0 },
  "areas_mm2": { "ring1": 92.32, "ring2": 59.49, "total": 151.82 },
  "bounds_mm": [-12.77, -12.77, 12.77, 12.77],
  "warnings": [
    { "code": "SIZE2_ADJUSTED", "message": "size2 se ajustó de 1.4 a 1.2 para que el anillo 2 quepa" }
  ]
}
```

- `bridges` solo viene en modo `sensor`.
- `effective` existe porque `build_concentric` corrige `size2` y `gap_mm` en silencio. El front debe mostrar el valor ajustado y la advertencia, no el que escribió el usuario.
- Coordenadas en mm, contornos cerrados (último punto = primero), unos 720 puntos por contorno.

## Estado del job y resultados

Un job pasa por `queued → running → done | failed`, y puede pasar a `cancelled` desde `queued` o `running`. Solo corre un job a la vez, porque CST usa una licencia y una ventana.

**Estado** (`GET /simulations/{job_id}`):

```json
{
  "job_id": "abc123",
  "mode": "absorber",
  "status": "running",
  "queue_position": 0,
  "stage": "solving",
  "created_at": "2026-10-30T18:40:00Z",
  "started_at": "2026-10-30T18:41:10Z",
  "finished_at": null,
  "error": null
}
```

`stage` puede ser `building_model`, `meshing`, `solving` o `postprocessing`. Le dice al usuario en qué va, ya que CST no da un porcentaje fiable.

**Resultados** (`GET /simulations/{job_id}/results`):

```json
{
  "job_id": "abc123",
  "mode": "absorber",
  "frequency_ghz": [1.0, 1.007, ...],
  "series": [
    { "id": "s11", "label": "S11", "unit": "db", "values": [...] },
    { "id": "absorption", "label": "Absorción", "unit": "pct", "values": [...] }
  ],
  "resonances": [
    { "series_id": "s11", "freq_ghz": 2.435, "value": -16.87 },
    { "series_id": "s11", "freq_ghz": 3.849, "value": -10.26 }
  ],
  "effective": { "gap_mm": 1.6, "size1": 1.5, "size2": 1.0 },
  "cst_project_file": "abc123/model.cst"
}
```

Las series cambian según el modo, pero el formato es el mismo, así el front tiene un solo componente de gráfica:

| Modo | Series | Referencia en `examples/` |
| --- | --- | --- |
| `absorber` | `s11` (dB), `absorption` (%) | 2.435 GHz, S11 = −16.87 dB, 97.9 % |
| `transmitter` | `s21` (dB) del modo Floquet SZmin(1),Zmax(1); una estructura por job | Convencional: máximo en 3.478 GHz, −0.07 dB |
| `sensor` | `s21` (dB) | Con εr = 1: resonancia en 4.171 GHz |

## Errores

Todo error tiene la misma forma, para que el front lo muestre siempre igual. `message` va en español y es para el usuario; `details` es para depurar.

```json
{
  "error": {
    "code": "GEOMETRY_ERROR",
    "message": "El anillo 2 no cabe dentro del anillo 1 con este gap.",
    "field": "concentric.gap_mm",
    "details": {}
  }
}
```

| `code` | HTTP | Cuándo |
| --- | --- | --- |
| `VALIDATION_ERROR` | 422 | Un campo no cumple las reglas; `field` dice cuál |
| `GEOMETRY_ERROR` | 422 | La geometría no se puede construir (`GeometryValidationError`) |
| `NOT_FOUND` | 404 | El `job_id` no existe |
| `NOT_READY` | 409 | Se piden resultados de un job que no terminó |
| `CST_UNAVAILABLE` | 503 | CST no abre o no hay licencia |
| `SIMULATION_FAILED` | 200 dentro del estado | CST falló durante el job; va en `error` del estado |
| `TIMEOUT` | 200 dentro del estado | El job superó el tiempo máximo |

Con `field`, el front puede marcar en rojo el campo exacto del formulario.

## Decisiones tomadas

Las seis preguntas abiertas quedaron cerradas el 30/10/2026; con esto se pueden programar las rutas `/simulations`.

| Tema | Decisión | Efecto en el contrato |
| --- | --- | --- |
| Materiales | Lista fija | Nueva ruta `GET /materials`; `substrate.material` y `metal.material` deben ser un `id` de esa lista |
| Transmisor | Una curva por job (v1) | Cada job simula solo el `structure_type` pedido y devuelve una serie `s21`; para comparar normal y complementary se lanzan dos jobs. Juntar las dos curvas en un job queda para v2 |
| Sensor | Gota de analito y barrido de εr fuera de v1 | v1 simula el sensor con el `eps_r` del sustrato; el barrido llega en v2 |
| Red | Todo en el PC de CST, usado por RustDesk | Backend en `127.0.0.1:8000`; el front también corre en ese PC |
| Archivo `.cst` | Queda en el PC de CST | `cst_project_file` es la ruta en ese PC; no hay descarga |
| Tiempo máximo | 30 minutos | Pasado ese tiempo el job queda en `failed` con `error.code = TIMEOUT` |
