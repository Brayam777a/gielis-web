# Bitácora técnica — GielisMeta-CST

**Fecha de trabajo:** 7 de noviembre de 2026  
**Responsable:** Miguel  
**Rama de trabajo:** `Miguel`  
**Proyecto:** Migración de GielisMeta-CST desde MATLAB App Designer hacia React + Python/FastAPI + CST Studio Suite 2025.

---

## 1. Resumen ejecutivo

Durante la jornada se avanzó principalmente en la preparación y prueba del flujo de simulación del caso **absorber** en Python y CST, además de poner en marcha la comunicación prevista entre el frontend React del PC A y el backend FastAPI del PC B.

El frontend React ya dispone de los controles para consultar el servidor y solicitar simulaciones. El backend FastAPI existente responde localmente en el PC B, pero la conexión desde el PC A no quedó operativa porque ambos equipos están en redes distintas y no se completó el acceso remoto mediante túnel.

El caso absorber llegó a generar un proyecto CST y se intentó ejecutar el solver y exportar resultados. La generación del modelo está comprobada; la ejecución completa del solver y la extracción de parámetros S todavía no están validadas. Por tanto, el avance de hoy debe considerarse **integración inicial del caso absorber en Python/CST**, no una simulación electromagnética final validada.

---

## 2. Estado de los equipos y entorno

### PC A — Frontend

- Repositorio local: `C:\Gielis\gielis-web`.
- Aplicación React ejecutada desde `frontend`.
- Comandos utilizados:

  ```powershell
  cd C:\Gielis\gielis-web\frontend
  npm install
  npm run dev
  ```

- URL local de desarrollo: `http://localhost:5173/`.
- Se realizó `git pull origin main` para actualizar el frontend.
- Antes de actualizar, no aparecían los controles de conexión; después del pull se visualizaron los controles de estado del servidor y simulación.
- Se comprobó que `frontend/.env.local` no existe:

  ```powershell
  Test-Path .env.local
  # False
  ```

### PC B — Backend y CST

- CST Studio Suite 2025 instalado.
- Python 3.12.10 de 64 bits.
- Las bibliotecas Python de CST se importaron correctamente con:

  ```powershell
  $env:PYTHONPATH = "C:\Program Files (x86)\CST Studio Suite 2025\AMD64\python_cst_libraries"
  py -3.12 -c "import cst.interface; import cst.results; print('OK')"
  ```

- Se confirmó que `cst.interface` y `cst.results` están disponibles.
- El backend se inició localmente con Uvicorn:

  ```powershell
  cd C:\Gielis\gielis-web-main-current\gielis-web-main\backend
  $env:GIELIS_SIMULATOR = "mock"
  $env:GIELIS_CORS_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"
  .\.venv\Scripts\python.exe -m uvicorn gielis_api.main:app --host 0.0.0.0 --port 8000
  ```

- Se comprobó desde el propio PC B que `http://127.0.0.1:8000/api/health` responde correctamente.
- El backend se inició en modo `mock`; esto **no equivale a ejecutar una simulación real en CST**.

---

## 3. Avances en el caso absorber con Python y CST

### 3.1 Constructor del modelo

Se trabajó con `model_builder.py`, que contiene la clase `CSTModelBuilder` y las operaciones para construir geometría mediante el historial VBA de CST.

Se identificaron y utilizaron estas capacidades:

- Definición de unidades: geometría en mm, frecuencia en GHz y tiempo en ns.
- Definición del fondo electromagnético como vacío.
- Definición de materiales dieléctricos y conductores.
- Creación de bloques (`brick`).
- Creación de polígonos extruidos.
- Operación booleana de sustracción entre sólidos.
- Construcción del sustrato y plano de tierra.
- Construcción de anillos concéntricos mediante extrusión y sustracción.

El método `build_absorber(case, geometry)` construye el caso absorber de estructura normal. El constructor identifica componentes para Gielis, sustrato, tierra y anillos exteriores/interiores.

