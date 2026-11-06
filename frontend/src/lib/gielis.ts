/**
 * Geometría de Gielis para la previsualización en el navegador.
 *
 * Es la misma lógica de GielisMetaCST.mlapp (y de backend/gielis_geometry),
 * escrita en TypeScript para que la curva se dibuje al instante, sin servidor.
 *
 *   1. generateCurve:   la súperfórmula con 8000 muestras.
 *   2. radialEnvelope:  la "envolvente radial" de 720 puntos, que es el
 *                       contorno que la app realmente envía a CST.
 *
 * El backend sigue siendo la referencia final: esto es para ver la forma
 * mientras se mueven los parámetros.
 */

export type GielisParams = {
  a: number
  b: number
  m: number
  n1: number
  n2: number
  n3: number
}

export type Point = [number, number]

export type GielisCurve = {
  /** Multiplicador del periodo: theta va de 0 a u·π. */
  u: number
  /** Puntos (x, y) de la curva original, en mm. */
  points: Point[]
  rhoMin: number
  rhoMax: number
}

export type ParamErrors = Partial<Record<keyof GielisParams, string>>

export const CURVE_SAMPLES = 8000
export const ENVELOPE_BINS = 720
export const ENVELOPE_SMOOTHING = 5

/**
 * Redondeo de MATLAB: los .5 se alejan del cero.
 * (Math.round de JavaScript lleva -2.5 a -2; MATLAB lo lleva a -3.)
 */
function matlabRound(v: number): number {
  return Math.sign(v) * Math.floor(Math.abs(v) + 0.5)
}

/**
 * Equivalente de rat(x) de MATLAB: aproxima x como fracción n/d
 * con fracciones continuas y tolerancia 1e-6·|x|.
 * Ejemplos: rat(3.4) = 17/5, rat(3.14159) = 355/113.
 */
export function matlabRat(x: number): [number, number] {
  if (!Number.isFinite(x)) throw new Error('m debe ser un número finito')
  if (x === 0) return [0, 1]
  const tol = 1e-6 * Math.abs(x)
  let lastN = 1
  let lastD = 0
  let n = matlabRound(x)
  let d = 1
  let frac = x - matlabRound(x)
  while (Math.abs(x - n / d) >= tol) {
    const flip = 1 / frac
    const step = matlabRound(flip)
    frac = flip - step
    ;[n, lastN] = [n * step + lastN, n]
    ;[d, lastD] = [d * step + lastD, d]
  }
  return d < 0 ? [-n, -d] : [n, d]
}

/**
 * Cuántas medias vueltas necesita theta para que la curva se cierre.
 * MATLAB: [n,d] = rat(m); si n es par o (a==b y n2==n3) → u = 2d; si no → u = 4d.
 */
export function periodMultiplier({ a, b, m, n2, n3 }: GielisParams): number {
  const [n, d] = matlabRat(m)
  return n % 2 === 0 || (a === b && n2 === n3) ? 2 * d : 4 * d
}

/** Reglas de validación del formulario (las mismas que revisa la app). */
export function validateParams(p: GielisParams): ParamErrors {
  const errors: ParamErrors = {}
  for (const key of ['a', 'b', 'm', 'n1', 'n2', 'n3'] as const) {
    if (!Number.isFinite(p[key])) errors[key] = 'Escribe un número.'
  }
  if (!errors.a && p.a === 0) errors.a = 'a debe ser distinto de cero.'
  if (!errors.b && p.b === 0) errors.b = 'b debe ser distinto de cero.'
  if (!errors.n1 && p.n1 === 0) errors.n1 = 'n1 debe ser distinto de cero.'
  if (!errors.m) {
    if (p.m <= 0) errors.m = 'm debe ser mayor que cero.'
    else if (Math.abs(p.m * 100 - Math.round(p.m * 100)) > 1e-9)
      errors.m = 'm admite hasta 2 decimales.'
  }
  return errors
}

/**
 * La súperfórmula de Gielis en polares:
 *   ρ(θ) = ( |cos(mθ/4)/a|^n2 + |sin(mθ/4)/b|^n3 )^(-1/n1)
 * con θ en [0, u·π] y 8000 muestras, igual que la app.
 */
