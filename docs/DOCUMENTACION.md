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
| 06/11/2026 | **Anillos concéntricos C1–C4 y estructuras** (normal, complementaria y sensor con puentes) | Las 21 áreas de referencia coinciden con Python en los 3 casos; avisos cuando el tamaño o el gap se ajustan |
| 06/11/2026 | **Formulario completo**: materiales, espesores, εr, tanδ, frecuencias, línea del sensor y JSON del caso | Los JSON generados para los 3 casos tienen los mismos valores que `backend/examples/` (salvo la tanδ del RO4003C, ver sección 6) |
| 06/11/2026 | Versión inicial publicada como enlace para el profesor | Le gustó cómo se actualizan las figuras; pidió acomodar el espacio de trabajo y ajustar la figura a las dimensiones |
| 06/11/2026 | Revisión de qué funciones de `CST_MicrowaveStudio.m` usa la app | 16 funciones; solo `add_to_history` con un cubo está probado en Python (sección 7) |
| 06/11/2026 | Revisión de la envolvente a raíz del comentario del profesor | Error encontrado y corregido: Python y TypeScript giraban el contorno 0.25° respecto a MATLAB (sección 4.3) |
| 06/11/2026 | Medida de fidelidad con CST | La página dice si una figura se reproduce tal cual en CST, tiene partes internas que se pierden o puntas que se redondean |
| 06/11/2026 | Valores de referencia regenerados tras la corrección del ángulo | **23 pruebas pasan** en Python 3.12. Las áreas no cambian (solo ruido en el último decimal); el centrado vertical del sensor pasa de 0.000002 mm a 0 y sus dos puentes quedan con la misma área |
| 06/11/2026 | **Espacio de trabajo** (comentario del profesor) | Secciones plegables, placa encuadrada al sustrato con cotas W y L, botón *Ajustar al sustrato* y figura que se mueve con el mouse o las flechas |
| 06/11/2026 | **Monitores de campo** en el formulario | Mismas opciones de la app (ninguno, E, o E y H) a una frecuencia dentro del barrido; van en el JSON del caso |
| 06/11/2026 | **Abrir un caso desde un archivo JSON** | Lee el formato de la página y los archivos de `backend/examples/`; los casos se guardan y se vuelven a abrir idénticos |
| 06/11/2026 | **Pruebas automáticas del front** (Vitest) | 41 pruebas de `gielis.ts`, `concentric.ts`, `design.ts` y `caseFile.ts` contra los valores de referencia de Python y los ejemplos; todas pasan |
| 06/11/2026 | Se decide que la vista 3D sea la del modelo **simulado** en CST | Queda para cuando exista el backend; no se hace una reconstrucción propia |

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

4. Pone cada vértice en el **centro** de su sector (en MATLAB,
   `phiGrid = 0.5*(edges(1:end-1) + edges(2:end))`).

El resultado es un polígono de 720 puntos sin cruces: el "contorno que irá a
CST", que en la web se dibuja en color cobre. La app **siempre** usa esta
envolvente (`seleccionarContornoBaseParaCST`). Tiene otra función,
`getOriginalContourForCST`, que conserva la forma original resolviendo los
cruces con `polyshape`, pero no se usa.

**Qué figuras se pueden reproducir en CST.** La envolvente guarda **un solo
radio por dirección**: el más lejano. Por eso:

- Si cada rayo que sale del centro corta la curva una sola vez (una forma
  "estrellada"), la envolvente es casi idéntica a la curva. Es el caso del
  absorbente y del sensor.
- Si un rayo corta la curva varias veces (lazos, pétalos que se cruzan), las
  partes internas se pierden: CST solo recibe el borde exterior. Es el caso del
  transmisor, cuya curva da 10 vueltas.
- El suavizado de 5 sectores redondea las puntas muy agudas (por ejemplo, con
  `n1` pequeño).

Esto es lo que señaló el profesor: la curva que se ve cambiar en tiempo real no
siempre es la que se construye. Por eso la página ahora lo mide y lo avisa
(sección 4.4, `envelopeFidelity`).

