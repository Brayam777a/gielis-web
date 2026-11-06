# GIELIS --- TRANSFERENCIA TÉCNICA PARA CLOUD CODE

**Fecha de corte:** 6 de noviembre de 2026\
**Proyecto:** GielisMeta-CST / `gielis-web`\
**Destinatario:** agente de IA del segundo integrante (Cloud Code /
Claude Code)

## Instrucción principal

Lee este documento antes de modificar el repositorio. Continúa desde el
estado descrito; no repitas pruebas ya superadas. Primero inspecciona la
rama, commits, `git status` y estructura actual, porque el otro
integrante puede haber avanzado en paralelo. No sobrescribas módulos ni
dupliques funcionalidades.

Distingue rigurosamente: - **Validado:** ejecutado y comprobado
directamente en CST. - **Definido por fuentes:** presente en MATLAB o
JSON, pero aún no necesariamente integrado. - **Pendiente:** no
implementado o no probado.

**No afirmes que ya se ejecutó una simulación electromagnética.** Hasta
esta fecha se validaron la conexión Python--CST y operaciones
geométricas, pero no se ha ejecutado/validado el solver desde Python.

------------------------------------------------------------------------

## 1. Objetivo y arquitectura

Migrar la aplicación MATLAB App Designer `GielisMeta_CST` a React +
TypeScript y Python + FastAPI para controlar CST Studio Suite 2025.

``` text
React + TypeScript
       | HTTP / JSON
       v
FastAPI (Python)
       v
CSTAdapter (Python)
       | cst.interface / model3d.add_to_history()
       | VBA de CST
       v
CST Design Environment 2025
       v
CST Microwave Studio
       | geometría, fronteras, puertos, solver
       v
Postprocesamiento Python
       | S11, S21, absorción, resonancias
       v
React: estado, gráficas y descargas
```

Las pruebas se ejecutaron en el PC Windows donde está instalado CST. La
arquitectura final contempla React en otro PC y FastAPI en el PC CST,
comunicados mediante LAN o VPN. RustDesk se utilizó para controlar
remotamente el escritorio; no crea por sí mismo un túnel HTTP ni
sustituye la configuración de red. No exponer la API directamente a
Internet.

## 2. Entornos

### PC B: equipo CST

-   Windows.
-   CST Studio Suite 2025.
-   CST Design Environment 2025.4, release 2025-04-11, change 1409410.
-   Python 3.12.10, 64 bits.
-   Ejecutable:
    `C:\Users\Lab Optica\AppData\Local\Programs\Python\Python312\python.exe`
-   Instalación CST: `C:\Program Files (x86)\CST Studio Suite 2025`
-   Bibliotecas Python CST:
    `C:\Program Files (x86)\CST Studio Suite 2025\AMD64\python_cst_libraries`

Preparación habitual:

``` powershell
$env:PYTHONPATH = "C:\Program Files (x86)\CST Studio Suite 2025\AMD64\python_cst_libraries"
py -3.12 script.py
```

Imports probados:

``` python
import cst.interface
import cst.results
```

Hay otra instalación Python 3.15.1 de 32 bits en el PC B; no usarla. La
instalación utilizada fue Python 3.12.10 x64.

Proyecto de pruebas:

`C:\Gielis\CST_Test\Gielis_API_Test.cst`

Todas las pruebas descritas se hicieron en ese proyecto desechable, no
en los proyectos originales de los casos.

### PC A: desarrollo web

-   Repositorio local: `C:\Gielis\gielis-web`
-   Python 3.12.10.
-   Node.js v26.13.0.
-   npm 11.20.0.
-   Entorno virtual: `backend\.venv`.
-   NumPy 2.5.4, Shapely 2.2.0, Pytest 9.2.0.

Instalación que ya se ejecutó:

``` powershell
python -m pip install -e ".\backend[test]"
```

Pruebas que ya pasaron: - Backend: 23 passed. - Frontend: 41 tests
passed (4 files). - Lint: OK. - Build: OK.

Frontend Vite ejecutado en `http://localhost:5173/`. La interfaz ya
contempla selector absorber/transmitter/sensor, normal/complementary
según caso, parámetros Gielis, dibujo geométrico, pestañas
Estructura/Curva, materiales, frecuencias, monitores y carga de JSON.
Todavía no está conectada a CST mediante FastAPI.

