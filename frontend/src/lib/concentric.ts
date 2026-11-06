/**
 * Anillos concéntricos a partir del contorno de Gielis.
 *
 * Es la misma lógica de build_concentric, build_sensor_csrr y
 * sensor_centering_translation de backend/gielis_geometry/service.py
 * (que a su vez viene de GielisMetaCST.mlapp).
 *
 *   C1 ─┐ anillo 1 (exterior): entre C1 y C2, ancho = gap
 *   C2 ─┘
 *   C3 ─┐ anillo 2 (interior): entre C3 y C4, ancho = gap
 *   C4 ─┘
 */
import type { Point } from './gielis.ts'

export type ConcentricParams = {
  /** Escala del anillo exterior respecto al contorno base (sin unidades). */
  size1: number
  /** Escala del anillo interior (sin unidades). */
  size2: number
  /** Ancho de cada anillo, en mm. */
  gap_mm: number
  rotation_deg: number
  dx_mm: number
  dy_mm: number
}

export type ConcentricResult = {
  c1: Point[]
  c2: Point[]
  c3: Point[]
  c4: Point[]
  /** Valores que realmente se usaron (la función puede corregir size2 y gap). */
  effective: { size1: number; size2: number; gap_mm: number }
  warnings: string[]
}

const MIN_SCALE = 0.05
const OFFSET_FACTOR = 0.1
const STEP_SIZE = 0.1

export const scale = (c: Point[], s: number): Point[] => c.map(([x, y]) => [x * s, y * s])

export function rotate(c: Point[], deg: number): Point[] {
  const t = (deg * Math.PI) / 180
  const cos = Math.cos(t)
  const sin = Math.sin(t)
  return c.map(([x, y]) => [x * cos - y * sin, x * sin + y * cos])
}

export const translate = (c: Point[], dx: number, dy: number): Point[] =>
  c.map(([x, y]) => [x + dx, y + dy])

