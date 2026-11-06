import { useMemo, useState } from 'react'
import './App.css'
import { BoardPreview } from './components/BoardPreview.tsx'
import { ParameterField } from './components/ParameterField.tsx'
import { EXAMPLES } from './lib/examples.ts'
import {
  CURVE_SAMPLES,
  ENVELOPE_BINS,
  generateCurve,
  polygonArea,
  radialEnvelope,
  validateParams,
  type GielisParams,
} from './lib/gielis.ts'

type ParamKey = keyof GielisParams

/** Lo que el usuario ve por cada parámetro: rango del deslizador y explicación. */
const FIELDS: { key: ParamKey; hint: string; min: number; max: number; step: number }[] = [
  { key: 'a', hint: 'Escala en la dirección del coseno', min: 0.1, max: 10, step: 0.1 },
  { key: 'b', hint: 'Escala en la dirección del seno', min: 0.1, max: 10, step: 0.1 },
  { key: 'm', hint: 'Simetría: cuántos lóbulos tiene la forma', min: 0.01, max: 20, step: 0.01 },
  { key: 'n1', hint: 'Forma general: picos agudos o redondeados', min: 0.1, max: 20, step: 0.1 },
  { key: 'n2', hint: 'Forma del término del coseno', min: -10, max: 20, step: 0.1 },
  { key: 'n3', hint: 'Forma del término del seno', min: -10, max: 20, step: 0.1 },
]

/** Convierte los números de un caso a texto para los campos del formulario. */
function toInputs(p: GielisParams): Record<ParamKey, string> {
  return {
    a: String(p.a),
    b: String(p.b),
    m: String(p.m),
    n1: String(p.n1),
    n2: String(p.n2),
    n3: String(p.n3),
  }
}

function format(v: number, digits = 3): string {
  return v.toLocaleString('es-CO', { maximumFractionDigits: digits })
}

/**
 * Función pura: del texto de los campos a la geometría.
 * No depende de React, así que es fácil de leer y de probar.
 */
function analyze(inputs: Record<ParamKey, string>) {
  // Un campo vacío no es cero: lo marcamos como "escribe un número".
  const num = (s: string) => (s.trim() === '' ? NaN : Number(s))
  const params: GielisParams = {
    a: num(inputs.a),
    b: num(inputs.b),
    m: num(inputs.m),
    n1: num(inputs.n1),
    n2: num(inputs.n2),
    n3: num(inputs.n3),
  }
  const errors = validateParams(params)
  if (Object.keys(errors).length > 0) {
    return { params, errors, geometry: null, error: null }
  }
  try {
    const curve = generateCurve(params)
    const envelope = radialEnvelope(curve.points)
    const geometry = { curve, envelope, area: polygonArea(envelope) }
    return { params, errors, geometry, error: null }
  } catch (e) {
    return { params, errors, geometry: null, error: (e as Error).message }
  }
}

export default function App() {
  // El estado guarda el TEXTO de cada campo, no el número: así se puede
  // escribir "-" o "1." sin que React lo borre mientras se escribe.
  const [inputs, setInputs] = useState(() => toInputs(EXAMPLES[0].params))
  const [showCurve, setShowCurve] = useState(true)

  // useMemo guarda el resultado y solo vuelve a calcular cuando cambia
  // `inputs`. Marcar o desmarcar la casilla no recalcula las 8000 muestras.
  const { params, errors, geometry, error } = useMemo(() => analyze(inputs), [inputs])

  const activeExample = EXAMPLES.find((ex) =>
    (Object.keys(ex.params) as ParamKey[]).every((k) => ex.params[k] === params[k]),
  )

  function update(key: ParamKey, value: string) {
    setInputs((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">Gielis Web</h1>
        <p className="app__subtitle">
          Previsualización de la súperfórmula para estructuras microstrip
        </p>
      </header>

      <main className="app__main">
        <section className="panel" aria-labelledby="params-title">
          <h2 className="panel__title" id="params-title">
            Parámetros de la curva
          </h2>

          <div className="examples" role="group" aria-label="Cargar un caso de ejemplo">
            <span className="examples__label">Cargar caso</span>
            {EXAMPLES.map((ex) => (
              <button
                key={ex.id}
                type="button"
                className="examples__button"
                aria-pressed={activeExample?.id === ex.id}
                onClick={() => setInputs(toInputs(ex.params))}
              >
                {ex.name}
              </button>
            ))}
          </div>

          <div className="panel__fields">
            {FIELDS.map((f) => (
              <ParameterField
                key={f.key}
                symbol={f.key}
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

          <p className="formula" aria-label="Fórmula de Gielis">
            ρ(θ) = (|cos(mθ/4)/a|<sup>n2</sup> + |sin(mθ/4)/b|<sup>n3</sup>)<sup>−1/n1</sup>
          </p>
        </section>

        <section className="preview" aria-labelledby="preview-title">
          <div className="preview__head">
            <h2 className="preview__title" id="preview-title">
              {activeExample ? `Forma del caso ${activeExample.name.toLowerCase()}` : 'Forma personalizada'}
            </h2>
            <label className="toggle">
              <input
                type="checkbox"
                checked={showCurve}
                onChange={(e) => setShowCurve(e.target.checked)}
              />
              Mostrar la curva original
            </label>
          </div>

          {geometry ? (
            <>
              <BoardPreview
                curve={geometry.curve.points}
                envelope={geometry.envelope}
                showCurve={showCurve}
              />
              <dl className="stats">
                <div className="stats__item">
                  <dt>Periodo de θ</dt>
                  <dd>0 a {geometry.curve.u}π</dd>
                </div>
                <div className="stats__item">
                  <dt>Radio mínimo y máximo</dt>
                  <dd>
                    {format(geometry.curve.rhoMin)} a {format(geometry.curve.rhoMax)} mm
                  </dd>
                </div>
                <div className="stats__item">
                  <dt>Área del contorno</dt>
                  <dd>{format(geometry.area, 2)} mm²</dd>
                </div>
                <div className="stats__item">
                  <dt>Puntos</dt>
                  <dd>
                    {format(CURVE_SAMPLES, 0)} en la curva, {ENVELOPE_BINS} en el contorno
                  </dd>
                </div>
              </dl>
            </>
          ) : (
            <div className="board board--empty" role="status">
              <p>
                {error ?? 'Corrige los parámetros marcados en rojo para ver la forma.'}
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
