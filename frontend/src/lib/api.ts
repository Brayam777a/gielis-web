/**
 * Cómo el front habla con el servidor (backend/gielis_api/main.py).
 *
 * Todas las funciones devuelven promesas y lanzan `ApiError` con un mensaje
 * en español si algo sale mal, para mostrarlo tal cual en la pantalla.
 */
import type { CaseRequest } from './design.ts'
import type { Mode, StructureType } from './examples.ts'

const STORAGE_KEY = 'gielis.api_url'

export function isServedByBackend(): boolean {
  if (typeof window === 'undefined') return false
  const { protocol, port, hostname } = window.location
  return (
    protocol.startsWith('http') &&
    port !== '5173' &&
    port !== '4173' &&
    !hostname.endsWith('github.io')
  )
}

export function defaultApiUrl(): string {
  const envUrl = import.meta.env.VITE_API_URL as string | undefined
  if (envUrl && envUrl.trim()) return envUrl.trim().replace(/\/+$/, '')
  if (isServedByBackend()) return window.location.origin
  return 'http://localhost:8000'
}

export function normalizeApiUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '')
  if (!trimmed) return defaultApiUrl()
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
}

export function hasSavedApiUrl(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return Boolean(window.localStorage.getItem(STORAGE_KEY)?.trim())
  } catch {
    return false
  }
}

export function getApiUrl(): string {
  if (typeof window !== 'undefined') {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      if (saved && saved.trim()) return normalizeApiUrl(saved)
    } catch {
      // localStorage no disponible
    }
  }
  return defaultApiUrl()
}

/**
 * Dirección del servidor activa. Se puede cambiar desde la interfaz
 * (guardada en `localStorage`) o mediante `frontend/.env.local` (`VITE_API_URL`).
 */
export let API_URL: string = getApiUrl()

export function setApiUrl(raw: string): string {
  const normalized = normalizeApiUrl(raw)
  API_URL = normalized
  if (typeof window !== 'undefined') {
    try {
      if (normalized === defaultApiUrl()) {
        window.localStorage.removeItem(STORAGE_KEY)
      } else {
        window.localStorage.setItem(STORAGE_KEY, normalized)
      }
    } catch {
      // localStorage no disponible
    }
  }
  return normalized
}

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
  const baseUrl = getApiUrl()
  let response: Response
  try {
    response = await fetch(baseUrl + path, {
      ...init,
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    })
  } catch {
    // fetch solo falla así cuando no hay respuesta: servidor apagado o sin red.
    throw new NetworkError(`No hay conexión con el servidor (${baseUrl}).`)
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
