import { useMemo, useRef, useState } from 'react'
import './App.css'
import { BoardPreview, type Layer, type LegendItem } from './components/BoardPreview.tsx'
import { CaseJson } from './components/CaseJson.tsx'
import { OpenCase } from './components/OpenCase.tsx'
import { ParameterField } from './components/ParameterField.tsx'
import { ResultsView } from './components/ResultsView.tsx'
import { SimulateBar } from './components/SimulateBar.tsx'
import { SelectField } from './components/SelectField.tsx'
import {
  analyzeDesign,
  FIELD_GROUPS,
  fitToSubstrate,
  MONITOR_OPTIONS,
  toInputs,
  type FieldKey,
  type Inputs,
} from './lib/design.ts'
import { EXAMPLES, MODE_NAMES, type Mode, type StructureType } from './lib/examples.ts'
import type { LoadedCase } from './lib/caseFile.ts'
import { CURVE_SAMPLES, ENVELOPE_BINS } from './lib/gielis.ts'
import { CONDUCTORS, DIELECTRICS, findDielectric } from './lib/materials.ts'
import { useSimulation } from './lib/useSimulation.ts'

type View = 'structure' | 'curve' | 'results'

const VIEW_NAMES: Record<View, string> = { structure: 'Estructura', curve: 'Curva', results: 'Resultados' }

const MODES: Mode[] = ['absorber', 'transmitter', 'sensor']
const STRUCTURE_NAMES: Record<StructureType, string> = {
  normal: 'Normal',
  complementary: 'Complementaria',
}

function format(v: number, digits = 3): string {
  return v.toLocaleString('es-CO', { maximumFractionDigits: digits })
}

/** Redondea a centésimas de mm y lo devuelve como texto para el campo. */
const toField = (v: number) => String(Math.round(v * 100) / 100)

