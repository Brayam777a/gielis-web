# Documentación del proyecto Gielis Web

Última actualización: 6 de noviembre de 2026.

Este documento explica qué es el proyecto, qué hemos hecho, qué falta y cómo
funciona cada parte. Está pensado para leerse de principio a fin la primera
vez y luego usarse como consulta.

## Contenido

1. [Qué es el proyecto](#1-qué-es-el-proyecto)
2. [Cómo está organizado](#2-cómo-está-organizado)
3. [Lo que hemos hecho](#3-lo-que-hemos-hecho)
4. [Cómo funciona cada parte](#4-cómo-funciona-cada-parte)
5. [Cómo ejecutar el proyecto](#5-cómo-ejecutar-el-proyecto)
6. [Decisiones tomadas](#6-decisiones-tomadas)
7. [Lo que falta](#7-lo-que-falta)
8. [Problemas comunes y su solución](#8-problemas-comunes-y-su-solución)
9. [Glosario](#9-glosario)

---

## 1. Qué es el proyecto

**GielisMeta-CST** es una aplicación de MATLAB (App Designer) que diseña
estructuras electromagnéticas microstrip con formas basadas en la
**súperfórmula de Gielis**, las construye automáticamente en **CST Studio
Suite**, las simula y procesa los resultados. Tiene tres modos:

| Modo | Qué es | Qué se mide |
| --- | --- | --- |
| Absorbente | Celda periódica con plano de tierra | Absorción (a partir de S11) |
| Transmisor | Celda periódica transmisiva, normal o complementaria | S21 |
| Sensor | Resonador complementario (CSRR) acoplado a una línea microstrip | S21 y desplazamiento de la resonancia |

**Nuestro objetivo** es reemplazar la interfaz de MATLAB por una **interfaz
web**: React en el navegador y Python (FastAPI) controlando CST. La física y
los resultados deben ser los mismos que con MATLAB; lo que mejora es la
experiencia de uso.

---

## 2. Cómo está organizado

### Las piezas

```text
  Navegador                    PC con CST (laboratorio)
 ┌─────────────────┐  HTTP   ┌──────────────────────┐   VBA    ┌───────────┐
 │ Frontend        │ ──────► │ Backend (Python)     │ ───────► │ CST       │
 │ React + TS      │  JSON   │ geometría + FastAPI  │          │ Studio    │
 │ (formulario,    │ ◄────── │ + cola de simulación │ ◄─────── │ Suite     │
 │  placa, curvas) │         │                      │ resultados│           │
 └─────────────────┘         └──────────────────────┘          └───────────┘
```

- **Frontend:** lo que ve el usuario. Ya calcula y dibuja la forma de Gielis
  sin necesitar el servidor.
- **Backend:** recibe los parámetros, construye la geometría exacta, la manda a
  CST, ejecuta la simulación y devuelve las curvas. Hoy solo existe la parte de
  geometría.
- **CST:** el simulador electromagnético. Solo existe en el PC del laboratorio.

### El repositorio

```text
gielis-web/
|-- backend/
|   |-- gielis_geometry/service.py   Geometría en Python (NumPy + Shapely)
|   |-- tests/                       Pruebas automáticas (pytest)
|   |-- examples/                    Los 3 casos del artículo (JSON)
|   |-- golden/                      Valores de referencia para las pruebas
|   `-- matlab/                      Scripts para exportar datos desde MATLAB
|-- frontend/
|   `-- src/                         Código React (ver sección 4.4)
`-- docs/
    `-- DOCUMENTACION.md             Este archivo
```

Repositorio en GitHub: <https://github.com/Brayam777a/gielis-web>

---

## 3. Lo que hemos hecho

| Fecha | Qué | Resultado |
| --- | --- | --- |
| 19/10/2026 | Plan inicial en 4 fases (documento *Avances-Gielis*) | Objetivo y alcance definidos |
| 19/10/2026 | Auditoría del código MATLAB (`CST_MicrowaveStudio.m`, `GielisMetaCST.mlapp`, macros, ejemplos) | La app manda bloques de texto VBA a CST; se pueden portar a Python casi tal cual |
| 30/10/2026 | Prueba de concepto ("spike"): controlar CST desde Python | Funciona con CST 2025 y **Python 3.12**. Python 3.14 no es compatible |
| 30/10/2026 | Primera versión de la geometría en Python (compañero) | Curva, envolvente, contornos C1–C4, estructuras normal, complementaria y sensor |
| 30/10/2026 | Revisión de ese código | Bien hecho; 3 correcciones necesarias (sección 4.3) |
| 30/10/2026 | Decisiones de alcance y de red | Sección 6 |
| 06/11/2026 | Repositorio en GitHub con la estructura base | 20 archivos, primer commit |
| 06/11/2026 | 2 de las 3 correcciones de la geometría | Rutas de las pruebas y periodo igual a MATLAB; **22 pruebas pasan** en Python 3.12 |
| 06/11/2026 | Entorno de trabajo en el PC personal | Python 3.12 en `.venv`, Node.js, Git |
| 06/11/2026 | Frontend base con Vite + React + TypeScript | Corre en `localhost:5173` |
| 06/11/2026 | **Previsualización en vivo de la curva de Gielis** | Coincide con Python hasta 15 decimales en los 3 casos |

---

## 4. Cómo funciona cada parte

### 4.1 La app original en MATLAB

La app tiene dos archivos principales:

- **`GielisMetaCST.mlapp`**: la interfaz (botones, campos, gráficas) y la
  lógica de geometría y postproceso, todo mezclado en un mismo archivo.
- **`CST_MicrowaveStudio.m`**: una clase que controla CST por COM (ActiveX).
  Casi todos sus métodos arman un **texto en VBA** (el lenguaje de macros de
  CST) y lo envían así:

  ```matlab
  obj.mws.invoke('addToHistory', 'nombre del paso', textoVBA);
  ```

  Por ejemplo, para crear un polígono extruido arma un bloque
  `With Extrude ... .create End With` con las coordenadas de cada punto.

**Por qué importa:** Python puede hacer exactamente lo mismo con
`project.model3d.add_to_history(nombre, vba)` de la librería `cst.interface`.
No hay que reinventar cómo se construye cada objeto en CST: hay que generar el
mismo texto VBA desde Python.

### 4.2 La súperfórmula de Gielis

Es una fórmula en coordenadas polares que, con seis números, describe formas
muy variadas (estrellas, flores, polígonos redondeados):

```text
ρ(θ) = ( |cos(mθ/4) / a|^n2 + |sin(mθ/4) / b|^n3 )^(-1/n1)
```

| Parámetro | Qué controla |
| --- | --- |
| `a`, `b` | Escala en la dirección del coseno y del seno |
| `m` | Simetría: cuántos lóbulos tiene la forma |
| `n1` | Forma general (picos agudos o redondeados) |
| `n2`, `n3` | Forma de cada término |

Con `ρ` y `θ` se obtienen los puntos: `x = ρ·cos θ`, `y = ρ·sin θ`.

**El periodo.** Si `m` no es entero, la curva tarda más de una vuelta en
cerrarse. La app lo resuelve así: escribe `m` como fracción `n/d` con la
función `rat` de MATLAB y recorre θ de 0 a `u·π`, donde `u = 2d` si `n` es par
(o si `a = b` y `n2 = n3`), y `u = 4d` en otro caso. Por ejemplo, el
transmisor usa `m = 3.4 = 17/5`, así que `u = 20` y θ da 10 vueltas.

**La envolvente radial.** Con algunos parámetros la curva se cruza consigo
misma (se ve muy claro en el transmisor). CST no puede extruir un polígono que
se cruza, así que la app no manda la curva original sino su **envolvente
radial**:

1. Divide el círculo en 720 sectores y guarda el radio máximo de cada sector.
2. Si algún sector quedó vacío, lo rellena interpolando con sus vecinos.
3. Suaviza con un promedio móvil de 5 sectores.

El resultado es un polígono de 720 puntos sin cruces: el "contorno que irá a
CST", que en la web se dibuja en color cobre.

**Los contornos C1–C4.** A partir de esa envolvente, la app crea dos anillos
concéntricos escalándola: C1 y C2 forman el anillo 1, C3 y C4 el anillo 2. El
ancho de cada anillo es el *gap* en mm. La estructura normal es
`(C1 − C2) + (C3 − C4)`; la complementaria es la placa de cobre completa menos
esos anillos.

### 4.3 El backend de geometría (Python)

Archivo principal: `backend/gielis_geometry/service.py`, clase
`GielisGeometryService`. Hace todo lo de la sección 4.2 con NumPy (cálculo) y
Shapely (operaciones con polígonos: restar, unir, áreas).

Al revisarlo encontramos tres problemas:

1. **Las pruebas no corrían en nuestros PC.** Buscaban los ejemplos en
   `/mnt/data/`, una carpeta del entorno de la IA que escribió el código.
   *Corregido:* ahora los leen de `backend/examples/`.
2. **El periodo no era igual al de MATLAB.** Se usaba
   `Fraction.limit_denominator()` de Python, que no hace lo mismo que `rat`.
   Con `m = 3.14159`, MATLAB da `355/113` (θ hasta 452π) y Python daba
   `314159/100000` (θ hasta 400 000π, una curva inservible). *Corregido:*
   `matlab_rat()` reproduce el algoritmo de MATLAB (fracciones continuas con
   tolerancia `1e-6·|m|` y el redondeo de MATLAB, que aleja los .5 del cero).
3. **Se comparaba Python contra Python.** Los valores de `golden/` los generó el
   mismo código Python, y el script de MATLAB incluido reescribe la lógica en
   vez de usar la app. Eso prueba que el código no cambia, no que sea igual a
   la app. *Pendiente:* exportar la geometría de la **app real** con
   `matlab/export_from_app.m` y compararla con `tests/compare_app_export.py`
   (pasos en `backend/README.md`).

**Las pruebas.** `python -m pytest` ejecuta 22 pruebas: forma de la curva,
periodo, envolvente, anillos, estructuras y los tres casos de ejemplo.

### 4.4 El frontend (React)

#### Conceptos de React que usamos

- **Componente:** una función que devuelve lo que se ve en pantalla. Se escribe
  con JSX, una mezcla de JavaScript y HTML: `<ParameterField symbol="a" />`.
- **Props:** los datos que un componente recibe de su "padre", como los
  argumentos de una función.
- **Estado (`useState`):** datos que cambian con lo que hace el usuario. Cuando
  el estado cambia, React vuelve a ejecutar el componente y actualiza la
  pantalla.
- **`useMemo`:** guarda el resultado de un cálculo costoso y solo lo repite
  cuando cambian sus dependencias.
- **TypeScript:** JavaScript con tipos. Si pasas un texto donde va un número,
  te avisa antes de ejecutar.

#### El flujo de datos

```text
 El usuario mueve un deslizador o escribe un número
        │
        ▼
 ParameterField llama a onChange("4.2")
        │
        ▼
 App actualiza su estado `inputs` (el texto de los 6 campos)
        │
        ▼
 useMemo ejecuta analyze(inputs):
     texto → números → validateParams → generateCurve → radialEnvelope
        │
        ▼
 Si hay errores: se muestran debajo de cada campo
 Si no: BoardPreview dibuja la placa y se muestran los datos
```

Todo ocurre en el navegador en unos milisegundos; por eso la forma cambia
mientras mueves el deslizador. En MATLAB había que pulsar **Preview**.

#### Los archivos, uno por uno

**`src/main.tsx`** — Lo creó Vite y no lo cambiamos. Busca el `<div id="root">`
de `index.html` y dibuja dentro el componente `<App />`.

**`src/lib/gielis.ts`** — Toda la matemática, sin nada de React:

| Función | Qué hace |
| --- | --- |
| `matlabRat(x)` | Fracción `n/d` igual que `rat` de MATLAB |
| `periodMultiplier(p)` | El `u` del periodo (sección 4.2) |
| `validateParams(p)` | Reglas: `a`, `b`, `n1` distintos de 0; `m > 0` con máximo 2 decimales |
| `generateCurve(p)` | Las 8000 muestras de la curva, y `ρ` mínimo y máximo |
| `radialEnvelope(puntos)` | La envolvente de 720 puntos |
| `polygonArea(puntos)` | Área del polígono con la fórmula del zapato (*shoelace*) |

Está separada de React a propósito: así se puede probar sola y es fácil de
comparar con el código de Python, función por función. Se verificó con los
valores de `backend/golden/`: el área de la envolvente coincide con Python con
un error relativo menor que 2·10⁻¹⁵ en los tres casos.

¿Por qué el límite de 2 decimales en `m`? Con muchos decimales, `rat` produce
denominadores grandes y θ recorre cientos de vueltas con solo 8000 muestras:
la curva sale mal tanto en MATLAB como en Python.

**`src/lib/examples.ts`** — Los parámetros de Gielis de los tres casos del
artículo, para los botones *Cargar caso*.

**`src/components/ParameterField.tsx`** — Un parámetro: nombre, explicación,
deslizador, campo numérico y mensaje de error. Los dos controles muestran el
mismo valor y llaman a la misma función `onChange`. Detalles:

- `useId()` genera un identificador único para unir la etiqueta con su campo;
  así, al hacer clic en el texto se enfoca el campo, y los lectores de pantalla
  saben qué es cada cosa.
- El deslizador se limita a su rango (`min`, `max`); el campo numérico acepta
  cualquier valor y la validación decide si sirve.
- Si hay error, el campo se marca en rojo y el mensaje queda asociado con
  `aria-describedby`.

**`src/components/BoardPreview.tsx`** — Dibuja la placa con **SVG** (gráficos
vectoriales del navegador):

- Calcula hasta dónde llega la forma y elige un tamaño de cuadrícula "redondo"
  (1, 2 o 5 × 10ᵏ mm) para tener unas 8 divisiones (`niceStep`).
- Convierte los puntos en un `path` de SVG (`M x y L x y ... Z`).
- En SVG el eje *y* crece hacia abajo; el grupo con `scale(1,-1)` lo invierte
  para que la figura quede como en MATLAB.
- `vectorEffect="non-scaling-stroke"` mantiene el grosor de las líneas aunque
  la figura se agrande o se achique.

**`src/App.tsx`** — La pantalla principal:

- Guarda en el estado el **texto** de cada campo, no el número. Si guardara el
  número, al escribir "-" o "1." React lo borraría a medio escribir.
- `analyze(inputs)` es una función pura (no usa React): convierte el texto a
  números, valida y calcula la geometría. Un campo vacío cuenta como "escribe un
  número", no como cero.
- `useMemo(() => analyze(inputs), [inputs])` hace que marcar o desmarcar
  *Mostrar la curva original* no recalcule las 8000 muestras.
- `activeExample` detecta si los valores actuales coinciden con algún caso, para
  resaltar su botón y poner el título correcto.

**`src/index.css`** — Colores, tipografía y estilos base. Los colores vienen
del circuito impreso: verde de la máscara antisoldante (fondo de la placa),
cobre (el contorno) y blanco de la serigrafía (cuadrícula y curva original).
Tiene modo oscuro automático según la configuración del sistema.

**`src/App.css`** — La distribución: dos columnas en pantallas anchas
(parámetros a la izquierda, placa a la derecha) y una sola columna en el
celular.

**`index.html`** — Idioma español, título *Gielis Web* y la tipografía
*Atkinson Hyperlegible Next*, diseñada para que los números se lean sin
confusión.

### 4.5 Las herramientas

| Herramienta | Para qué la usamos |
| --- | --- |
| **Git + GitHub** | Guardar versiones del código y trabajar los dos sobre lo mismo |
| **Python 3.12** | El backend. Tiene que ser 3.12 porque es lo que soporta CST 2025 |
| **`venv`** | Un Python aislado para el proyecto, con sus propias librerías |
| **pytest** | Ejecutar las pruebas automáticas del backend |
| **Node.js + npm** | Ejecutar las herramientas del front e instalar sus librerías |
| **Vite** | Servidor de desarrollo del front; recarga la página al guardar |
| **TypeScript** | Revisa tipos antes de ejecutar |
| **ESLint** | Revisa errores comunes en el código del front |

---

## 5. Cómo ejecutar el proyecto

### Backend (pruebas de geometría)

```powershell
cd C:\Users\USUARIO\reposs\gielis-web\gielis-web\backend
.venv\Scripts\activate          # debe aparecer (.venv) al inicio
python -m pytest                # esperado: 22 passed
```

La primera vez, antes de esto: `py -3.12 -m venv .venv` y, ya activado,
`python -m pip install -e ".[test]"`.

### Frontend

```powershell
cd C:\Users\USUARIO\reposs\gielis-web\gielis-web\frontend
npm run dev                     # abre http://localhost:5173
```

La primera vez: `npm install`. Para revisar el código: `npm run lint` y
`npm run build`.

### Guardar cambios en GitHub

```powershell
cd C:\Users\USUARIO\reposs\gielis-web\gielis-web
git status                      # qué cambió
git add .
git commit -m "Describe el cambio en una frase"
git push
```

---

## 6. Decisiones tomadas

| Tema | Decisión | Motivo |
| --- | --- | --- |
| Front | React + TypeScript con Vite | Estándar actual, mucha documentación |
| Linter | ESLint | El más usado; reglas específicas de React |
| Backend | Python 3.12 + FastAPI | Compatible con la librería de CST 2025 |
| Red | Todo corre en el PC de CST, usado por escritorio remoto | No hay que abrir puertos ni configurar VPN |
| Materiales | Lista fija | Evita errores de escritura y valores sin sentido |
| Transmisor | Una estructura (normal o complementaria) por simulación | Más simple; las dos juntas quedan para después |
| Sensor | La gota de analito y el barrido de εr quedan fuera de la v1 | En la app original también son manuales |
| Archivo `.cst` | Queda guardado en el PC de CST | No hace falta descargarlo |
| Tiempo máximo | 30 minutos por simulación | Pasado ese tiempo se marca como fallida |
| `m` | Máximo 2 decimales | Evita curvas mal muestreadas (sección 4.4) |

---

## 7. Lo que falta

En orden. Cada paso deja algo que funciona y se puede mostrar.

**Geometría**

- [ ] Exportar la geometría de la app real en MATLAB para los 3 casos y
      compararla con Python (`backend/README.md`, sección *Comparar con la app
      MATLAB real*).

**Frontend**

- [ ] Dibujar los anillos concéntricos C1–C4 en la placa (gap, tamaños,
      rotación y desplazamiento).
- [ ] Formulario por pasos: modo y geometría → materiales y dimensiones →
      frecuencias y simulación.
- [ ] Panel de resultados con las curvas de S-parámetros y la absorción.
- [ ] Pulido: estados de carga, historial de simulaciones.

**Backend**

- [ ] Servidor FastAPI con rutas que devuelvan datos de prueba, para conectar
      el front antes de tener CST.
- [ ] `CSTSession`: generador de VBA portado de `CST_MicrowaveStudio.m`
      (polígonos, materiales, puertos, fronteras, monitores).
- [ ] Modo absorbente de punta a punta: geometría → CST → simulación →
      resultados.
- [ ] Modos transmisor y sensor.
- [ ] Cola de simulaciones (una a la vez, porque CST usa una licencia).

**Validación y cierre**

- [ ] Comparar con los resultados del artículo; por ejemplo, el absorbente
      debe resonar cerca de 2.435 GHz con S11 ≈ −16.87 dB.
- [ ] Integrar front y backend, README final y demostración.

**Cómo se comunicarán el front y el backend.** Cuando exista el servidor, el
front le enviará los parámetros en JSON y recibirá la geometría y, después,
las curvas simuladas. Los nombres de los campos serán los mismos que ya usa el
código de Python (`a`, `b`, `m`, `n1`, `n2`, `n3`, `gap_mm`, `size1`…), con la
unidad en el nombre. Se definirá en detalle cuando empiece esa etapa.

---

## 8. Problemas comunes y su solución

| Problema | Causa | Solución |
| --- | --- | --- |
| `No se puede cargar el archivo ...Activate.ps1` | PowerShell bloquea scripts por defecto | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` (una sola vez) |
| `pip` instala en `pythoncore-3.14` | El `venv` no está activado y se usó el Python por defecto | Activar `.venv`; debe verse `(.venv)` y `python --version` debe decir 3.12 |
| `'node' no se reconoce` | Node.js no está instalado o la terminal es anterior a la instalación | `winget install OpenJS.NodeJS.LTS` y abrir otra terminal |
| Avisos `LF will be replaced by CRLF` | Git convierte finales de línea entre Linux y Windows | Normal, se puede ignorar |
| Proyecto lento o archivos bloqueados | El repo estaba dentro de OneDrive | Ya se movió a `C:\Users\USUARIO\reposs` |
| La librería de CST no importa | Python 3.14 no es compatible con CST 2025 | Usar Python 3.12 |

---

## 9. Glosario

| Término | Significado |
| --- | --- |
| **CST Studio Suite** | Programa de simulación electromagnética |
| **Microstrip** | Línea de transmisión hecha con una pista de cobre sobre un sustrato con plano de tierra |
| **Sustrato** | El material aislante de la placa (por ejemplo, FR-4 o Rogers RO4003C) |
| **S-parámetros (S11, S21)** | Cuánta señal se refleja (S11) o se transmite (S21), normalmente en dB |
| **CSRR** | *Complementary split-ring resonator*: anillos recortados en el plano de tierra |
| **Floquet** | Tipo de puerto de CST para simular celdas que se repiten infinitamente |
| **VBA** | Lenguaje de macros que CST entiende |
| **Envolvente radial** | El contorno exterior sin cruces que se obtiene de la curva de Gielis |
| **Spike** | Prueba corta para comprobar que algo es técnicamente posible |
| **Golden** | Valores de referencia guardados para detectar cambios no deseados |
| **Commit / push** | Guardar una versión en Git / subirla a GitHub |
| **API** | La forma en que dos programas se comunican (aquí, el front y el backend) |
