import type { CaseRequest } from '../lib/design.ts'
import type { SimulationState } from '../lib/useSimulation.ts'

type Props = {
  sim: SimulationState
  caseRequest: CaseRequest | null
  onSimulate: () => void
}

/** Botón Simular y una línea con el estado del servidor, arriba de la vista previa. */
export function SimulateBar({ sim, caseRequest, onSimulate }: Props) {
  const { server } = sim

  if (server.kind === 'idle') {
    return (
      <div className="simulate">
        <button type="button" className="button" onClick={sim.connect}>
          Conectar con el servidor
        </button>
      </div>
    )
  }

  const online = server.kind === 'online'
  const reason = !online
    ? 'Enciende el servidor para simular.'
    : !caseRequest
      ? 'Corrige los campos marcados en rojo.'
      : undefined

  return (
    <div className="simulate">
      <span className={`simulate__status simulate__status--${server.kind}`} role="status">
        {server.kind === 'checking' && 'Buscando el servidor…'}
        {server.kind === 'offline' && 'Servidor apagado'}
        {online && (server.health.simulator === 'mock' ? 'Servidor listo · datos de prueba' : 'Servidor listo · CST')}
      </span>
      <button
        type="button"
        className="button button--primary"
        disabled={!online || !caseRequest || sim.starting}
        title={reason}
        onClick={onSimulate}
      >
        {sim.starting ? 'Enviando…' : 'Simular'}
      </button>
    </div>
  )
}