## 3. Repositorio y advertencia de trabajo paralelo

Repositorio: https://github.com/Brayam777a/gielis-web

Archivos relevantes: - `docs/DOCUMENTACION.md` - `backend/README.md` -
`backend/pyproject.toml` - `frontend/README.md` -
`frontend/package.json` - `CST_MicrowaveStudio.m` -
`GielisMeta_CST.mlapp` - `absorber_case_params.json` -
`transmitter_case_params.json` - `sensor_case_params.json` - `README.md`

El backend de la rama principal contiene geometría Python basada en
NumPy/Shapely, tests y ejemplos. No se había validado en main un
CSTAdapter operativo, FastAPI que ejecute CST, cola de simulaciones ni
extracción real de curvas CST.

Se mencionó un archivo separado `gielis-backend-v5.zip`; inspeccionarlo
si está disponible, pero no asumir que sus funciones están incorporadas
en GitHub main.

**Antes de tocar código:** inspecciona rama, commits, `git status`,
estructura y archivos existentes. Integra los avances del compañero sin
sobrescribirlos.

## 4. Conexión Python--CST ya validada

Código utilizado:

``` python
import cst.interface

de = cst.interface.DesignEnvironment.connect_to_any_or_new()
project = de.open_project(
    r"C:\Gielis\CST_Test\Gielis_API_Test.cst"
)
model = project.model3d
```

Resultado: - Conexión con Design Environment correcta. - Versión CST
obtenida. - Proyecto MWS abierto. - `model3d` disponible. - VBA
ejecutado desde Python correctamente.

Método central:

``` python
model.add_to_history("Nombre de operación", vba_code)
```

Objetos disponibles inspeccionados: `model.Solid`, `model.Material`,
`model.Units`, `model.Boundary`, `model.Solver`, `model.Port`,
`model.FloquetPort`, `model.Monitor`.

API de entorno/proyecto observada:
`DesignEnvironment.connect_to_any_or_new()`, `open_project()`,
`new_mws()`, `version()`, `Project.filename()`, `Project.save()`,
`Project.close()`, `Project.model3d`.

En métodos compilados `inspect.signature()` puede fallar; usar `help()`
y `dir()`.

En algunas conexiones aparecieron mensajes `The handle is invalid.` y
anteriormente `Access is denied.`. No impidieron abrir el proyecto ni
ejecutar operaciones. Causa no diagnosticada. No tratarlos como fallo
fatal si las operaciones y verificaciones posteriores resultan
correctas. Evitar abrir repetidamente el mismo proyecto en pestañas
nuevas; gestionar y reutilizar proyectos abiertos.

## 5. Pruebas experimentales completadas

### 5.1 Unidades

VBA ejecutado:

``` vb
With Units
    .Geometry "mm"
    .Frequency "GHz"
End With
```

Consultas:

``` python
model.Units.GetUnit("Length")     # mm
model.Units.GetUnit("Frequency")  # GHz
```

Importante: el getter correcto es `"Length"`, no `"Geometry"`.

**Estado: validado.**

### 5.2 Brick y consultas de sólidos

VBA:

``` vb
With Brick
    .Reset
    .Name "Gielis_Block_Test"
    .Component "Gielis_Test"
    .Material "PEC"
    .Xrange "0", "10"
    .Yrange "0", "10"
    .Zrange "0", "0.035"
    .Create
End With
```

Se consultó con el nombre completo:

``` python
solid_name = "Gielis_Test:Gielis_Block_Test"
model.Solid.GetVolume(solid_name)
model.Solid.GetMaterialNameForShape(solid_name)
model.Solid.GetLooseBoundingBoxOfShape(solid_name)
```

Resultados: - `add_to_history`: True. - Volumen: `3.5000000000000004`. -
Material: `PEC`. - Bounding box:
`(True, 0.0, 10.0, 0.0, 10.0, 0.0, 0.035)`.

**Regla importante:** para consultar sólidos usar
`Componente:NombreObjeto`, no solo el nombre corto.

**Estado: validado.**

### 5.3 Materiales personalizados

