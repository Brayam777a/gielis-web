# Backend: GielisGeometryService

Geometría de `GielisMetaCST.mlapp` portada a Python (NumPy + Shapely), antes de
conectar CST.

## Qué cubre

- Fórmula de Gielis con 8000 muestras y periodo según `rat(m)` (equivalente
  exacto de MATLAB en `GielisGeometryService.matlab_rat`).
- Envolvente radial: 720 bins, interpolación circular y suavizado de 5.
- Contornos C1–C4 con gap físico en mm, rotación y desplazamiento.
- Estructuras Normal `(C1-C2) + (C3-C4)` y Complementary.
- Sensor CSRR: dos ranuras y dos puentes; validación dentro del sustrato.

## Tests

```bash
python -m pip install -e ".[test]"
python -m pytest
```

Los tests leen los casos de `examples/`. Los valores de `golden/` los generó el
propio código Python: prueban que nada cambie sin querer (regresión), **no**
que Python sea igual a MATLAB.

Después de un cambio **intencional** de la geometría, regenéralos y revisa el
cambio antes de hacer commit:

```bash
python tools/update_golden.py
git diff golden/golden_cases.json
python -m pytest
```

## Comparar con la app MATLAB real (pendiente)

Esta es la prueba que demuestra que Python = app.

1. En MATLAB (PC de CST), con `src/` del proyecto original en el path:
   ```matlab
   app = GielisMetaCST;
   ```
2. En la app, elige el modo, escribe los parámetros de
   `examples/absorber_case_params.json`, pulsa **Preview** y luego
   **Generate structure**.
3. En la ventana de comandos:
   ```matlab
   export_from_app(app, "absorber", "C:\ruta\absorber_app.json")
   ```
4. Repite con `transmitter` y `sensor`.
5. En Python:
   ```bash
   python tests/compare_app_export.py C:\ruta\absorber_app.json --case absorber
   ```
   Debe terminar con `RESULTADO: Python coincide con la app`.

`matlab/export_geometry_reference.m` es una reimplementación de la lógica en
MATLAB, no la app: sirve como apoyo, pero no reemplaza esta comparación.