**Los contornos C1–C4.** A partir de esa envolvente, la app crea dos anillos
concéntricos escalándola: C1 y C2 forman el anillo 1 (exterior), C3 y C4 el
anillo 2 (interior).

- `Tamaño 1` y `Tamaño 2` son **escalas** (sin unidades): cuántas veces se
  agranda el contorno base para el borde exterior de cada anillo.
- El *gap* es el ancho de cada anillo **en mm**. Para convertirlo a escala se
  divide por el radio máximo del contorno base (`rBase`): el borde interior del
  anillo 1 tiene escala `Tamaño 1 − gap / rBase`.
- Después se aplican la rotación y el desplazamiento `dx`, `dy`.

Si el anillo 2 no cabe dentro del anillo 1 (por ejemplo, `Tamaño 2` mayor que
`Tamaño 1`), la app **no da error**: corrige `Tamaño 2` o el gap por su cuenta.
La versión web hace la misma corrección, pero la avisa en pantalla y muestra los
valores que realmente se usaron.

**Las estructuras.**

| Estructura | Qué es el cobre | Dónde se usa |
| --- | --- | --- |
| Normal | Los dos anillos: `(C1 − C2) + (C3 − C4)` | Absorbente y transmisor |
| Complementaria | La placa completa menos los dos anillos (quedan dos ranuras) | Transmisor y sensor |
| Sensor | Complementaria, con un **puente** que cruza cada ranura | Sensor (CSRR) |

En el sensor, la app además **centra** la estructura en el origen antes de
aplicar `dx` y `dy`, y pone un puente arriba en el anillo exterior y otro abajo
en el interior. El puente es un rectángulo donde el cobre no se recorta, y así
cada anillo queda abierto, como un *split-ring resonator*.

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

4. **El contorno quedaba girado 0.25°.** MATLAB pone cada vértice de la
   envolvente en el centro de su sector; el código de Python lo ponía en el
   borde. Como el área no cambia al girar, todas las pruebas pasaban. El script
   `matlab/export_geometry_reference.m` (que reescribe la lógica en vez de usar
   la app) tenía el mismo error, así que tampoco lo habría detectado.
   *Corregido* en Python, en ese script y en TypeScript, con una prueba nueva
   que revisa el ángulo del primer vértice (π/720). Con la corrección el sensor
   queda simétrico: su centrado vertical da 0 y sus dos puentes miden igual.
   Hay que regenerar los valores de referencia una vez con
   `python tools/update_golden.py` (sección 8).

**Las pruebas.** `python -m pytest` ejecuta 23 pruebas: forma de la curva,
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
 El usuario mueve un deslizador, escribe un número o cambia el modo
        │
        ▼
 ParameterField llama a onChange("4.2")
        │
        ▼
 App actualiza su estado (`inputs`, `mode`, `structureType`)
        │
        ▼
 useMemo ejecuta analyzeDesign(inputs, mode, estructura):
     texto → números → validación
       → generateCurve → radialEnvelope                 (curva)
       → buildConcentric → centrado y puentes si es sensor (anillos)
       → área de cobre y avisos
        │
        ▼
 App arma las capas del dibujo según la vista (Estructura o Curva)
        │
        ▼
 BoardPreview dibuja la placa; debajo, avisos y datos
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
| `radialEnvelopeDetail(puntos)` | Lo mismo, pero también devuelve los ángulos y los radios antes y después de suavizar |
| `envelopeFidelity(curva, detalle)` | Mide qué se pierde al pasar a la envolvente: porcentaje de direcciones con partes internas, cuánto se meten hacia adentro y cuánto cambia el radio por el suavizado |
| `polygonArea(puntos)` | Área del polígono con la fórmula del zapato (*shoelace*) |

**Cómo mide la fidelidad `envelopeFidelity`.** En el centro de cada uno de los
720 sectores traza un rayo desde el origen y calcula dónde corta cada tramo de
la curva. Si en una dirección hay cortes a radios distintos (más de 0.5 % del
radio), en esa dirección la curva tiene partes internas que la envolvente no
conserva. También compara el radio antes y después del suavizado. Con eso la
página dice, en la vista **Curva**, si la figura se reproduce tal cual en CST, y
muestra un aviso en las dos vistas cuando no.

