# Frontend: Gielis Web (React + TypeScript + Vite)

Previsualización en vivo de la súperfórmula de Gielis. La explicación completa
de cada archivo está en [`docs/DOCUMENTACION.md`](../docs/DOCUMENTACION.md).

## Ejecutar

```powershell
cd frontend
npm install      # solo la primera vez o si cambia package.json
npm run dev      # abre http://localhost:5173
```

## Comandos útiles

| Comando | Para qué |
| --- | --- |
| `npm run dev` | Servidor de desarrollo; recarga al guardar |
| `npm run lint` | Revisa el código con ESLint |
| `npm test` | Corre las pruebas (la primera vez: `npm install -D vitest`) |
| `npm run build` | Revisa los tipos con TypeScript y genera la versión final en `dist/` |

## Archivos principales

```text
src/
|-- main.tsx                    Punto de entrada: monta <App /> en la página
|-- App.tsx                     Pantalla principal: estado, vistas y capas del dibujo
|-- App.css / index.css         Estilos (index.css tiene los colores y la tipografía)
|-- lib/gielis.ts               Súperfórmula, rat de MATLAB, envolvente radial
|-- lib/concentric.ts           Anillos C1–C4, centrado y puentes del sensor
|-- lib/design.ts               analyzeDesign: del formulario a la geometría; lista de campos
|-- lib/examples.ts             Los tres casos del artículo
|-- lib/materials.ts            Dieléctricos y conductores de la app
|-- lib/caseFile.ts             Abrir un caso desde JSON (formato de la página o de examples/)
|-- lib/*.test.ts               Pruebas (Vitest); lib/testing.ts lee los archivos del backend
`-- components/
    |-- ParameterField.tsx      Un parámetro: deslizador + campo numérico + error
    |-- SelectField.tsx         Selector de material
    |-- CaseJson.tsx            El caso completo en JSON: ver, copiar, descargar
    |-- OpenCase.tsx            Botón para abrir un caso (.json)
    `-- BoardPreview.tsx        La placa: dibuja las capas en SVG
```