Materiales inicialmente disponibles: `$NFSMaterial$`,
`Copper (annealed)`, `PEC`, `Vacuum`, `air_0` y una entrada vacía
observada al recorrer índices.

Se comprobó que `Copper (annealed)` y `PEC` existen. FR-4 y Rogers no
existían inicialmente.

Material FR-4 creado mediante:

``` vb
With Material
    .Reset
    .Name "Gielis_FR4_Lossy"
    .Type "Normal"
    .Epsilon "4.3"
    .Mue "1.0"
    .TanD "0.02"
    .TanDFreq "0.0"
    .TanDGiven "True"
    .TanDModel "ConstTanD"
    .Sigma "0"
    .TanDM "0"
    .TanDMFreq "0.0"
    .TanDMGiven "False"
    .TanDMModel "ConstTanD"
    .SigmaM "0"
    .Colour "0.2", "0.6", "0.8"
    .Create
End With
```

Nombre: `Gielis_FR4_Lossy`; epsilon 4.3, mu 1, tanD 0.02, sigma 0,
modelo ConstTanD.

También se creó `Gielis_Rogers_RO4003C` con epsilon 3.55, mu 1, tanD
0.002, sigma 0 y ConstTanD.

Verificación:

``` python
model.Material.Exists("Gielis_FR4_Lossy")       # True
model.Material.Exists("Gielis_Rogers_RO4003C")  # True
```

La existencia se validó. No se ha realizado todavía lectura completa de
retorno de todas las propiedades.

**Estado: creación validada; lectura completa de propiedades
pendiente.**

### 5.4 Substrato FR-4

VBA:

``` vb
With Brick
    .Reset
    .Name "FR4_Substrate_Test"
    .Component "Gielis_Test"
    .Material "Gielis_FR4_Lossy"
    .Xrange "-15", "15"
    .Yrange "-15", "15"
    .Zrange "0", "1.6"
    .Create
End With
```

Verificaciones: - Existe: True. - Volumen: 1440.0 mm³. - Material:
`Gielis_FR4_Lossy`. - Bounding box:
`(True, -15.0, 15.0, -15.0, 15.0, 0.0, 1.6)`.

Cálculo esperado: 30 × 30 × 1.6 = 1440 mm³.

**Estado: validado.**

### 5.5 Extrusión poligonal

El MATLAB `CST_MicrowaveStudio.m` contiene
`addPolygonBlock(obj,points,height,name,component,material,varargin)`.
La implementación construye una extrusión con `Extrude`, modo
`pointlist`, `.Point` para el primer punto, `.LineTo` para los
restantes, `.Height`, `.Origin`, vectores U/V y `.Create`.

Se ejecutó una prueba CST: - Polígono cuadrado 10 × 10 mm. - Altura
0.035 mm. - Material `Copper (annealed)`. - Z inicial 1.6 mm.

Resultado: - VBA: True. - Volumen: `3.499999999999992 mm3`. - Material:
Copper (annealed).

Volumen teórico: 10 × 10 × 0.035 = 3.5 mm³.

**Estado: validado.**

### 5.6 Sustracción booleana

MATLAB original:

``` matlab
function subtractObject(obj,object1,object2)
    VBA = sprintf('Solid.Subtract "%s", "%s"',object1,object2);
    obj.update(sprintf('Boolean Subtract Shapes:%s,%s',object1,object2),VBA);
end
```

Prueba en CST: - Bloque principal 10 × 10 × 1 mm: 100 mm³. - Bloque de
corte 5 × 10 × 1 mm: 50 mm³. - Ambos se solapaban en la mitad del
principal.

Se ejecutó `Solid.Subtract` con nombres completos `Gielis_Test:...`.

Resultados: - Volumen principal antes: 100.0 mm³. - Volumen del cutter:
50.0 mm³. - Volumen principal después: 50.0 mm³. - VBA: True.

**Estado: validado.**

### 5.7 Curva Gielis de 8000 puntos enviada a CST

Parámetros del caso absorber:

``` json
{
  "a": 4,
  "b": 3.6,
  "m": 8,
  "n1": 1.1,
  "n2": 1.7,
  "n3": 1.7
}
```

Se generaron 8000 puntos en Python con:

``` python
theta = 2.0 * math.pi * i / num_points
term1 = abs(math.cos(m * theta / 4.0) / a) ** n2
term2 = abs(math.sin(m * theta / 4.0) / b) ** n3
denominator = (term1 + term2) ** (1.0 / n1)
radius = denominator ** -1.0
x = radius * math.cos(theta)
y = radius * math.sin(theta)
```

Fórmula correspondiente:

\[ r(`\theta`{=tex})= `\left[
\left|\frac{\cos(m\theta/4)}{a}\right|^{n_2}
+
\left|\frac{\sin(m\theta/4)}{b}\right|^{n_3}
\right]`{=tex}\^{-1/n_1} \]

\[
x(`\theta`{=tex})=r(`\theta`{=tex})`\cos`{=tex}`\theta`{=tex},`\qquad`{=tex}
y(`\theta`{=tex})=r(`\theta`{=tex})`\sin`{=tex}`\theta`{=tex} \]

**Advertencia:** es la fórmula ejecutada en la prueba, pero todavía debe
compararse con la implementación MATLAB original. No asumir equivalencia
exacta hasta hacer esa comparación.

Resultados: - Puntos: 8000. - Primer punto: `(8.5203287155197, 0.0)`. -
Rango X: −8.5203287155197 a +8.5203287155197. - Rango Y:
−8.5203287155197 a +8.5203287155197.

Se convirtió el contorno a VBA `Extrude` con `.Point` para el primero y
7999 `.LineTo`, con 12 decimales, material Copper (annealed), altura
0.035 mm y Z=1.6 mm.

Objeto creado: `Gielis_Test:Gielis_Absorber_8000_Test`.

Resultados: - VBA: True. - Existe: True. - Volumen:
`6.098579246502598 mm3`. - Material: Copper (annealed). - Bounding box:
`(True, -8.52032871552, 8.52032871552, -8.52032871552, 8.52032871552, 1.6, 1.6350000000000062)`.

Esto prueba que CST aceptó los 8000 puntos y creó el sólido. No hubo un
volumen teórico independiente para comparar.

**Estado: generación Python y extrusión CST validadas; equivalencia con
MATLAB pendiente.**

------------------------------------------------------------------------

## 6. Métodos identificados en CST_MicrowaveStudio.m

Configuración: - `defineUnits` - `setFreq` - `setSolver` -
`setBoundaryCondition` - `defineFloquetModes` - `addFieldMonitor` -
`setBackgroundLimits` - `addSymmetryPlane`

Materiales: - `addNormalMaterial` - `addAnisotropicMaterial` -
`addDispersiveMaterial`

Geometría: - `addBrick` - `addCylinder` - `addPolygonBlock` -
`addPolygonBlock3D` - `addSphere` - `rotateObject` - `translateObject` -
`connectFaces` - `mergeCommonSolids` - `deleteObject` - `subtractObject`

Simulación: - `runSimulation`

Resultados: - `getSParameters` - `getSParams` - `getPortSignals` -
`getFarfield` - `getEFieldVector` - `getMeshInfo` - `getFieldIDStrings`

No es necesario migrar todos inicialmente. Implementar primero lo que
necesitan absorber, transmitter y sensor.

### Solver y frecuencia

MATLAB distingue:

``` vb
ChangeSolverType "HF Frequency Domain"
```

y:

``` vb
ChangeSolverType "HF Time Domain"
```

Frecuencia:

``` vb
Solver.FrequencyRange "F1", "F2"
```

Interfaz Python propuesta: `set_solver("frequency"|"time")` y
`set_frequency_range(f_min_ghz, f_max_ghz)`. Confirmar solver exacto en
callback MATLAB antes de fijarlo por caso.

### Fronteras

El MATLAB contempla Open, Open add space, Electric, Magnetic, Periodic,
Unit cell y Conducting wall. El MATLAB transforma Open add space a
`"expanded open"` en el VBA correspondiente. Revisar el bloque exacto
antes de traducir cadenas.

### Floquet

`defineFloquetModes(nModes)` configura theta=0, phi=0, polarización
circular desactivada, puertos Zmin/Zmax, número de modos configurable y
distancia de referencia 0. Se usa para estructuras periódicas, pero
confirmar callback y número de modos por caso.