export function generateCurve(p: GielisParams, samples = CURVE_SAMPLES): GielisCurve {
  const u = periodMultiplier(p)
  const thetaMax = u * Math.PI
  const points: Point[] = new Array(samples)
  let rhoMin = Infinity
  let rhoMax = -Infinity

  for (let i = 0; i < samples; i++) {
    // Igual que linspace(0, u*pi, samples): el último punto es exactamente u·π.
    const theta = i === samples - 1 ? thetaMax : (i * thetaMax) / (samples - 1)
    const t = (p.m * theta) / 4
    const rho =
      (Math.abs(Math.cos(t) / p.a) ** p.n2 + Math.abs(Math.sin(t) / p.b) ** p.n3) **
      (-1 / p.n1)
    if (!Number.isFinite(rho)) {
      throw new Error('Estos parámetros generan una curva inválida (ρ no es finito).')
    }
    rhoMin = Math.min(rhoMin, rho)
    rhoMax = Math.max(rhoMax, rho)
    points[i] = [rho * Math.cos(theta), rho * Math.sin(theta)]
  }
  return { u, points, rhoMin, rhoMax }
}

/** Busca el primer índice cuyo valor es mayor que x (como searchsorted 'right'). */
function upperBound(sorted: number[], x: number): number {
  let lo = 0
  let hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sorted[mid] <= x) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** Interpolación lineal tipo np.interp (xs ordenado de menor a mayor). */
function interp(x: number, xs: number[], ys: number[]): number {
  const j = upperBound(xs, x)
  if (j === 0) return ys[0]
  if (j >= xs.length) return ys[xs.length - 1]
  const x0 = xs[j - 1]
  const x1 = xs[j]
  return ys[j - 1] + ((ys[j] - ys[j - 1]) * (x - x0)) / (x1 - x0)
}

/**
 * Envolvente radial exterior, como getRadialOuterEnvelope de la app:
 *   1. Divide el círculo en 720 sectores y guarda el radio máximo de cada uno.
 *   2. Rellena los sectores vacíos interpolando de forma circular.
 *   3. Suaviza con un promedio móvil circular de 5 sectores.
 * El resultado es un polígono simple (sin cruces) que CST sí puede extruir.
 */
export function radialEnvelope(
  points: Point[],
  bins = ENVELOPE_BINS,
  smoothing = ENVELOPE_SMOOTHING,
): Point[] {
  const TWO_PI = 2 * Math.PI
  const edges = Array.from({ length: bins + 1 }, (_, k) =>
    k === bins ? TWO_PI : (k * TWO_PI) / bins,
  )

  // 1. Radio máximo por sector.
  const rMax: number[] = new Array(bins).fill(NaN)
  for (const [x, y] of points) {
    let phi = Math.atan2(y, x)
    if (phi < 0) phi += TWO_PI
    let k = upperBound(edges, phi) - 1
    if (phi === TWO_PI) k = bins - 1
    if (k < 0 || k >= bins) continue
    const r = Math.hypot(x, y)
    if (Number.isNaN(rMax[k]) || r > rMax[k]) rMax[k] = r
  }

  // 2. Rellenar sectores vacíos (se repiten los datos a ambos lados del círculo).
  const valid = rMax.flatMap((r, k) => (Number.isNaN(r) ? [] : [k]))
  if (valid.length < 3) throw new Error('La curva no cubre suficientes direcciones.')
  const xs = [...valid.map((k) => k - bins), ...valid, ...valid.map((k) => k + bins)]
  const ys = [...valid, ...valid, ...valid].map((k) => rMax[k])
  const filled = rMax.map((r, k) => (Number.isNaN(r) ? interp(k, xs, ys) : r))

  // 3. Promedio móvil circular.
  const w = smoothing % 2 === 0 ? smoothing + 1 : smoothing
  const half = Math.floor(w / 2)
  const smooth = filled.map((_, k) => {
    let sum = 0
    for (let j = -half; j <= half; j++) sum += filled[(k + j + bins) % bins]
    return sum / w
  })

  return smooth.map((r, k) => {
    const theta = (k * TWO_PI) / bins
    return [r * Math.cos(theta), r * Math.sin(theta)]
  })
}

/** Área de un polígono con la fórmula del zapato (shoelace), en mm². */
export function polygonArea(points: Point[]): number {
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[(i + 1) % points.length]
    sum += x0 * y1 - x1 * y0
  }
  return Math.abs(sum) / 2
}
