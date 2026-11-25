import { useEffect, useRef, useState, type FormEvent } from 'react'
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
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!editingServer) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setEditingServer(false)
    }
    function onPointerDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setEditingServer(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [editingServer])

  function toggleEditor() {
    if (editingServer) {
      setEditingServer(false)
      return
    }
    setDraftUrl(sim.apiUrl)
    setDraftToken(sim.apiToken)
    setEditingServer(true)
  }

  function submitServer(e: FormEvent) {
    e.preventDefault()
    sim.setServerUrl(draftUrl, draftToken)
    setEditingServer(false)
  }

  const serverControl = (
    <div className="simulate__server-wrap" ref={wrapRef}>
      <button
        type="button"
        className="link-button simulate__server-toggle"
        aria-expanded={editingServer}
        title="Cambiar dirección del servidor CST"
        onClick={toggleEditor}
      >
        Servidor: {sim.apiUrl.replace(/^https?:\/\//i, '')}
        {sim.apiToken ? ' · con token' : ''}
      </button>
      {editingServer && (
        <form className="simulate__popover" onSubmit={submitServer} aria-label="Configurar servidor">
          <label className="simulate__popover-field">
            <span>Dirección del servidor</span>
            <input
              type="text"
              className="simulate__server-input"
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
              placeholder="http://192.168.1.50:8000"
              autoFocus
            />
          </label>
          <label className="simulate__popover-field">
            <span>Token API (opcional)</span>
            <input
              type="password"
              className="simulate__token-input"
              value={draftToken}
              onChange={(e) => setDraftToken(e.target.value)}
              placeholder="Solo si el servidor usa GIELIS_API_TOKEN"
            />
          </label>
          <p className="simulate__popover-hint">Ej.: http://100.x.y.z:8000 (Tailscale o LAN)</p>
          <div className="simulate__popover-actions">
            <button type="submit" className="button button--primary">
              Conectar
            </button>
            <button type="button" className="button" onClick={() => setEditingServer(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
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
        <button type="button" className="link-button simulate__auth-warn" onClick={toggleEditor}>
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
