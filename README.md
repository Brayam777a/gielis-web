# Gielis Web

Interfaz web para GielisMeta-CST: diseño, previsualización y simulación en CST
Studio Suite de estructuras basadas en la súperfórmula de Gielis (modos
absorbente, transmisor y sensor). Reemplaza la interfaz de MATLAB App Designer.

## Estructura

```text
gielis-web/
|-- backend/    Python: geometría (GielisGeometryService) y, después, API FastAPI + CST
|-- frontend/   React + TypeScript (Vite)
`-- docs/
    `-- CONTRATO.md   JSON que intercambian front y backend
```

## Requisitos

- Windows 64 bits con CST Studio Suite 2025 y licencia (solo para simular).
- **Python 3.12** de 64 bits. Python 3.14 no funciona con la librería de CST 2025.
- Node.js LTS (para el front).

## Arranque rápido

```bash
# backend
cd backend
py -3.12 -m venv .venv
.venv\Scripts\activate
python -m pip install -e ".[test]"
python -m pytest

# frontend (ver frontend/README.md)
```

## Reglas de trabajo

- Un cambio en el JSON se acuerda primero en `docs/CONTRATO.md`.
- Commits pequeños, uno por tarea.