Está separada de React a propósito: así se puede probar sola y es fácil de
comparar con el código de Python, función por función. Se verificó con los
valores de `backend/golden/`: el área de la envolvente coincide con Python con
un error relativo menor que 2·10⁻¹⁵ en los tres casos.

¿Por qué el límite de 2 decimales en `m`? Con muchos decimales, `rat` produce
denominadores grandes y θ recorre cientos de vueltas con solo 8000 muestras:
la curva sale mal tanto en MATLAB como en Python.

**`src/lib/concentric.ts`** — Los anillos, portados de
`backend/gielis_geometry/service.py`:

| Función | Qué hace |
| --- | --- |
| `validateConcentric(p)` | Gap mayor que 0 y tamaños mayores que 0.05 |
| `buildConcentric(base, p)` | C1–C4 con escala, rotación y desplazamiento; corrige `Tamaño 2` o el gap si no caben, y devuelve los valores usados y los avisos |
| `centerForSensor(r, dx, dy)` | Centra la estructura del sensor y luego aplica `dx`, `dy` |
| `splitBridge(exterior, interior, ángulo, gap)` | El rectángulo del puente del sensor |
| `clipConvex(polígono, ventana)` | Recorta un polígono con un rectángulo (Sutherland–Hodgman); sirve para saber cuánta ranura tapa cada puente |
| `fitsInSubstrate(...)` | Revisa si la estructura cabe en el sustrato con 0.1 mm de margen |

Se verificó con `backend/golden/`: las áreas de C1–C4, de los anillos, de la
placa complementaria, de los puentes y de las ranuras del sensor, y el centrado
del sensor, coinciden con Python en los tres casos.

**`src/lib/materials.ts`** — Los materiales que ofrece la app de MATLAB:

| Dieléctrico | εr | tanδ |
| --- | --- | --- |
| FR-4 con pérdidas | 4.3 | 0.02 |
| Rogers RO4003C | 3.55 | 0.0027 |
| Rogers RO5880 | 2.2 | 0.0009 |
| Alúmina | 9.8 | 0.0001 |
| Personalizado | lo escribe el usuario | lo escribe el usuario |

Conductores: cobre recocido y PEC. Los `id` (`FR4_lossy`, `Copper (annealed)`…)
son los mismos nombres que usa la app, para que el backend los reconozca.

**`src/lib/design.ts`** — Une todo el cálculo en una sola función pura,
`analyzeDesign(inputs, modo, estructura)`:

1. Convierte el texto de los campos en números (un campo vacío no es cero).
2. Valida todos los campos y junta los errores: espesores mayores que 0,
   εr ≥ 1, tanδ entre 0 y 0.2, frecuencia máxima mayor que la mínima y, en el
   sensor, ancho de línea entre 0.1 y 10 mm (el mismo rango de la app).
3. Si la curva es válida, calcula la curva y su envolvente.
4. Si además los anillos y el tamaño del sustrato son válidos, construye C1–C4
   (en el sensor: centrado, puentes y línea), revisa si caben y calcula el área
   de cobre.
5. Si **todo** el formulario es válido, arma el JSON del caso (sección 4.5).

Los errores se separan a propósito: un error en los materiales o las
frecuencias no impide ver la estructura, y un error en los anillos no impide
ver la curva. Lo único que exige todo correcto es el JSON.

También tiene `fitToSubstrate(inputs, envolvente)`, el botón *Ajustar al
sustrato*: busca el `Tamaño 1` más grande con el que el anillo exterior queda
dentro del sustrato, con un margen del 5 % del lado menor (al menos 0.5 mm).
Tiene en cuenta la rotación y el desplazamiento: para cada borde del sustrato
calcula un límite (por ejemplo, `escala · xMáx + dx ≤ W/2 − margen`) y se queda
con el menor. `Tamaño 2` se escala en la misma proporción. Si no hay forma de
que quepa, devuelve `null` y la página explica por qué. El resultado también
incluye el tamaño del resonador (ancho y alto de C1), que se muestra en los
datos.