function bounds(contours: Point[][]) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const c of contours) {
    for (const [x, y] of c) {
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  return { minX, minY, maxX, maxY }
}

/** Errores de los campos de los anillos (antes de calcular). */
export function validateConcentric(p: ConcentricParams): Partial<Record<keyof ConcentricParams, string>> {
  const errors: Partial<Record<keyof ConcentricParams, string>> = {}
  for (const key of ['size1', 'size2', 'gap_mm', 'rotation_deg', 'dx_mm', 'dy_mm'] as const) {
    if (!Number.isFinite(p[key])) errors[key] = 'Escribe un número.'
  }
  if (!errors.gap_mm && p.gap_mm <= 0) errors.gap_mm = 'El gap debe ser mayor que 0 mm.'
  if (!errors.size1 && p.size1 <= MIN_SCALE) errors.size1 = `Debe ser mayor que ${MIN_SCALE}.`
  if (!errors.size2 && p.size2 <= MIN_SCALE) errors.size2 = `Debe ser mayor que ${MIN_SCALE}.`
  // Si size2 no cabe dentro del anillo 1, no es un error: buildConcentric lo
  // ajusta y lo avisa, igual que la app de MATLAB.
  return errors
}

/**
 * Construye C1–C4 escalando el contorno base. El "gap" es físico (mm), así que
 * se convierte a escala dividiendo por el radio máximo del contorno (rBase).
 *
 * Si el anillo 2 no cabe dentro del anillo 1, la app corrige el gap o size2 en
 * lugar de fallar. Aquí hacemos lo mismo, pero lo avisamos en `warnings`.
 */
export function buildConcentric(base: Point[], p: ConcentricParams): ConcentricResult {
  const rBase = Math.max(...base.map(([x, y]) => Math.hypot(x, y)))
  if (!Number.isFinite(rBase) || rBase <= 0) throw new Error('El contorno base no tiene un radio válido.')

  const warnings: string[] = []
  const size1 = p.size1
  let size2 = p.size2
  let g = p.gap_mm

  let scale1Inner = size1 - g / rBase
  if (scale1Inner <= MIN_SCALE) {
    throw new Error('El gap es demasiado grande para el anillo 1: reduce el gap o aumenta el tamaño 1.')
  }

  let interRingOffset = OFFSET_FACTOR * g
  let maxScale2Outer = scale1Inner - interRingOffset / rBase
  let minScale2Outer = MIN_SCALE + g / rBase

  if (maxScale2Outer <= minScale2Outer) {
    const gMax = ((size1 - 2 * MIN_SCALE) * rBase) / (2 + OFFSET_FACTOR)
    g = 0.98 * gMax
    warnings.push(`El gap se ajustó de ${p.gap_mm} a ${round(g)} mm para que quepan los dos anillos.`)
    interRingOffset = OFFSET_FACTOR * g
    scale1Inner = size1 - g / rBase
    maxScale2Outer = scale1Inner - interRingOffset / rBase
    minScale2Outer = MIN_SCALE + g / rBase
  }

  if (size2 < minScale2Outer) {
    size2 = Math.ceil(minScale2Outer / STEP_SIZE) * STEP_SIZE
    if (size2 > maxScale2Outer) size2 = minScale2Outer
  }
  if (size2 > maxScale2Outer) {
    size2 = Math.floor(maxScale2Outer / STEP_SIZE) * STEP_SIZE
    if (size2 < minScale2Outer) size2 = maxScale2Outer
  }
  if (size2 - g / rBase <= MIN_SCALE) size2 = minScale2Outer
  if (Math.abs(size2 - p.size2) > 1e-12) {
    warnings.push(`El tamaño 2 se ajustó de ${p.size2} a ${round(size2)} para que el anillo 2 quepa dentro del anillo 1.`)
  }

  const scales = [size1, size1 - g / rBase, size2, size2 - g / rBase]
  const [c1, c2, c3, c4] = scales.map((s) =>
    translate(rotate(scale(base, s), p.rotation_deg), p.dx_mm, p.dy_mm),
  )
  return { c1, c2, c3, c4, effective: { size1, size2, gap_mm: g }, warnings }
}

/**
 * En modo sensor la app centra la estructura en el origen y luego aplica dx/dy:
 * totalDx = -cx + dx, totalDy = -cy + dy.
 */
export function centerForSensor(r: ConcentricResult, dx: number, dy: number): ConcentricResult {
  const b = bounds([r.c1, r.c2, r.c3, r.c4])
  const tx = -(b.minX + b.maxX) / 2 + dx
  const ty = -(b.minY + b.maxY) / 2 + dy
  return {
    ...r,
    c1: translate(r.c1, tx, ty),
    c2: translate(r.c2, tx, ty),
    c3: translate(r.c3, tx, ty),
    c4: translate(r.c4, tx, ty),
  }
}

function nearestAngleIndex(theta: number[], target: number): number {
  let best = 0
  let bestDiff = Infinity
  theta.forEach((t, i) => {
    const d = Math.abs(Math.atan2(Math.sin(t - target), Math.cos(t - target)))
    if (d < bestDiff) {
      bestDiff = d
      best = i
    }
  })
  return best
}

/**
 * Puente del sensor (split): un rectángulo que cruza el anillo de lado a lado
 * en la dirección `targetAngle`. Donde está el puente, el cobre no se recorta,
 * y así el anillo queda "abierto", como un split-ring resonator.
 */
export function splitBridge(outer: Point[], inner: Point[], targetAngle: number, g: number): Point[] {
  const b = bounds([outer])
  const cx = (b.minX + b.maxX) / 2
  const cy = (b.minY + b.maxY) / 2

  const thetaOut = outer.map(([x, y]) => Math.atan2(y - cy, x - cx))
  const pOuter = outer[nearestAngleIndex(thetaOut, targetAngle)]
  const thetaTarget = Math.atan2(pOuter[1] - cy, pOuter[0] - cx)
  const thetaIn = inner.map(([x, y]) => Math.atan2(y - cy, x - cx))
  const pInner = inner[nearestAngleIndex(thetaIn, thetaTarget)]

  const rx = pOuter[0] - pInner[0]
  const ry = pOuter[1] - pInner[1]
  const radialLength = Math.hypot(rx, ry)
  if (radialLength <= 1e-9) throw new Error('No se pudo ubicar el puente del sensor.')

  const n: Point = [rx / radialLength, ry / radialLength]
  const t: Point = [-n[1], n[0]]
  const offset = Math.max(0.02, Math.min(0.1 * radialLength, 0.12 * g))
  const length = radialLength + 2 * offset
  const width = Math.min(Math.max(0.08, 0.35 * g, 0.35 * radialLength), 0.85 * radialLength)
  const center: Point = [(pOuter[0] + pInner[0]) / 2, (pOuter[1] + pInner[1]) / 2]

  const corner = (sw: number, sl: number): Point => [
    center[0] + sw * 0.5 * width * t[0] + sl * 0.5 * length * n[0],
    center[1] + sw * 0.5 * width * t[1] + sl * 0.5 * length * n[1],
  ]
  return [corner(1, 1), corner(-1, 1), corner(-1, -1), corner(1, -1)]
}

/**
 * Recorta un polígono con una ventana CONVEXA (algoritmo de Sutherland–Hodgman).
 * Lo usamos para saber cuánta área del anillo tapa cada puente del sensor.
 */
export function clipConvex(subject: Point[], window: Point[]): Point[] {
  let out = subject
  for (let i = 0; i < window.length && out.length > 0; i++) {
    const a = window[i]
    const b = window[(i + 1) % window.length]
    const side = (p: Point) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
    // El lado "de adentro" es donde está el siguiente vértice de la ventana.
    const inside = Math.sign(side(window[(i + 2) % window.length]))
    const input = out
    out = []
    for (let j = 0; j < input.length; j++) {
      const p = input[j]
      const q = input[(j + 1) % input.length]
      const sp = side(p) * inside
      const sq = side(q) * inside
      if (sp >= 0) out.push(p)
      if (sp >= 0 !== sq >= 0) {
        const t = sp / (sp - sq)
        out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])])
      }
    }
  }
  return out
}

/** ¿Toda la estructura cabe dentro del sustrato, con un margen? */
export function fitsInSubstrate(
  contours: Point[][],
  width_mm: number,
  length_mm: number,
  margin_mm = 0.1,
): boolean {
  const b = bounds(contours)
  return (
    b.minX >= -width_mm / 2 + margin_mm &&
    b.maxX <= width_mm / 2 - margin_mm &&
    b.minY >= -length_mm / 2 + margin_mm &&
    b.maxY <= length_mm / 2 - margin_mm
  )
}

function round(v: number): number {
  return Number(v.toFixed(3))
}
