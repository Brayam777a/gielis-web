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
`-- components/
    |-- ParameterField.tsx      Un parámetro: deslizador + campo numérico + error
    `-- BoardPreview.tsx        La placa: dibuja las capas en SVG
```
