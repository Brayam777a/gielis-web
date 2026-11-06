import { useMemo, useState } from 'react'
import './App.css'
import { BoardPreview, type Layer, type LegendItem } from './components/BoardPreview.tsx'
import { ParameterField } from './components/ParameterField.tsx'
import { analyzeDesign, FIELD_GROUPS, toInputs, type FieldKey, type Inputs } from './lib/design.ts'
import { EXAMPLES, MODE_NAMES, type Mode, type StructureType } from './lib/examples.ts'
import { CURVE_SAMPLES, ENVELOPE_BINS } from './lib/gielis.ts'

type View = 'structure' | 'curve'

const MODES: Mode[] = ['absorber', 'transmitter', 'sensor']
const STRUCTURE_NAMES: Record<StructureType, string> = {
  normal: 'Normal',
  complementary: 'Complementaria',
}

function format(v: number, digits = 3): string {
  return v.toLocaleString('es-CO', { maximumFractionDigits: digits })
}

export default function App() {
  // Estado: lo que el usuario puede cambiar.
  // Los campos guardan TEXTO, no números: así se puede escribir "-" o "1."
  // sin que React lo borre a medio escribir.
  const [inputs, setInputs] = useState<Inputs>(() => toInputs(EXAMPLES.absorber))
  const [mode, setMode] = useState<Mode>('absorber')
  const [structureType, setStructureType] = useState<StructureType>('normal')
  const [view, setView] = useState<View>('structure')
  const [showCurve, setShowCurve] = useState(true)

  // En modo sensor la estructura siempre es complementaria (como en la app).
  const effectiveStructure: StructureType = mode === 'sensor' ? 'complementary' : structureType

  // useMemo: recalcula solo si cambian los campos, el modo o la estructura.
  // Cambiar de vista o marcar la casilla no repite el cálculo.
  const analysis = useMemo(
    () => analyzeDesign(inputs, mode, effectiveStructure),
    [inputs, mode, effectiveStructure],
  )
  const { errors, curve, envelope, structure, warnings, error } = analysis

  const isArticleCase =
    effectiveStructure === EXAMPLES[mode].structure &&
    JSON.stringify(inputs) === JSON.stringify(toInputs(EXAMPLES[mode]))

  function update(key: FieldKey, value: string) {
    setInputs((prev) => ({ ...prev, [key]: value }))
  }

  function loadArticleCase() {
    setInputs(toInputs(EXAMPLES[mode]))
    setStructureType(EXAMPLES[mode].structure)
  }

  // Qué se dibuja en la placa según la vista elegida.
  const board = useMemo((): { layers: Layer[]; legend: LegendItem[]; description: string } | null => {
    if (view === 'curve') {
      if (!curve || !envelope) return null
      const layers: Layer[] = [{ id: 'envelope', kind: 'copper', contours: [envelope], closed: true }]
      const legend: LegendItem[] = [{ kind: 'copper', label: 'Contorno base que usa CST' }]
      if (showCurve) {
        layers.push({ id: 'curve', kind: 'curve', contours: [curve.points], closed: false })
        legend.push({ kind: 'curve', label: 'Curva original' })
      }
      return { layers, legend, description: 'Curva de Gielis y su contorno base' }
    }
    if (!structure) return null
    const { c1, c2, c3, c4 } = structure.rings
    const substrate: Layer = { id: 'substrate', kind: 'substrate', contours: [structure.substrate], closed: true }
    if (effectiveStructure === 'normal') {
      return {
        layers: [substrate, { id: 'rings', kind: 'copper', contours: [c1, c2, c3, c4], closed: true }],
        legend: [
          { kind: 'copper', label: 'Anillos de cobre' },
          { kind: 'substrate', label: 'Sustrato' },
        ],
        description: 'Estructura normal: dos anillos de cobre sobre el sustrato',
      }
    }
    const layers: Layer[] = [
      substrate,
      { id: 'plate', kind: 'copper', contours: [structure.substrate, c1, c2, c3, c4], closed: true },
    ]
    if (structure.bridges.length > 0) {
      layers.push({ id: 'bridges', kind: 'copper', contours: structure.bridges, closed: true })
    }
    return {
      layers,
      legend: [
        { kind: 'copper', label: mode === 'sensor' ? 'Plano de tierra' : 'Cobre' },
        { kind: 'substrate', label: 'Ranuras' },
      ],
      description:
        mode === 'sensor'
          ? 'Sensor: plano de tierra con dos ranuras abiertas por puentes'
          : 'Estructura complementaria: placa de cobre con dos ranuras',
    }
  }, [view, curve, envelope, showCurve, structure, effectiveStructure, mode])

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">Gielis Web</h1>
        <p className="app__subtitle">Diseño de estructuras microstrip con la súperfórmula de Gielis</p>
      </header>

      <main className="app__main">
        <section className="panel" aria-label="Parámetros del diseño">
          <div className="panel__section">
            <h2 className="panel__title">Modo y estructura</h2>
            <div className="segmented" role="group" aria-label="Modo">
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  className="segmented__button"
                  aria-pressed={mode === m}
                  onClick={() => setMode(m)}
                >
                  {MODE_NAMES[m]}
                </button>
              ))}
            </div>
            <div className="segmented" role="group" aria-label="Tipo de estructura">
              {(['normal', 'complementary'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className="segmented__button"
                  aria-pressed={effectiveStructure === s}
                  disabled={mode === 'sensor'}
                  onClick={() => setStructureType(s)}
                >
                  {STRUCTURE_NAMES[s]}
                </button>
              ))}
            </div>
            {mode === 'sensor' && (
              <p className="panel__note">En modo sensor la estructura siempre es complementaria.</p>
            )}
            <button type="button" className="link-button" onClick={loadArticleCase} disabled={isArticleCase}>
              {isArticleCase
                ? `Valores del artículo para ${MODE_NAMES[mode].toLowerCase()} cargados`
                : `Cargar los valores del artículo para ${MODE_NAMES[mode].toLowerCase()}`}
            </button>
          </div>

          {FIELD_GROUPS.map((group) => (
            <div className="panel__section" key={group.title}>
              <h2 className="panel__title">{group.title}</h2>
              <div className="panel__fields">
                {group.fields.map((f) => (
                  <ParameterField
                    key={f.key}
                    label={f.label}
                    math={f.math}
                    hint={f.hint}
                    value={inputs[f.key]}
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    error={errors[f.key]}
                    onChange={(v) => update(f.key, v)}
                  />
                ))}
              </div>
              {group.title === 'Curva de Gielis' && (
                <p className="formula" aria-label="Fórmula de Gielis">
                  ρ(θ) = (|cos(mθ/4)/a|<sup>n2</sup> + |sin(mθ/4)/b|<sup>n3</sup>)<sup>−1/n1</sup>
                </p>
              )}
            </div>
          ))}
        </section>

        <section className="preview" aria-label="Vista previa">
          <div className="preview__head">
            <div className="segmented" role="group" aria-label="Qué mostrar">
              <button
                type="button"
                className="segmented__button"
                aria-pressed={view === 'structure'}
                onClick={() => setView('structure')}
              >
                Estructura
              </button>
              <button
                type="button"
                className="segmented__button"
                aria-pressed={view === 'curve'}
                onClick={() => setView('curve')}
              >
                Curva
              </button>
            </div>
            {view === 'curve' && (
              <label className="toggle">
                <input type="checkbox" checked={showCurve} onChange={(e) => setShowCurve(e.target.checked)} />
                Mostrar la curva original
              </label>
            )}
          </div>

          {board ? (
            <BoardPreview layers={board.layers} legend={board.legend} description={board.description} />
          ) : (
            <div className="board board--empty" role="status">
              <p>{error ?? 'Corrige los campos marcados en rojo para ver el diseño.'}</p>
            </div>
          )}

          {warnings.length > 0 && view === 'structure' && (
            <ul className="notice" role="status">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}

          {view === 'curve' && curve && envelope && (
            <dl className="stats">
              <div className="stats__item">
                <dt>Periodo de θ</dt>
                <dd>0 a {curve.u}π</dd>
              </div>
              <div className="stats__item">
                <dt>Radio mínimo y máximo</dt>
                <dd>
                  {format(curve.rhoMin)} a {format(curve.rhoMax)} mm
                </dd>
              </div>
              <div className="stats__item">
                <dt>Puntos</dt>
                <dd>
                  {format(CURVE_SAMPLES, 0)} en la curva, {ENVELOPE_BINS} en el contorno
                </dd>
              </div>
            </dl>
          )}

          {view === 'structure' && structure && (
            <dl className="stats">
              <div className="stats__item">
                <dt>Gap usado</dt>
                <dd>{format(structure.rings.effective.gap_mm)} mm</dd>
              </div>
              <div className="stats__item">
                <dt>Tamaños usados</dt>
                <dd>
                  {format(structure.rings.effective.size1)} y {format(structure.rings.effective.size2)}
                </dd>
              </div>
              <div className="stats__item">
                <dt>Área de cobre</dt>
                <dd>{format(structure.copperArea, 2)} mm²</dd>
              </div>
              <div className="stats__item">
                <dt>Sustrato</dt>
                <dd>
                  {format(Number(inputs.width_mm))} × {format(Number(inputs.length_mm))} mm
                </dd>
              </div>
            </dl>
          )}
        </section>
      </main>
    </div>
  )
}