Aquí también está `FIELD_GROUPS`, la lista de secciones y campos del
formulario con su nombre, explicación y rango del deslizador. Para agregar un
campo, se agrega una línea ahí. `sensorOnly` hace que la sección de la línea
solo aparezca en modo sensor, y `select` pone el selector de material antes de
los campos.

**`src/lib/examples.ts`** — Los valores completos de los tres casos del
artículo: modo, estructura, Gielis, anillos, sustrato, metal, frecuencias,
monitores de campo (ninguno, en los tres) y ancho de línea.

**Monitores de campo** (en `design.ts`). La app de MATLAB pregunta, después de
simular, si se quieren generar campos: *ninguno*, *campo eléctrico* o *campos
eléctrico y magnético*, a una frecuencia que debe estar dentro del barrido.
En la web es una sección del formulario con esas mismas tres opciones; la
frecuencia solo aparece si se pide algún campo, y se valida contra el barrido.
En el JSON va como `field_monitors: { "fields": "E" | "EH", "freq_ghz": … }`, o
`null` si no se piden.

**`src/lib/caseFile.ts`** — `parseCaseFile(texto)` convierte un archivo en un
caso para el formulario. Entiende dos formatos:

| Formato | Cómo se reconoce | De dónde sale |
| --- | --- | --- |
| El de la página | Tiene `schema_version` (debe ser `"1.0"`) | Botones *Copiar* o *Descargar* del JSON |
| El del artículo | Tiene `gielis_parameters` | `backend/examples/*_case_params.json` |

Detalles del formato del artículo: el modo sale del texto de `case`
("Absorber mode"…); los materiales se reconocen por nombre ("FR-4 (lossy)" →
FR-4 con pérdidas); si el archivo trae dos estructuras, como el transmisor, se
carga la primera y se avisa. Si εr y tanδ del archivo no coinciden con el
material predefinido, se carga como *Personalizado* para no perder los valores
del archivo, y también se avisa: pasa con el transmisor (tanδ 0.002 en el
archivo, 0.0027 en la app). Si falta un dato, el error dice cuál
(por ejemplo, `Falta la sección "concentric".`).

**`src/components/ParameterField.tsx`** — Un parámetro: nombre, explicación,
deslizador, campo numérico y mensaje de error. Los dos controles muestran el
mismo valor y llaman a la misma función `onChange`. Detalles:

- `math` indica si el nombre es un símbolo de la fórmula (`a`, `m`, `n1`) y va
  en cursiva, o una palabra (`Gap`, `Tamaño 1`).
- `disabled` bloquea el campo: se usa en εr y tanδ cuando el material es
  predefinido.
- `useId()` genera un identificador único para unir la etiqueta con su campo;
  así, al hacer clic en el texto se enfoca el campo, y los lectores de pantalla
  saben qué es cada cosa.
- El deslizador se limita a su rango (`min`, `max`); el campo numérico acepta
  cualquier valor y la validación decide si sirve.
- Si hay error, el campo se marca en rojo y el mensaje queda asociado con
  `aria-describedby`.

**`src/components/OpenCase.tsx`** — El botón *Abrir un caso (.json)* de la
sección *Caso completo*. Usa un `<input type="file">` escondido detrás de una
etiqueta con forma de botón; lee el archivo con `file.text()`, llama a
`parseCaseFile` y muestra qué se cargó, los avisos o el error.

**Pruebas del front** (`src/lib/*.test.ts`). Se corren con Vitest
(`npm test`) y leen los archivos del backend con `src/lib/testing.ts`:

| Archivo | Qué prueba |
| --- | --- |
| `gielis.test.ts` | `rat` de MATLAB, validación, curva y envolvente contra `golden/`, vértices en el centro del sector, fidelidad |
| `concentric.test.ts` | C1–C4, anillos, placa complementaria, centrado, puentes y ranuras del sensor contra `golden/`; ajustes y errores |
| `design.test.ts` | Área de cobre, JSON contra `examples/`, validaciones, monitores, *Ajustar al sustrato* |
| `caseFile.test.ts` | Abrir los archivos del artículo, guardar y volver a abrir, archivos inválidos |