### Waveguide ports

El MATLAB crea puertos con `With Port`, número, orientación, rangos
X/Y/Z, un modo y coordenadas libres. Obtiene número con
`StartPortNumberIteration`. No confundir estos puertos del sensor con
Floquet.

### Monitores

Tipos identificados: Efield, Hfield, Surfacecurrent, Powerflow, Current,
Powerloss, Eenergy, Elossdens, Lossdens, Henergy y Farfield.

### S-parameters

El MATLAB contempla S11, S21, S12, S22 y resultados Floquet. Para
transmisor aparece `SZmin(1),Zmax(1)` como resultado co-polarizado,
equivalente a S21 en ese contexto. No asumir que todos los resultados
periódicos usan nombres convencionales. Conservar el identificador real
del árbol CST.

------------------------------------------------------------------------

## 7. Casos JSON y referencias experimentales

Los JSON corresponden a ejemplos del manuscrito. Los proyectos CST
completos y curvas barridas completas no están comprometidos en el
repositorio; se tienen resultados discretos reportados. Úsalos como
referencia, nunca como resultados de una simulación recién ejecutada.

### 7.1 Absorber --- `absorber_case_params.json`

Gielis: a=4, b=3.6, m=8, n1=1.1, n2=1.7, n3=1.7.

Sustrato: - FR-4 lossy, 30 × 30 × 1.6 mm. - εr=4.3, tanδ=0.02.

Metal: - Copper (annealed), espesor 0.035 mm. - Resonadores en cara
superior. - Plano de tierra continuo inferior.

Geometría: - gap=1.6 mm. - size_1=1.5. - size_2=1.0. - rotación 0°,
dx=0, dy=0. - Tipo normal.

Simulación: - 1--8 GHz. - Unit cell X/Y. - Open add space Z. - Floquet,
incidencia normal.

Referencias: - 2.435 GHz: S11 −16.87 dB, absorción 97.9%. - 3.849 GHz:
S11 −10.26 dB, absorción 90.6%. - Resonancia débil por encima de 7 GHz;
frecuencia exacta no tabulada.

### 7.2 Transmitter --- `transmitter_case_params.json`

Gielis: a=1, b=1, m=3.4, n1=1, n2=−2, n3=1.

Sustrato: - Rogers RO4003C, 30 × 30 × 1.524 mm. - εr=3.55, tanδ=0.002.

Metal: - PEC, espesor 0.035 mm.

Variantes: - Normal: resonadores metálicos. - Complementary: ranuras en
pantalla metálica.

Geometría: - gap=1 mm. - size_1=11.6. - size_2=8.6. - rotación 0°, dx=0,
dy=0.

Simulación: - 1--8 GHz. - Unit cell X/Y. - Open add space Z. - Floquet,
incidencia normal. - Resultado co-polarizado `SZmin(1),Zmax(1)`.

Referencias normal: - mínimo 3.114 GHz, S21 −37.42 dB. - máximo 3.478
GHz, S21 −0.07 dB. - mínimo 5.403 GHz, S21 −51.01 dB.

Referencias complementary: - mínimo 3.513 GHz, S21 −46.42 dB. - máximo
4.745 GHz, S21 −0.08 dB.

### 7.3 Sensor --- `sensor_case_params.json`

Gielis: a=1.5, b=1.5, m=6, n1=n2=n3=1.5.

Sustrato: - FR-4 lossy, 13 × 20 × 1.6 mm. - εr=4.3, tanδ=0.02.

Metal: - Copper (annealed), 0.035 mm. - Microstrip superior. - Ranuras
complementarias Gielis-CSRR en plano de tierra.

Microstrip width=3 mm.

Geometría: - gap=1 mm. - size_1=2.4. - size_2=1.4. - rotación 0°, dx=0,
dy=0. - Complementary bloqueado en modo sensor.

Analito: - Gota radio 1.5 mm. - En versión 1.0.0 se añadía manualmente
en CST; no asumir automatización. - Permitividad: 1, 10, 20, 30, 40, 50,
60, 70.

Simulación: - 1--8 GHz. - Open en todas las direcciones. - Dos waveguide
ports en extremos de microstrip. - S21.

