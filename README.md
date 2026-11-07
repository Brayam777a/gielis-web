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
    `-- DOCUMENTACION.md   Qué hemos hecho, qué falta y cómo funciona cada parte
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
python -m pip install -e ".[api,test]"
python -m pytest
uvicorn gielis_api.main:app --reload   # servidor; déjalo abierto

# frontend, en otra terminal
cd ..\frontend
npm install
npm run dev
```

## Reglas de trabajo

- Lee primero `docs/DOCUMENTACION.md`: explica cada parte del proyecto.
- Commits pequeños, uno por tarea.