### 3.2 Parámetros del caso de referencia

Se utilizó el caso absorber de referencia con los siguientes parámetros conocidos:

| Parámetro | Valor |
|---|---:|
| Modo | `absorber` |
| Estructura | `normal` |
| Gielis `a4` | 3 |
| Gielis `b` | 3.6 |
| Gielis `m` | 8 |
| Gielis `n1` | 1.1 |
| Gielis `n2` | 1.7 |
| Gielis `n3` | 1.7 |
| Separación (`gap`) | 1.6 |
| `size1` | 1.5 |
| `size2` | 1.0 |
| Rotación | 0° |
| Desplazamientos `dx`, `dy` | 0 |
| Sustrato | FR-4 |
| Dimensiones del sustrato | 30 × 30 × 1.6 mm |
| Permitividad relativa | 4.3 |
| Tangente de pérdidas | 0.02 |
| Espesor de cobre | 0.035 mm |
| Barrido de frecuencia | 1–8 GHz |
| Monitor de campo | E |
| Frecuencia del monitor | 2.435 GHz |

Los archivos de parámetros de referencia del proyecto son `absorber_case_params.json`, `transmitter_case_params.json` y `sensor_case_params.json`. En esta jornada el caso trabajado fue absorber; transmitter y sensor quedan para etapas posteriores.

### 3.3 Proyecto CST generado

Se generó el proyecto de referencia:

```text
C:\Gielis\gielis-web-main-current\gielis-web-main\backend\runs\20261107_185821_absorber_reference\Gielis_Absorber_Reference.cst
```

- El archivo `.cst` se creó y se comprobó su existencia.
- Tamaño registrado: 622,297 bytes.
- Se generó también una copia de respaldo `.cst.backup`.
- La creación del proyecto y de los componentes geométricos constituye el resultado comprobado de esta etapa.

### 3.4 Solver y resultados

Se ejecutó el script `run_absorber_reference.py`, que invocó:

```python
project.model3d.run_solver()
```

Durante la ejecución CST mostró advertencias relacionadas con la alta conductividad del cobre y se reportaron errores que no quedaron identificados ni diagnosticados en esta jornada. Se decidió limpiar los mensajes de CST y no continuar investigando esos errores en esta sesión.

Posteriormente se ejecutó `export_cst_results.py`:

```text
Exportados: 0 de 18 resultados S.
```

Se inspeccionó el árbol de resultados de CST. Entre los nodos observados estaban:

- `1D Results\Adaptive Meshing\f=8\Meshcells`
- `1D Results\Adaptive Meshing\...\S-Parameters\Delta\All S-Parameters`
- Nodos de parámetros S con nombres del tipo `SZmax(1),Zmax(1)`.
- `1D Results\Convergence\S-Parameters\All S-Parameters`.

La biblioteca `cst.results.ProjectFile` pudo abrir el proyecto y consultar el árbol de resultados y los identificadores de ejecución. Sin embargo, las llamadas probadas a `get_result_item(...)` no recuperaron los datos esperados para `run_id=0`. La extracción de S11/S21 queda pendiente de diagnóstico.

**Conclusión técnica:** no se debe presentar el caso como una simulación CST finalizada ni afirmar que se obtuvieron curvas S11/S21 válidas. Se confirmó la construcción del proyecto; el solver y la lectura/exportación de resultados requieren continuación.

---

## 4. Integración frontend React y backend FastAPI

### 4.1 Frontend

Después de actualizar la rama `main` en el PC A, aparecieron los controles previstos en la barra de simulación:

- Conectar con el servidor.
- Estado de conexión.
- Botón Simular, habilitado según el estado del servidor y la validez del caso.

El frontend ya tiene un hook de integración (`useSimulation`) que consulta el estado, envía simulaciones, realiza polling, permite cancelar y recupera el estado de trabajos. No fue necesario rehacer esta parte del frontend.