Las pruebas no forman parte de la página: `tsconfig.app.json` las excluye de
la compilación, porque usan funciones de Node (leer archivos) que el navegador
no tiene.

**`src/components/SelectField.tsx`** — Un selector de material con su etiqueta y
su mensaje de error.

**`src/components/CaseJson.tsx`** — Muestra el JSON del caso dentro de un
`<details>` (se abre y se cierra con un clic), con botones para copiarlo y
descargarlo. Para descargar, crea un archivo en memoria (`Blob`) y simula un
clic en un enlace. Si el formulario tiene errores, muestra que el JSON aparece
cuando todo es válido.

**`src/components/BoardPreview.tsx`** — Dibuja la placa con **SVG** (gráficos
vectoriales del navegador). Recibe una lista de **capas**; cada capa es de un
tipo (`substrate`, `copper`, `trace` o `curve`) y tiene uno o varios contornos.
`trace` es el cobre de la cara de arriba (la línea del sensor): se dibuja
translúcido para que se vean debajo las ranuras del plano de tierra.

- **Encuadre al sustrato (`frame`):** en la vista *Estructura* la placa se
  ajusta al tamaño real W × L, así que es cuadrada en el absorbente y
  rectangular en el sensor (20 × 13 mm), y dibuja las cotas W y L con su
  medida. En la vista *Curva* el encuadre es cuadrado.
- **Mover la figura (`onMove`):** al arrastrar con el mouse se calcula cuántos
  mm hay por píxel y el desplazamiento se convierte en `dx` y `dy`. Mientras se
  arrastra, el encuadre queda fijo para que la figura no salte. También se mueve
  con las flechas del teclado: 0.1 mm por toque, 1 mm con Shift.
- **El truco de los huecos:** el cobre usa `fill-rule: evenodd`. Con esa regla,
  un contorno dentro de otro se ve como un hueco. Por eso basta con dibujar
  `C1, C2, C3, C4` en una sola capa para obtener dos anillos, y
  `sustrato, C1, C2, C3, C4` para obtener una placa con dos ranuras.
- Calcula hasta dónde llega el dibujo y elige un tamaño de cuadrícula "redondo"
  (1, 2 o 5 × 10ᵏ mm) para tener unas 8 divisiones (`niceStep`).
- En SVG el eje *y* crece hacia abajo; el grupo con `scale(1,-1)` lo invierte
  para que la figura quede como en MATLAB.
- `vectorEffect="non-scaling-stroke"` mantiene el grosor de las líneas aunque
  la figura se agrande o se achique.

**`src/App.tsx`** — La pantalla principal:

- **Estado:** el texto de cada campo (`inputs`), el modo, el tipo de
  estructura, la vista (Estructura o Curva) y la casilla de la curva original.
  Los campos guardan texto, no números: si guardaran el número, al escribir "-"
  o "1." React lo borraría a medio escribir.
- En modo sensor la estructura siempre es complementaria (`effectiveStructure`).
- `useMemo(() => analyzeDesign(...), [inputs, mode, effectiveStructure])`
  recalcula solo cuando cambia algo del diseño; cambiar de vista no repite el
  cálculo.
- Un segundo `useMemo` arma las capas y la leyenda del dibujo según la vista y
  la estructura.
- El botón *Cargar los valores del artículo* llena el formulario con el caso del
  modo elegido; se desactiva cuando esos valores ya están cargados.
- `selectDielectric`: al elegir un dieléctrico predefinido copia su εr y su
  tanδ en los campos, que quedan bloqueados; con *Personalizado* se pueden
  escribir.