Referencias:

    εr   Frecuencia resonante   Desplazamiento
  ---- ---------------------- ----------------
     1              4.171 GHz            0 MHz
    10              3.982 GHz          189 MHz
    20              3.912 GHz          259 MHz
    30              3.877 GHz          294 MHz
    40              3.863 GHz          308 MHz
    50              3.835 GHz          336 MHz
    60              3.835 GHz          336 MHz
    70              3.821 GHz          350 MHz

Desplazamiento total: 350 MHz. Sensibilidad media reportada: 5.07
MHz/unidad de permitividad.

------------------------------------------------------------------------

## 8. Fuentes MATLAB y recuperación de C1--C4

Fuentes del proyecto: - `CST_MicrowaveStudio.m` -
`GielisMeta_CST.mlapp` - Los tres JSON.

El callback principal de App Designer es `BuildmodelinCSTButtonPushed`.
En la inspección previa se identificó que: - Valida cuatro contornos
concéntricos. - Configura unidades, solver, frecuencias y fronteras. -
Crea materiales. - Construye sustrato. - Construye plano de tierra y
resonadores o ranuras. - Construye sensor y puentes. - Configura puertos
y excitaciones.

Todavía hay que recuperar el código exacto que define C1, C2, C3 y C4 y
cómo `gap`, `size_1`, `size_2`, rotación y desplazamientos producen sus
escalas. No inventar relaciones geométricas basándose solo en JSON.

Se intentó buscar `GielisMeta_CST.mlapp` en PC B bajo:

`C:\Users\Lab Optica\gielis-web\GielisMeta_CST.mlapp`

pero esa ruta no existe. No se localizó allí. El archivo fue adjuntado
al proyecto/conversación y debe poder analizarse desde esa fuente o
localizarse en la ruta real del repositorio. No detener el trabajo por
esa ruta incorrecta.

------------------------------------------------------------------------

## 9. Estado real: validado frente a pendiente

### Validado directamente en CST

-   Python 3.12.10 x64 conecta con CST 2025.4.
-   Apertura de proyecto MWS y acceso a `model3d`.
-   Unidades mm/GHz.
-   Materiales FR4 y Rogers creados.
-   Brick creado y consultado.
-   Substrato FR4 creado y consultado.
-   Extrusión poligonal cuadrada.
-   Sustracción booleana.
-   Curva Gielis de 8000 puntos calculada y extruida en CST.
-   Consultas de existencia, volumen, material y bounding box.

### Pendiente

-   Equivalencia numérica MATLAB/Python de curva Gielis.
-   Recuperar construcción exacta de C1--C4.
-   Construcción completa absorber.
-   Transmitter normal y complementary.
-   Sensor CSRR completo y puentes.
-   Verificación de propiedades completas de materiales.
-   Fronteras configuradas y verificadas.
-   Puertos Floquet y waveguide ports creados/verificados.
-   Monitores.
-   Solver ejecutado desde Python.
-   Extracción real de S11/S21.
-   Absorción calculada con canales físicos correctos.
-   Barrido de permitividad del sensor.
-   FastAPI conectada a CST.
-   React conectado a FastAPI.

No afirmar que se ha ejecutado una simulación electromagnética. Los
resultados discretos de JSON son referencias del manuscrito, no
resultados recién generados.

------------------------------------------------------------------------

## 10. Diseño propuesto del CSTAdapter

Inspeccionar primero el backend real y adaptar esta propuesta, sin crear
duplicados:

``` text
backend/
  app/
    main.py
    api/routes/
      health.py
      cases.py
      simulations.py
      results.py
    cst/
      adapter.py
      connection.py
      materials.py
      geometry.py
      boundaries.py
      ports.py
      monitors.py
      solver.py
      results.py
    schemas/
      cases.py
      simulation.py
      results.py
    services/
      simulation_service.py
      postprocessing.py
      job_manager.py
    core/
      config.py
      exceptions.py
      logging.py
```

