/**
 * Hook de React con todo el estado de las simulaciones:
 *   - si el servidor está encendido (y reintenta cada 5 s si no),
 *   - el historial,
 *   - la simulación elegida, que se consulta cada 0.7 s hasta que termina,
 *   - las acciones: simular, cancelar, elegir del historial y conectar.
 *
 * Los componentes solo leen lo que devuelve y llaman a sus funciones.
 */
import { useCallback, useEffect, useState } from 'react'
import { api, NetworkError, type Health, type JobDetail, type JobSummary } from './api.ts'
import type { CaseRequest } from './design.ts'
import { isFinished } from './simulation.ts'

export type ServerState =
  | { kind: 'idle' } // no se ha intentado (página publicada: se conecta a pedido)
  | { kind: 'checking' }
  | { kind: 'online'; health: Health }
  | { kind: 'offline'; message: string }

/**
 * En tu PC (localhost) se busca el servidor apenas abre la página. En la
 * página publicada solo cuando alguien pulsa "Conectar": así el navegador no
 * le pide permisos de red local a quien solo quiere ver el diseño.
 */
export const AUTO_CONNECT =
  Boolean(import.meta.env.VITE_API_URL) || ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)

const RETRY_MS = 5000
const POLL_MS = 700

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function useSimulation() {
  const [server, setServer] = useState<ServerState>(AUTO_CONNECT ? { kind: 'checking' } : { kind: 'idle' })
  // Cada vez que este número cambia se vuelve a preguntar por el servidor.
  const [attempt, setAttempt] = useState(AUTO_CONNECT ? 1 : 0)
  const [history, setHistory] = useState<JobSummary[]>([])
  const [historyVersion, setHistoryVersion] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [job, setJob] = useState<JobDetail | null>(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const online = server.kind === 'online'

  // 1. ¿Está el servidor? Si no, se reintenta solo.
  useEffect(() => {
    if (attempt === 0) return
    let stop = false
    let timer: number | undefined
    api.health().then(
      (health) => {
        if (!stop) setServer({ kind: 'online', health })
      },
      (e: unknown) => {
        if (stop) return
        setServer({ kind: 'offline', message: messageOf(e) })
        timer = window.setTimeout(() => setAttempt((n) => n + 1), RETRY_MS)
      },
    )
    return () => {
      stop = true
      window.clearTimeout(timer)
    }
  }, [attempt])

  // 2. Historial: al conectar y cada vez que algo empieza o termina.
  useEffect(() => {
    if (!online) return
    let stop = false
    api.list().then(
      (list) => {
        if (!stop) setHistory(list)
      },
      () => {}, // si falla, se queda el historial anterior
    )
    return () => {
      stop = true
    }
  }, [online, historyVersion])

  // 3. La simulación elegida: se consulta hasta que termina.
  useEffect(() => {
    if (!selectedId || !online) return
    let stop = false
    let timer: number | undefined
    const poll = async () => {
      try {
        const detail = await api.get(selectedId)
        if (stop) return
        setJob(detail)
        setError(null)
        if (isFinished(detail.status)) {
          setHistoryVersion((v) => v + 1)
          return
        }
        timer = window.setTimeout(poll, POLL_MS)
      } catch (e) {
        if (stop) return
        if (e instanceof NetworkError) {
          // Se cayó el servidor: se vuelve a buscar y el sondeo sigue cuando vuelva.
          setServer({ kind: 'offline', message: messageOf(e) })
          timer = window.setTimeout(() => setAttempt((n) => n + 1), RETRY_MS)
          return
        }
        setError(messageOf(e))
      }
    }
    void poll()
    return () => {
      stop = true
      window.clearTimeout(timer)
    }
  }, [selectedId, online])

  const start = useCallback(async (c: CaseRequest) => {
    setStarting(true)
    setError(null)
    try {
      const summary = await api.start(c)
      setJob(null)
      setSelectedId(summary.id)
      setHistoryVersion((v) => v + 1)
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setStarting(false)
    }
  }, [])

  const cancel = useCallback(async (id: string) => {
    try {
      await api.cancel(id)
    } catch (e) {
      setError(messageOf(e))
    }
  }, [])

  const select = useCallback((id: string) => {
    setError(null)
    setJob(null)
    setSelectedId(id)
  }, [])

  const connect = useCallback(() => {
    setServer({ kind: 'checking' })
    setAttempt((n) => n + 1)
  }, [])

  // El historial se pide al empezar y al terminar; mientras tanto, la fila de
  // la simulación elegida toma el estado de la consulta más reciente.
  const liveHistory = job ? history.map((h) => (h.id === job.id ? { ...h, status: job.status } : h)) : history

  return {
    server,
    connect,
    history: liveHistory,
    selectedId,
    // Mientras llega la nueva, no se muestra la simulación anterior.
    job: job && job.id === selectedId ? job : null,
    select,
    start,
    cancel,
    starting,
    error,
  }
}

export type SimulationState = ReturnType<typeof useSimulation>