### 4.2 Backend disponible en el repositorio

La implementación FastAPI existente incluye:

- `GET /api/health`
- `POST /api/simulations`
- `GET /api/simulations`
- `GET /api/simulations/{job_id}`
- `POST /api/simulations/{job_id}/cancel`

El gestor de trabajos ejecuta simulaciones secuencialmente mediante un worker, apropiado para evitar ejecuciones concurrentes de CST sobre una misma instancia/licencia.

En el estado de código revisado, el simulador predeterminado solo admite `GIELIS_SIMULATOR=mock`. La integración real de CST requiere implementar y conectar el adaptador correspondiente (`CSTSimulator`/`CSTAdapter`) y su configuración. Por ello, que FastAPI responda en `/api/health` no demuestra que la simulación real de CST esté integrada.

### 4.3 Pruebas de conectividad

- Desde el PC B, la consulta local a `http://127.0.0.1:8000/api/health` respondió correctamente.
- Desde el PC A, React mostró inicialmente `Servidor apagado`.
- Se confirmó que los PC A y B están en redes distintas. Por tanto, `localhost` en el PC A no apunta al PC B, y la IP privada del PC B no es directamente accesible desde la otra red.
- Se comprobó que `frontend/.env.local` no existe. En ausencia de `VITE_API_URL`, el frontend utiliza la URL predeterminada `http://localhost:8000`, que apunta al propio PC A.

---

## 5. Intento de túnel remoto con Cloudflare

Se ejecutó en el PC B:

```powershell
cloudflared tunnel --url http://127.0.0.1:8000
```

Cloudflare creó la siguiente URL temporal:

```text
https://sole-today-messages-rebates.trycloudflare.com
```

El diagnóstico automático mostró:

- Resolución DNS: PASS para `region1.v2.argotunnel.com` y `region2.v2.argotunnel.com`.
- Conectividad QUIC: PASS para `region1`; FAIL para `region2`.
- Conectividad TCP/HTTP2: PASS para `region1`; FAIL para `region2`.
- Acceso a `api.cloudflare.com:443`: PASS.
- Diagnóstico final: `hard_fail=true`, con indicación de que puede estar bloqueado el tráfico saliente por el puerto 7844.

Se indicó probar HTTP/2 explícitamente:

```powershell
cloudflared tunnel --protocol http2 --url http://127.0.0.1:8000
```

No quedó documentada una prueba final satisfactoria desde el PC A hacia la URL del túnel. Por tanto, **la conexión React → FastAPI entre ambos equipos sigue pendiente**.

La URL Quick Tunnel es temporal y no debe considerarse una dirección estable de despliegue. Además, la API actual no debe exponerse públicamente de forma permanente sin autenticación y controles de acceso.

---

## 6. Pruebas realizadas y resultados

| Prueba | Resultado | Estado |
|---|---|---|
| Importar `cst.interface` y `cst.results` con Python 3.12 | Importación correcta | Correcta |
| Abrir/crear proyecto CST de absorber | Archivo `.cst` creado | Correcta |
| Construir geometría del absorber con el builder | Componentes del modelo creados | Parcialmente validada |
| Ejecutar `run_solver()` | Se inició; se observaron advertencias y errores no diagnosticados | Pendiente |
| Exportar resultados S | `0 de 18` exportados | No validada |
| Abrir proyecto con `cst.results.ProjectFile` | Proyecto y árbol consultables | Correcta |
| Recuperar resultados con `get_result_item` | No se recuperaron los datos esperados para run ID 0 | Pendiente |
| Iniciar FastAPI local en PC B | Uvicorn iniciado | Correcta |
| Consultar `/api/health` desde PC B | Respuesta correcta | Correcta |
| Actualizar frontend con `git pull origin main` | Controles de conexión visibles | Correcta |
| Detectar `.env.local` en frontend | `Test-Path .env.local` devolvió `False` | Confirmado |
| Conectar PC A con PC B por IP privada | Equipos en redes distintas; sin conexión directa | No viable en la configuración actual |
| Crear Cloudflare Quick Tunnel | URL temporal creada; prechecks con fallos de red | Parcial, sin conexión extremo a extremo confirmada |