Responsabilidades del CSTAdapter: - Mantener conexión Design
Environment. - Abrir/crear proyectos de manera controlada. - Reutilizar
proyectos abiertos cuando corresponda. - Ejecutar VBA. - Crear
materiales y sólidos. - Extruir polígonos. - Ejecutar booleanas. -
Configurar fronteras, puertos, monitores y solver. - Ejecutar solver. -
Consultar resultados. - Guardar proyectos.

Mantener separadas geometría matemática y operaciones CST.

Funciones Python propuestas:

``` python
generate_gielis_contour(
    a, b, m, n1, n2, n3,
    num_points=8000
)
```

Debe devolver array NumPy Nx2. Comparar la fórmula con MATLAB antes de
declararla equivalente.

``` python
add_polygon_block(
    points,
    height,
    name,
    component,
    material,
    zmin=0.0
)
```

Generar VBA `Extrude/pointlist`, ejecutar y verificar sólido. En la
prueba se enviaron 12 decimales. Registrar tiempo de generación,
longitud de macro y ejecución CST.

``` python
subtract_object(object1, object2)
```

Exigir nombres completos `component:solid`, verificar existencia antes y
volumen después cuando proceda.

``` python
add_normal_material(
    name,
    epsilon,
    mu=1.0,
    tan_d=0.0,
    sigma=0.0
)
```

Comprobar `Material.Exists(name)` antes de crear para evitar duplicados.

Guardar cada ejecución en carpeta independiente:

``` text
runs/
  <timestamp>_<case>/
    model.cst
    input.json
    metadata.json
    logs/
    results/
```

No sobrescribir proyectos originales.

------------------------------------------------------------------------

## 11. Diseño FastAPI propuesto

Endpoints sugeridos (no implementados aún):

``` text
GET  /health
GET  /cst/status
GET  /cases
POST /cases/{case_id}/build
POST /simulations
GET  /simulations/{job_id}
GET  /simulations/{job_id}/results
GET  /simulations/{job_id}/logs
```

Las simulaciones pueden tardar mucho. No bloquear la petición HTTP
esperando al solver. Usar gestor de trabajos con estados: - queued -
running - completed - failed

Un identificador único por trabajo, logs y una simulación activa a la
vez en la primera versión por licencia/instancia CST.

Devolver errores estructurados. No devolver resultados de referencia
como si fueran resultados simulados.

------------------------------------------------------------------------

## 12. Postprocesamiento

Separar extracción CST de interpretación física.

Para estructuras periódicas: - Consultar identificadores reales del
árbol Floquet. - Extraer reflexión/transmisión correspondientes. -
Mantener frecuencia y datos complejos cuando estén disponibles. -
Calcular dB de forma coherente. - Calcular absorción considerando todos
los canales físicos aplicables.

No asumir siempre:

\[ A=1-\|S\_{11}\|\^2 \]

Si existe transmisión no despreciable en un caso de dos canales, la
expresión habitual es:

\[ A=1-\|S\_{11}\|^2-\|S\_{21}\|^2 \]

Verificar polarización, canales y configuración antes de usarla.

Para sensor: - Extraer S21. - Identificar frecuencia resonante. -
Repetir para cada permitividad. - No automatizar gota hasta recuperar
geometría y ubicación exactas del MATLAB.

Exportar CSV y JSON.

------------------------------------------------------------------------

## 13. Orden de continuación recomendado

### Primera tarea inmediata

1.  Inspeccionar rama, commits, `git status` y estructura del
    repositorio.
2.  Inspeccionar `CST_MicrowaveStudio.m`.
3.  Recuperar `BuildmodelinCSTButtonPushed` de `GielisMeta_CST.mlapp`.
4.  Recuperar fórmula MATLAB exacta de Gielis.
5.  Recuperar construcción y escalas de C1--C4.
6.  Comparar con la implementación Python probada.

### Segunda tarea

1.  Implementar/adaptar CSTAdapter dentro del backend existente.
2.  Reutilizar conexión, materiales, Brick, Extrude y Subtract ya
    validados.
3.  Construir C1--C4.
4.  Construir absorbedor completo en proyecto desechable.
5.  Verificar sólidos, materiales, volúmenes y bounding boxes.
6.  Guardar un `.cst` reproducible.

### Tercera tarea

