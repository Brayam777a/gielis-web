/**
 * Funciones puras para mostrar las simulaciones: textos de estado, comparar
 * casos, exportar a CSV y escoger las marcas de los ejes. No usan React, así
 * que se prueban con Vitest (simulation.test.ts).
 */
import type { JobStatus, SimulationResult } from './api.ts'

export const STATUS_LABEL: Record<JobStatus, string> = {
  queued: 'En cola',
  building: 'Construyendo',
  simulating: 'Simulando',
  done: 'Terminada',
  failed: 'Falló',
  cancelled: 'Cancelada',
}

export function isFinished(status: JobStatus): boolean {
  return status === 'done' || status === 'failed' || status === 'cancelled'
}

/** Compara dos valores JSON por contenido (sin importar el orden de las claves). */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every((k) => sameJson((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

/** Tabla de resultados en CSV (separada por comas, punto decimal), lista para Excel o MATLAB. */
export function resultToCsv(r: SimulationResult): string {
  const columns: [string, number[]][] = [['frecuencia_GHz', r.frequency_ghz]]
  if (r.s11_db) columns.push(['S11_dB', r.s11_db])
  if (r.s21_db) columns.push(['S21_dB', r.s21_db])
  if (r.absorption) columns.push(['absorcion', r.absorption])
  const lines = [columns.map(([name]) => name).join(',')]
  for (let i = 0; i < r.frequency_ghz.length; i++) {
    lines.push(columns.map(([, values]) => String(values[i])).join(','))
  }
  return lines.join('\n') + '\n'
}

/**
 * Marcas "redondas" para un eje entre `min` y `max` (1, 2 o 5 por una
 * potencia de 10), unas `target` marcas en total.
 */
export function axisTicks(min: number, max: number, target = 6): number[] {
  if (!(max > min)) return [min]
  const raw = (max - min) / target
  const power = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((k) => k * power).find((s) => s >= raw) ?? 10 * power
  const ticks: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) {
    ticks.push(Math.round(v / step) * step)
  }
  return ticks
}

/** Índice del valor de `xs` (ordenado) más cercano a `x`. */
export function nearestIndex(xs: number[], x: number): number {
  let lo = 0
  let hi = xs.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (xs[mid] < x) lo = mid
    else hi = mid
  }
  return Math.abs(xs[lo] - x) <= Math.abs(xs[hi] - x) ? lo : hi
}

/** "2026-11-06T20:15:03-05:00" → "6 nov, 20:15". */
export function shortTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
}