---

## 7. Situación al cierre del 7 de noviembre

### Completado o comprobado

- Entorno Python/CST operativo en el PC B.
- Bibliotecas oficiales `cst.interface` y `cst.results` importables.
- Builder Python disponible y probado para construir el modelo geométrico del absorber normal.
- Proyecto CST de referencia generado y guardado.
- Frontend React actualizado y con controles de conexión visibles.
- Backend FastAPI existente ejecutándose localmente en modo `mock`.
- Endpoint local `/api/health` comprobado en el PC B.
- Diagnóstico de la causa inmediata de la conexión fallida: el frontend no tiene `.env.local` y su URL predeterminada `localhost:8000` apunta al PC A.

### No completado

- Adaptador real `CSTSimulator`/`CSTAdapter` integrado en FastAPI.
- Configuración y validación completa del solver para el caso absorber.
- Extracción fiable de S11 y S21 desde el proyecto CST.
- Confirmación de curvas de absorción calculadas a partir de resultados CST.
- Comunicación React → FastAPI entre PC A y PC B.
- Validación de una simulación real solicitada desde la interfaz React.

---

## 8. Continuación recomendada para la siguiente jornada

1. **Revisar el caso absorber en CST:** abrir el proyecto de referencia, comprobar el estado del solver y resolver la configuración necesaria para obtener resultados S válidos.
2. **Completar la extracción de resultados:** identificar las rutas reales de S11/S21 en el árbol de CST y verificar la lectura con `cst.results` antes de integrarla en la API.
3. **Implementar el adaptador CST:** conectar el builder existente con la ejecución del solver y el mapeo al esquema `SimulationResult`.
4. **Conectar el adaptador a FastAPI:** conservar `MockSimulator` para pruebas y seleccionar el simulador CST mediante configuración explícita.
5. **Resolver la conectividad entre equipos:** probar el túnel HTTP/2 o adoptar una VPN overlay; después configurar `VITE_API_URL` en `frontend/.env.local` y reiniciar Vite.
6. **Ejecutar una prueba extremo a extremo:** enviar el caso absorber desde React, observar el trabajo en FastAPI/CST y comprobar que los resultados mostrados proceden del solver real.
7. Una vez validado absorber, continuar con transmitter y sensor.

---

## 9. Comandos y referencias útiles

### Iniciar FastAPI localmente en el PC B

```powershell
cd C:\Gielis\gielis-web-main-current\gielis-web-main\backend
$env:GIELIS_SIMULATOR = "mock"
$env:GIELIS_CORS_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"
.\.venv\Scripts\python.exe -m uvicorn gielis_api.main:app --host 0.0.0.0 --port 8000
```

### Comprobar salud local en el PC B

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/health
```

### Iniciar túnel HTTP/2 (prueba temporal)

```powershell
cloudflared tunnel --protocol http2 --url http://127.0.0.1:8000
```

### Configurar URL de API en PC A

Archivo: `frontend/.env.local`

```env
VITE_API_URL=https://<URL-HTTPS-DEL-TUNEL>
```

Después de modificar `.env.local`, reiniciar el servidor de desarrollo de Vite.

### Repositorio

- GitHub: https://github.com/Brayam777a/gielis-web
- Rama frontend/backend conocida en PC A: `main`.
- Rama de trabajo solicitada para esta bitácora: `Miguel`.

---

**Nota de precisión:** esta bitácora separa los resultados comprobados de las tareas pendientes. La creación del modelo absorber en CST sí se realizó; no se considera demostrado que el solver haya producido resultados electromagnéticos válidos ni que el frontend haya quedado conectado al backend remoto.