1.  Configurar solver y frecuencia.
2.  Configurar background y fronteras.
3.  Configurar Floquet para absorber/transmitter.
4.  Configurar waveguide ports para sensor.
5.  Crear monitores.
6.  Verificar configuración.
7.  Ejecutar primera simulación automatizada.
8.  Extraer curvas y comparar referencias.

### Cuarta tarea

Implementar FastAPI, job manager, validación, logs, almacenamiento y
pruebas end-to-end.

### Quinta tarea

Conectar React a FastAPI y mostrar estados, gráficas y descargas.

------------------------------------------------------------------------

## 14. Criterios de aceptación del siguiente hito

El siguiente hito se considera cumplido cuando: - El adaptador se
conecta a CST 2025.4. - Abre/crea proyectos de forma controlada. - Crea
materiales y sólidos. - Ejecuta extrusiones y booleanas. - Reproduce la
fórmula MATLAB de Gielis. - Construye C1--C4 fielmente al MATLAB. -
Construye el absorbedor completo. - Verifica la geometría en CST. -
Guarda un proyecto CST reproducible.

El solver y las curvas electromagnéticas constituyen el hito posterior.

------------------------------------------------------------------------

## 15. Mensaje inicial para el agente receptor

> Estamos continuando GielisMeta-CST. Lee esta transferencia completa.
> No repitas las pruebas de integración Python--CST ya superadas:
> conexión con CST 2025.4, unidades mm/GHz, materiales FR4/Rogers,
> Brick, substrato, extrusión cuadrada, sustracción booleana y extrusión
> de curva Gielis de 8000 puntos. Se ejecutaron en PC B con Python
> 3.12.10 x64.
>
> Primero inspecciona el estado actual del repositorio y las ramas
> porque puede haber trabajo paralelo. No sobrescribas código existente.
> Después inspecciona `CST_MicrowaveStudio.m` y `GielisMeta_CST.mlapp`,
> especialmente `BuildmodelinCSTButtonPushed`. Recupera la fórmula
> exacta de Gielis y la construcción de C1--C4. Implementa el
> constructor geométrico en el backend existente y construye el
> absorbedor completo en un proyecto CST desechable.
>
> Separa hechos validados, comportamiento definido por fuentes y
> pendientes. No afirmes que se ejecutó el solver: todavía no se ha
> validado simulación electromagnética desde Python. Antes de editar,
> presenta diagnóstico del repositorio y lista de archivos que
> modificarás. Continúa desde el progreso existente, no desde cero.

------------------------------------------------------------------------

## 16. Registro resumido de evidencia

  Prueba                          Resultado observado            Estado
  ------------------------------- ------------------------------ --------------------
  Python 3.12.10 x64              Ejecutable correcto            Validado
  CST Design Environment 2025.4   Versión devuelta               Validado
  Conexión / proyecto MWS         `model3d` disponible           Validado
  Unidades                        Length mm, Frequency GHz       Validado
  Material FR4                    `Material.Exists=True`         Creación validada
  Material Rogers                 `Material.Exists=True`         Creación validada
  Brick PEC                       3.5 mm³                        Validado
  Substrato FR4                   1440 mm³                       Validado
  Extrusión cuadrada              3.5 mm³                        Validado
  Sustracción booleana            50 mm³ finales                 Validado
  Curva Gielis                    8000 puntos calculados         Validado en Python
  Extrusión Gielis                Sólido CST, 6.0985792465 mm³   Validado
  Equivalencia MATLAB             No comparada                   Pendiente
  Cuatro contornos                No construidos en conjunto     Pendiente
  Absorbedor completo             No construido                  Pendiente
  Transmisor completo             No construido                  Pendiente
  Sensor completo                 No construido                  Pendiente
  Puertos/solver                  No validados                   Pendiente
  Simulación electromagnética     No ejecutada desde Python      Pendiente
  Extracción S11/S21              No validada                    Pendiente
  FastAPI--CST                    No validada                    Pendiente
  React--FastAPI                  No conectado                   Pendiente

**Conclusión:** la comunicación Python--CST y las operaciones
geométricas fundamentales ya se demostraron experimentalmente. El
siguiente trabajo es convertirlas en un adaptador modular y reproducir
fielmente la geometría MATLAB antes de abordar el solver y FastAPI.