- Debajo de la placa muestra los avisos (por ejemplo, "El tamaño 2 se ajustó
  de 2.4 a 1.6…") y los datos: gap y tamaños usados, área de cobre, sustrato
  y barrido de frecuencias.
- Al final del formulario está la sección *Caso completo* con el JSON.
- **Secciones plegables:** cada grupo de campos es un `<details>` que se abre y
  se cierra; al empezar solo están abiertas *Curva de Gielis* y *Anillos
  concéntricos*. Si una sección cerrada tiene errores, su título lo avisa
  ("1 campo por corregir"), para que no queden escondidos.
- **Arrastre:** `dragOrigin` (un `useRef`) guarda `dx` y `dy` al empezar a
  arrastrar, y cada movimiento les suma el desplazamiento total. Se usa
  `useRef` y no estado porque ese valor no se dibuja: solo hay que recordarlo.
  Los valores se redondean a centésimas de mm (`toField`).

**`src/index.css`** — Colores, tipografía y estilos base. Los colores vienen
del circuito impreso: verde de la máscara antisoldante (fondo de la placa),
cobre (el contorno) y blanco de la serigrafía (cuadrícula y curva original).
Tiene modo oscuro automático según la configuración del sistema.

**`src/App.css`** — La distribución: dos columnas en pantallas anchas
(parámetros a la izquierda; la placa a la derecha, fija mientras se recorren
los controles) y una sola columna en el celular, con la placa primero.

**`index.html`** — Idioma español, título *Gielis Web* y la tipografía
*Atkinson Hyperlegible Next*, diseñada para que los números se lean sin
confusión.

### 4.5 El JSON del caso

Cuando todo el formulario es válido, la página arma un objeto con el caso
completo. Es lo que el front le enviará al backend para que construya y simule
la estructura en CST. Ejemplo del absorbente (resumido):

```json
{
  "schema_version": "1.0",
  "mode": "absorber",
  "structure_type": "normal",
  "gielis": { "a": 4, "b": 3.6, "m": 8, "n1": 1.1, "n2": 1.7, "n3": 1.7 },
  "concentric": { "gap_mm": 1.6, "size1": 1.5, "size2": 1, "rotation_deg": 0, "dx_mm": 0, "dy_mm": 0 },
  "substrate": { "material": "FR4_lossy", "width_mm": 30, "length_mm": 30,
                 "thickness_mm": 1.6, "eps_r": 4.3, "loss_tangent": 0.02 },
  "metal": { "material": "Copper (annealed)", "thickness_mm": 0.035 },
  "transmission_line": null,
  "frequency": { "min_ghz": 1, "max_ghz": 8 },
  "field_monitors": null
}
```

- Los nombres son los mismos que usa el código de Python (`size1`, `gap_mm`…)
  y llevan la unidad en el nombre.
- `transmission_line` solo tiene valor en el sensor: `{ "width_mm": 3 }`.
- `field_monitors` es `null` si no se piden campos, o por ejemplo
  `{ "fields": "EH", "freq_ghz": 2.43 }`.
- Un caso guardado se puede volver a abrir con *Abrir un caso (.json)*.
- `schema_version` permite cambiar el formato más adelante sin romper lo
  anterior.
- Se puede copiar o descargar desde la sección *Caso completo*. Mientras no
  exista el backend, sirve para revisar el caso y compararlo con
  `backend/examples/`.

### 4.6 Las herramientas

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

Pruebas del front (la primera vez hay que instalar Vitest con
`npm install -D vitest`):

```powershell
npm test                        # esperado: 41 pruebas que pasan
```

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
| Ajustes de tamaño y gap | Se hacen igual que en la app, pero se avisan en pantalla | Ser fieles a MATLAB sin esconder cambios al usuario |
| Puentes del sensor | Se calculan con el gap escrito por el usuario | Así lo hacen la app y el código de Python |
| Materiales | Los mismos de la app; con un dieléctrico predefinido, εr y tanδ quedan bloqueados | Igual que la app |
| tanδ del Rogers RO4003C | 0.0027, como la fija la app (el JSON del artículo dice 0.002) | Con la app se hicieron las simulaciones. **Pendiente confirmarlo** con los autores o el director |
| Espacio de trabajo | Se interpretó el comentario del profesor como: más espacio para la figura, formulario plegable, placa a la escala del sustrato con cotas, ajuste automático y figura que se puede tomar y mover | **Confirmar con él** que era lo que pedía |
| Margen de *Ajustar al sustrato* | 5 % del lado menor, al menos 0.5 mm | Deja la estructura visiblemente dentro, sin tocar el borde |
| Monitores de campo | Se eligen en el formulario, antes de simular | La app los pide después de simular; en la web van en el JSON del caso para que el backend los agregue de una vez |
| Abrir un caso con valores distintos al material predefinido | Se carga como *Personalizado* y se avisa | No perder los valores del archivo |
| Vista 3D | Solo la del modelo simulado en CST | Lo que interesa ver en 3D es lo que se simuló; llega con el backend |
| Unidades de frecuencia | Solo GHz | La app permite MHz, pero los tres casos usan GHz; menos opciones, menos errores |

---

## 7. Lo que falta

En orden. Cada paso deja algo que funciona y se puede mostrar.

**Geometría**

- [x] Regenerar los valores de referencia después de la corrección del ángulo
      (`python tools/update_golden.py`): hecho; 23 pruebas pasan.
- [ ] Decidir con el profesor si, para figuras con partes internas, basta con
      el contorno exterior (como hace la app) o si se necesita otro método,
      como `getOriginalContourForCST`, que la app tiene pero no usa.
- [ ] Exportar la geometría de la app real en MATLAB para los 3 casos y
      compararla con Python (`backend/README.md`, sección *Comparar con la app
      MATLAB real*).

**Frontend**

- [x] Dibujar los anillos concéntricos C1–C4 en la placa (gap, tamaños,
      rotación y desplazamiento), con las estructuras normal, complementaria
      y del sensor.
- [x] Dibujar la línea microstrip del sensor (está en la cara de arriba; los
      anillos están en el plano de tierra).
- [x] Completar el formulario: materiales, espesores, frecuencias y ancho de la
      línea del sensor, con el JSON del caso.
- [ ] Confirmar la tanδ del Rogers RO4003C (0.0027 en la app, 0.002 en el JSON
      del artículo).
- [x] Comentario del profesor: acomodar el espacio de trabajo y ajustar la
      figura a las dimensiones. Falta que él confirme que es lo que pedía.
- [x] Monitores de campo E y H a una frecuencia.
- [x] Abrir un caso desde un archivo JSON.
- [x] Pruebas automáticas del front (Vitest): 41 pruebas.

Con esto está hecho todo lo del front que no necesita el backend.

*Necesitan el backend (al principio, con datos de prueba):*

- [ ] Botón *Simular*: enviar el JSON del caso y mostrar el estado (en cola,
      construyendo, simulando, terminado, falló) con opción de cancelar.
- [ ] Panel de resultados: curvas de S11, S21 y absorción, tabla de
      resonancias y exportar los datos.
- [ ] Historial de simulaciones.
- [ ] Vista 3D del modelo que construyó y simuló CST (exportado como STL).

**Backend**

- [ ] Segunda prueba de CST desde Python, pedida por el profesor: enviar el VBA
      de cada función que usa la app y leer resultados con `cst.results`. Las
      funciones son `addPolygonBlock` (15 usos), `subtractObject` (12),
      `addParameter` (8), `getSParams`/`getSParameters`/`getSParamStrings`
      (15), `addBrick` (4), `setBoundaryCondition` (3), `addFieldMonitor` (3),
      `runSimulation` (2), `defineFloquetModes` (2), `addWaveguidePort` (2),
      `setSolver`, `setFreq`, `defineUnits` y `addNormalMaterial` (1 cada una).
      Las de más riesgo: `addPolygonBlock` (cientos de puntos en un bloque) y la
      lectura de resultados, que en Python usa otro módulo.
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
front le enviará el JSON del caso (sección 4.5) y recibirá la geometría y,
después, las curvas simuladas. Lo que falta definir es la respuesta: cómo
llegan el estado de la simulación y las curvas. Se hará cuando empiece esa
etapa.

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
| `npm test` dice que no encuentra `vitest` | Vitest no está instalado | `npm install -D vitest` (una sola vez) |
| `test_golden_geometry_regression` falla en el sensor | Los valores de referencia son de antes de la corrección del ángulo | `python tools/update_golden.py`, revisar el cambio con `git diff` y volver a correr `pytest` |

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
