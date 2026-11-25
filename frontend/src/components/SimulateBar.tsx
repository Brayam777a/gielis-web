import { useState, type FormEvent } from 'react'
import type { CaseRequest } from '../lib/design.ts'
import type { SimulationState } from '../lib/useSimulation.ts'

type Props = {
  sim: SimulationState
  caseRequest: CaseRequest | null
  onSimulate: () => void
}

/** Botón Simular, estado y selector de dirección del servidor CST, arriba de la vista previa. */
export function SimulateBar({ sim, caseRequest, onSimulate }: Props) {
  const { server } = sim
  const [editingServer, setEditingServer] = useState(false)
  const [draftUrl, setDraftUrl] = useState(sim.apiUrl)
  const [draftToken, setDraftToken] = useState(sim.apiToken)

  function openEditor() {
    setDraftUrl(sim.apiUrl)
    setDraftToken(sim.apiToken)
    setEditingServer(true)
  }

  function submitServer(e: FormEvent) {
    e.preventDefault()
    sim.setServerUrl(draftUrl, draftToken)
    setEditingServer(false)
  }

  const serverControl = editingServer ? (
    <form className="simulate__server-form" onSubmit={submitServer}>
      <input
        type="text"
        className="simulate__server-input"
        value={draftUrl}
        onChange={(e) => setDraftUrl(e.target.value)}
        placeholder="http://192.168.1.50:8000"
        aria-label="Dirección del servidor CST"
      />
      <input
        type="password"
        className="simulate__token-input"
        value={draftToken}
        onChange={(e) => setDraftToken(e.target.value)}
        placeholder="Token API (opcional)"
        aria-label="Token API (opcional)"
      />
      <button type="submit" className="button">
        Conectar
      </button>
      <button type="button" className="button" onClick={() => setEditingServer(false)}>
        Cancelar
      </button>
    </form>
  ) : (
    <button
      type="button"
      className="link-button simulate__server-toggle"
      title="Cambiar dirección del servidor CST"
      onClick={openEditor}
    >
      Servidor: {sim.apiUrl.replace(/^https?:\/\//i, '')}
      {sim.apiToken ? ' · con token' : ''}
    </button>
  )

  if (server.kind === 'idle') {
    return (
      <div className="simulate">
        {serverControl}
        <button type="button" className="button" onClick={sim.connect}>
          Conectar con el servidor
        </button>
      </div>
    )
  }

  const online = server.kind === 'online'
  const queueDepth = online ? (server.health.queue_depth ?? 0) : 0
  const needsToken = online && Boolean(server.health.auth_required) && !sim.apiToken
  const reason = !online
    ? 'Enciende el servidor para simular.'
    : needsToken
      ? 'Ingresa el token API en Servidor para simular.'
      : !caseRequest
        ? 'Corrige los campos marcados en rojo.'
        : undefined

  return (
    <div className="simulate">
      <span className={`simulate__status simulate__status--${server.kind}`} role="status">
        {server.kind === 'checking' && 'Buscando el servidor…'}
        {server.kind === 'offline' && 'Servidor apagado'}
        {online && (server.health.simulator === 'mock' ? 'Servidor listo · datos de prueba' : 'Servidor listo · CST')}
        {queueDepth > 0 && ` · ${queueDepth} en cola`}
      </span>
      {needsToken && !editingServer && (
        <button type="button" className="link-button simulate__auth-warn" onClick={openEditor}>
          Requiere token
        </button>
      )}
      {serverControl}
      <button
        type="button"
        className="button button--primary"
        disabled={!online || !caseRequest || sim.starting || needsToken}
        title={reason}
        onClick={onSimulate}
      >
        {sim.starting ? 'Enviando…' : 'Simular'}
      </button>
    </div>
  )
}
