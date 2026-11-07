import { useState } from 'react'
import { API_URL, type JobDetail, type SimulationResult } from '../lib/api.ts'
import { parseCaseFile, type LoadedCase } from '../lib/caseFile.ts'
import type { CaseRequest } from '../lib/design.ts'
import { MODE_NAMES } from '../lib/examples.ts'
import { isFinished, nearestIndex, resultToCsv, sameJson, shortTime, STATUS_LABEL } from '../lib/simulation.ts'
import type { SimulationState } from '../lib/useSimulation.ts'
import { ResultsChart, type Marker, type Series } from './ResultsChart.tsx'

type Props = {
  sim: SimulationState
  /** El caso que está ahora en el formulario, para avisar si el resultado es de otro. */
  currentCase: CaseRequest | null
  onLoadCase: (c: LoadedCase) => void
}

const fmt = (v: number, digits = 2) => v.toLocaleString('es-CO', { maximumFractionDigits: digits })

/**
 * Vista "Resultados": el estado de la simulación elegida o sus curvas, y a la
 * derecha (o debajo, en el celular) las resonancias y el historial.
 * Devuelve dos bloques porque ocupan los mismos lugares que la placa y los datos.
 */
export function ResultsView({ sim, currentCase, onLoadCase }: Props) {
  const { job } = sim
  return (
    <>
      <div className="results">
        <MainArea sim={sim} currentCase={currentCase} />
      </div>
      <div className="preview__side">
        {job?.result && <ResultSide job={job} result={job.result} onLoadCase={onLoadCase} />}
        <History sim={sim} />
      </div>
    </>
  )
}

