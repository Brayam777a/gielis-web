/**
 * Cómo el front habla con el servidor (backend/gielis_api/main.py).
 *
 * Todas las funciones devuelven promesas y lanzan `ApiError` con un mensaje
 * en español si algo sale mal, para mostrarlo tal cual en la pantalla.
 */
import type { CaseRequest } from './design.ts'
import type { Mode, StructureType } from './examples.ts'

/**
 * Dirección del servidor. Por defecto el de tu PC; se cambia creando
 * `frontend/.env.local` con `VITE_API_URL=http://otra-direccion:8000`.
 */
export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

export type JobStatus = 'queued' | 'building' | 'simulating' | 'done' | 'failed' | 'cancelled'

export type Resonance = {
  frequency_ghz: number
  parameter: 'S11' | 'S21'
  kind: 'min' | 'max'
  value_db: number
  absorption_pct: number | null
}

export type SimulationResult = {
  simulator: 'mock' | 'cst'
  frequency_ghz: number[]
  s11_db: number[] | null
  s21_db: number[] | null
  /** Entre 0 y 1; null en el sensor. */
  absorption: number[] | null
  resonances: Resonance[]
  notes: string[]
}

export type JobSummary = {
  id: string
  created_at: string
  finished_at: string | null
  mode: Mode
  structure_type: StructureType
  status: JobStatus
  message: string
  /** 0 a 100 mientras simula; null cuando no se sabe. */
  progress: number | null
  error: string | null
  simulator: string
}

export type JobDetail = JobSummary & { case: CaseRequest; result: SimulationResult | null }

export type Health = { status: 'ok'; version: string; simulator: string }

export class ApiError extends Error {}

/** No hubo respuesta: el servidor está apagado o no se alcanza. */
export class NetworkError extends ApiError {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(API_URL + path, {
      ...init,
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    })
  } catch {
    // fetch solo falla así cuando no hay respuesta: servidor apagado o sin red.
    throw new NetworkError(`No hay conexión con el servidor (${API_URL}).`)
  }
  if (!response.ok) {
    throw new ApiError(await errorMessage(response))
  }
  return (await response.json()) as T
}

/** FastAPI manda el error en `detail`: un texto, o una lista si el JSON no es válido (422). */
async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown }
    if (typeof body.detail === 'string') return body.detail
    if (Array.isArray(body.detail)) {
      return body.detail
        .map((d: { loc?: unknown[]; msg?: string }) => `${(d.loc ?? []).slice(1).join('.')}: ${d.msg ?? ''}`)
        .join('; ')
    }
  } catch {
    // la respuesta no era JSON
  }
  return `El servidor respondió ${response.status}.`
}

export const api = {
  health: () => request<Health>('/api/health'),
  start: (c: CaseRequest) => request<JobSummary>('/api/simulations', { method: 'POST', body: JSON.stringify(c) }),
  list: () => request<JobSummary[]>('/api/simulations'),
  get: (id: string) => request<JobDetail>(`/api/simulations/${encodeURIComponent(id)}`),
  cancel: (id: string) => request<JobSummary>(`/api/simulations/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
}
