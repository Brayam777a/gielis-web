/**
 * Ayudas para las pruebas (no se usan en la página).
 * Leen los archivos del backend: los valores de referencia y los ejemplos.
 */
import { readFileSync } from 'node:fs'

const BACKEND = new URL('../../../backend/', import.meta.url)

export function readBackendJson(path: string) {
  return JSON.parse(readFileSync(new URL(path, BACKEND), 'utf8'))
}

export function readBackendText(path: string): string {
  return readFileSync(new URL(path, BACKEND), 'utf8')
}

/** Diferencia relativa entre dos números. */
export const rel = (got: number, expected: number) => Math.abs(got - expected) / Math.max(Math.abs(expected), 1e-15)