function MainArea({ sim, currentCase }: Pick<Props, 'sim' | 'currentCase'>) {
  const { server, job, selectedId, error } = sim

  if (!selectedId) {
    return (
      <div className="results__empty">
        {server.kind === 'online' ? (
          <p>Pulsa <strong>Simular</strong> para enviar el diseño actual, o elige una simulación del historial.</p>
        ) : server.kind === 'idle' ? (
          <p>
            Para simular, esta página necesita el servidor de Gielis Web encendido en tu PC. Pulsa{' '}
            <strong>Conectar con el servidor</strong> cuando lo tengas.
          </p>
        ) : (
          <>
            <p>
              No hay respuesta del servidor en <code>{API_URL}</code>. Para encenderlo, en una terminal:
            </p>
            <pre className="results__code">
              {'cd backend\n.venv\\Scripts\\activate\nuvicorn gielis_api.main:app --reload'}
            </pre>
            <p className="results__hint">La página lo vuelve a buscar sola cada 5 segundos.</p>
          </>
        )}
        {error && <p className="results__error">{error}</p>}
      </div>
    )
  }

  if (!job) {
    return (
      <div className="results__empty" role="status">
        <p>{error ?? 'Cargando la simulación…'}</p>
      </div>
    )
  }

  if (!isFinished(job.status)) {
    const progress = job.progress ?? 0
    return (
      <div className="results__empty">
        <div className="results__progress-card" role="status">
          <p className="results__status">
            {STATUS_LABEL[job.status]}
            {job.status === 'simulating' && job.progress !== null && ` · ${Math.round(progress)} %`}
          </p>
          <p className="results__hint">{job.message}</p>
          <progress
            className="results__progress"
            max={100}
            value={job.status === 'simulating' ? progress : undefined}
            aria-label="Avance de la simulación"
          />
          <button type="button" className="button" onClick={() => void sim.cancel(job.id)}>
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  if (job.status !== 'done' || !job.result) {
    return (
      <div className="results__empty">
        <p className="results__status">{STATUS_LABEL[job.status]}</p>
        {job.error && <p className="results__error">{job.error}</p>}
      </div>
    )
  }

  return <Charts key={job.id} job={job} result={job.result} stale={currentCase !== null && !sameJson(currentCase, job.case)} />
}

function Charts({ job, result, stale }: { job: JobDetail; result: SimulationResult; stale: boolean }) {
  const [hover, setHover] = useState<number | null>(null)
  const f = result.frequency_ghz

  const sSeries: Series[] = []
  if (result.s11_db) sSeries.push({ label: 'S11', values: result.s11_db, tone: 's11' })
  if (result.s21_db) sSeries.push({ label: 'S21', values: result.s21_db, tone: 's21' })
  const markers: Marker[] = result.resonances.map((r) => ({
    index: nearestIndex(f, r.frequency_ghz),
    tone: r.parameter === 'S11' ? 's11' : 's21',
  }))
  const absorption = result.absorption?.map((a) => 100 * a)

  return (
    <div className="results__charts">
      {(result.simulator === 'mock' || stale) && (
        <ul className="notice results__notice">
          {result.simulator === 'mock' && (
            <li>Datos de prueba: la geometría es real, pero estas curvas no vienen de CST.</li>
          )}
          {stale && <li>El diseño cambió después de esta simulación ({shortTime(job.created_at)}).</li>}
        </ul>
      )}
      <ResultsChart
        title="Parámetros S"
        unit="dB"
        frequency={f}
        series={sSeries}
        markers={markers}
        hover={hover}
        onHover={setHover}
      />
      {absorption && (
        <ResultsChart
          title="Absorción"
          unit="%"
          frequency={f}
          series={[{ label: result.s21_db ? 'A = 1 − |S11|² − |S21|²' : 'A = 1 − |S11|²', values: absorption, tone: 'absorption' }]}
          domain={[0, 100]}
          hover={hover}
          onHover={setHover}
        />
      )}
      <p className="results__readout" aria-live="polite">
        {hover === null
          ? 'Pasa el mouse sobre las gráficas para leer los valores.'
          : [
              `f = ${fmt(f[hover], 3)} GHz`,
              ...sSeries.map((s) => `${s.label} = ${fmt(s.values[hover])} dB`),
              ...(absorption ? [`A = ${fmt(absorption[hover], 1)} %`] : []),
            ].join('   ·   ')}
      </p>
    </div>
  )
}

function ResultSide({ job, result, onLoadCase }: { job: JobDetail; result: SimulationResult; onLoadCase: (c: LoadedCase) => void }) {
  function download() {
    const blob = new Blob([resultToCsv(result)], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${job.id}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function loadCase() {
    const parsed = parseCaseFile(JSON.stringify(job.case))
    if (parsed.ok) onLoadCase(parsed.value)
  }

  return (
    <section className="results__side" aria-label="Resonancias">
      <h2 className="results__heading">Resonancias</h2>
      {result.resonances.length === 0 ? (
        <p className="results__hint">No hay resonancias marcadas en el barrido.</p>
      ) : (
        <table className="results__table">
          <thead>
            <tr>
              <th scope="col">GHz</th>
              <th scope="col">{result.resonances[0].parameter} (dB)</th>
              {result.resonances[0].absorption_pct !== null && <th scope="col">A (%)</th>}
            </tr>
          </thead>
          <tbody>
            {result.resonances.map((r) => (
              <tr key={r.frequency_ghz}>
                <td>{fmt(r.frequency_ghz, 3)}</td>
                <td>{fmt(r.value_db)}</td>
                {r.absorption_pct !== null && <td>{fmt(r.absorption_pct, 1)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="results__actions">
        <button type="button" className="button" onClick={download}>
          Descargar CSV
        </button>
        <button type="button" className="button" onClick={loadCase}>
          Cargar este caso
        </button>
      </div>
    </section>
  )
}

function History({ sim }: { sim: SimulationState }) {
  if (sim.history.length === 0) return null
  return (
    <section aria-label="Historial">
      <h2 className="results__heading">Historial</h2>
      <ul className="history">
        {sim.history.slice(0, 30).map((h) => (
          <li key={h.id}>
            <button
              type="button"
              className="history__item"
              aria-current={h.id === sim.selectedId ? 'true' : undefined}
              onClick={() => sim.select(h.id)}
            >
              <span>{MODE_NAMES[h.mode]}</span>
              <span className={`history__status history__status--${h.status}`}>{STATUS_LABEL[h.status]}</span>
              <span className="history__time">{shortTime(h.created_at)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