/** Secciones abiertas al empezar: las que más se usan. */
const INITIALLY_OPEN: Record<string, boolean> = {
  'Curva de Gielis': true,
  'Anillos concéntricos': true,
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
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(INITIALLY_OPEN)
  const [fitMessage, setFitMessage] = useState<string | null>(null)
  // dx y dy al empezar a arrastrar la figura (el arrastre suma a partir de ahí).
  const dragOrigin = useRef({ dx: 0, dy: 0 })
  // Servidor, simulación elegida e historial (lib/useSimulation.ts).
  const sim = useSimulation()

  // En modo sensor la estructura siempre es complementaria (como en la app).
  const effectiveStructure: StructureType = mode === 'sensor' ? 'complementary' : structureType

  // useMemo: recalcula solo si cambian los campos, el modo o la estructura.
  // Cambiar de vista o marcar la casilla no repite el cálculo.
  const analysis = useMemo(
    () => analyzeDesign(inputs, mode, effectiveStructure),
    [inputs, mode, effectiveStructure],
  )
  const { errors, curve, envelope, fidelity, curveNotices, structure, caseRequest, warnings, error } = analysis
  // Avisos que se muestran: los de la curva siempre; los de los anillos solo en la vista Estructura.
  const notices = view === 'structure' ? [...curveNotices, ...warnings] : curveNotices

  // Con un material predefinido, εr y tanδ quedan fijos (como en la app).
  const dielectricPreset = findDielectric(inputs.dielectric)?.preset ?? null

  const isArticleCase =
    effectiveStructure === EXAMPLES[mode].structure &&
    JSON.stringify(inputs) === JSON.stringify(toInputs(EXAMPLES[mode]))

  function update(key: FieldKey, value: string) {
    setInputs((prev) => ({ ...prev, [key]: value }))
  }

  /** Al elegir un dieléctrico predefinido se copian su εr y su tanδ. */
  function selectDielectric(id: string) {
    const preset = findDielectric(id)?.preset
    setInputs((prev) => ({
      ...prev,
      dielectric: id,
      ...(preset ? { eps_r: String(preset.eps_r), loss_tangent: String(preset.loss_tangent) } : {}),
    }))
  }

  /** Escala la figura para que el anillo exterior quepa en el sustrato. */
  function fitStructure() {
    if (!envelope) return
    const fit = fitToSubstrate(inputs, envelope)
    if (fit) {
      setInputs((prev) => ({ ...prev, ...fit }))
      setFitMessage(`Tamaño 1 = ${fit.size1} y Tamaño 2 = ${fit.size2}: el anillo exterior queda a un margen del borde.`)
    } else {
      setFitMessage('No cabe con este desplazamiento: acerca dx y dy a 0 o agranda el sustrato.')
    }
  }

  const moveHandlers = {
    start: () => {
      dragOrigin.current = { dx: Number(inputs.dx_mm) || 0, dy: Number(inputs.dy_mm) || 0 }
    },
    drag: (ddx: number, ddy: number) => {
      const { dx, dy } = dragOrigin.current
      setInputs((prev) => ({ ...prev, dx_mm: toField(dx + ddx), dy_mm: toField(dy + ddy) }))
    },
    nudge: (ddx: number, ddy: number) => {
      setInputs((prev) => ({
        ...prev,
        dx_mm: toField((Number(prev.dx_mm) || 0) + ddx),
        dy_mm: toField((Number(prev.dy_mm) || 0) + ddy),
      }))
    },
  }

  /** Llena el formulario con un caso abierto desde un archivo. */
  function loadCase(c: LoadedCase) {
    setMode(c.mode)
    setStructureType(c.structure)
    setInputs(c.inputs)
    setFitMessage(null)
  }

  /** Manda el caso al servidor y pasa a la vista de resultados para ver el avance. */
  function simulate() {
    if (!caseRequest) return
    void sim.start(caseRequest)
    setView('results')
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
    const legend: LegendItem[] = [
      { kind: 'copper', label: mode === 'sensor' ? 'Plano de tierra' : 'Cobre' },
      { kind: 'substrate', label: 'Ranuras' },
    ]
    if (structure.line) {
      // La línea va en la cara de arriba: se dibuja translúcida encima.
      layers.push({ id: 'line', kind: 'trace', contours: [structure.line], closed: true })
      legend.push({ kind: 'trace', label: 'Línea microstrip (cara superior)' })
    }
    return {
      layers,
      legend,
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

          {FIELD_GROUPS.filter((g) => !g.sensorOnly || mode === 'sensor').map((group) => {
            const keys: FieldKey[] = [...group.fields.map((f) => f.key), ...(group.select ? [group.select] : [])]
            const errorCount = keys.filter((k) => errors[k]).length
            return (
            <details
              className="panel__section group"
              key={group.title}
              open={openGroups[group.title] ?? false}
              onToggle={(e) => {
                const isOpen = e.currentTarget.open
                setOpenGroups((prev) => ({ ...prev, [group.title]: isOpen }))
              }}
            >
              <summary className="group__summary">
                <h2 className="panel__title group__title">{group.title}</h2>
                {errorCount > 0 && (
                  <span className="group__badge">
                    {errorCount === 1 ? '1 campo por corregir' : `${errorCount} campos por corregir`}
                  </span>
                )}
              </summary>
              <div className="panel__fields">
                {group.select === 'dielectric' && (
                  <SelectField
                    label="Material"
                    value={inputs.dielectric}
                    options={DIELECTRICS}
                    error={errors.dielectric}
                    onChange={selectDielectric}
                  />
                )}
                {group.select === 'monitor_fields' && (
                  <SelectField
                    label="Generar"
                    value={inputs.monitor_fields}
                    options={MONITOR_OPTIONS}
                    error={errors.monitor_fields}
                    onChange={(v) => update('monitor_fields', v)}
                  />
                )}
                {group.select === 'conductor' && (
                  <SelectField
                    label="Material"
                    value={inputs.conductor}
                    options={CONDUCTORS}
                    error={errors.conductor}
                    onChange={(v) => update('conductor', v)}
                  />
                )}
                {group.fields
                  // La frecuencia del monitor solo importa si se pide algún campo.
                  .filter((f) => f.key !== 'monitor_freq_ghz' || inputs.monitor_fields !== 'none')
                  .map((f) => (
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
                    disabled={dielectricPreset !== null && (f.key === 'eps_r' || f.key === 'loss_tangent')}
                    onChange={(v) => update(f.key, v)}
                  />
                ))}
              </div>
              {group.select === 'dielectric' && dielectricPreset && (
                <p className="panel__note">
                  εr y tanδ son los del material elegido. Para escribirlos, elige Personalizado.
                </p>
              )}
              {group.title === 'Curva de Gielis' && (
                <p className="formula" aria-label="Fórmula de Gielis">
                  ρ(θ) = (|cos(mθ/4)/a|<sup>n2</sup> + |sin(mθ/4)/b|<sup>n3</sup>)<sup>−1/n1</sup>
                </p>
              )}
              {group.title === 'Anillos concéntricos' && (
                <div className="group__actions">
                  <button type="button" className="button" onClick={fitStructure} disabled={!envelope}>
                    Ajustar al sustrato
                  </button>
                  {fitMessage && (
                    <p className="panel__note" role="status">
                      {fitMessage}
                    </p>
                  )}
                </div>
              )}
            </details>
            )
          })}

          <div className="panel__section">
            <h2 className="panel__title">Caso completo</h2>
            <OpenCase onLoad={loadCase} />
            <CaseJson caseRequest={caseRequest} />
          </div>
        </section>

        <section className="preview" aria-label="Vista previa">
          <div className="preview__head">
            <div className="segmented" role="group" aria-label="Qué mostrar">
              {(['structure', 'curve', 'results'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  className="segmented__button"
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                >
                  {VIEW_NAMES[v]}
                </button>
              ))}
            </div>
            {view === 'curve' && (
              <label className="toggle">
                <input type="checkbox" checked={showCurve} onChange={(e) => setShowCurve(e.target.checked)} />
                Mostrar la curva original
              </label>
            )}
            <SimulateBar sim={sim} caseRequest={caseRequest} onSimulate={simulate} />
          </div>

          {view === 'results' ? (
            <ResultsView sim={sim} currentCase={caseRequest} onLoadCase={loadCase} />
          ) : (
          <>

          {board ? (
            <BoardPreview
              layers={board.layers}
              legend={board.legend}
              description={board.description}
              frame={
                view === 'structure'
                  ? { width: Number(inputs.width_mm), length: Number(inputs.length_mm) }
                  : undefined
              }
              onMove={view === 'structure' ? moveHandlers : undefined}
            />
          ) : (
            <div className="board board--empty" role="status">
              <p>{error ?? 'Corrige los campos marcados en rojo para ver el diseño.'}</p>
            </div>
          )}

          {/* Avisos y datos: debajo de la placa, o en una columna a la derecha en pantallas anchas. */}
          <div className="preview__side">
          {notices.length > 0 && (
            <ul className="notice" role="status">
              {notices.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}

          {view === 'curve' && curve && envelope && fidelity && (
            <dl className="stats">
              <div className="stats__item">
                <dt>¿Se reproduce tal cual en CST?</dt>
                <dd>
                  {fidelity.innerDirectionsPct === 0 && fidelity.maxSmoothingMm <= 0.02 * curve.rhoMax
                    ? 'Sí'
                    : fidelity.innerDirectionsPct > 0
                      ? 'No: tiene partes internas'
                      : 'Casi: puntas redondeadas'}
                </dd>
              </div>
              <div className="stats__item">
                <dt>Diferencia máxima por suavizado</dt>
                <dd>{format(fidelity.maxSmoothingMm)} mm</dd>
              </div>
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
                <dt>Tamaño del resonador</dt>
                <dd>
                  {format(structure.resonatorSize.width_mm, 2)} × {format(structure.resonatorSize.height_mm, 2)} mm
                </dd>
              </div>
              <div className="stats__item">
                <dt>Área de cobre</dt>
                <dd>{format(structure.copperArea, 2)} mm²</dd>
              </div>
              <div className="stats__item">
                <dt>Sustrato (W × L × h)</dt>
                <dd>
                  {format(Number(inputs.width_mm))} × {format(Number(inputs.length_mm))} ×{' '}
                  {format(Number(inputs.thickness_mm))} mm
                </dd>
              </div>
              <div className="stats__item">
                <dt>Barrido</dt>
                <dd>
                  {format(Number(inputs.f_min_ghz))} a {format(Number(inputs.f_max_ghz))} GHz
                </dd>
              </div>
            </dl>
          )}
          </div>
          </>
          )}
        </section>
      </main>
    </div>
  )
}
