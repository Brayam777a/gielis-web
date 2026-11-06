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

export type EnvelopeDetail = {
  /** Los 720 vértices del contorno que va a CST. */
  points: Point[]
  /** Ángulo del centro de cada sector (rad). */
  angles: number[]
  /** Radio después de rellenar sectores vacíos (antes de suavizar). */
  filled: number[]
  /** Radio final, ya suavizado. */
  smooth: number[]
}

/**
 * Envolvente radial exterior, como getRadialOuterEnvelope de la app:
 *   1. Divide el círculo en 720 sectores y guarda el radio máximo de cada uno.
 *   2. Rellena los sectores vacíos interpolando de forma circular.
 *   3. Suaviza con un promedio móvil circular de 5 sectores.
 *   4. Pone cada vértice en el CENTRO de su sector (phiGrid en MATLAB).
 * El resultado es un polígono simple (sin cruces) que CST sí puede extruir.
 */
export function radialEnvelope(
  points: Point[],
  bins = ENVELOPE_BINS,
  smoothing = ENVELOPE_SMOOTHING,
): Point[] {
  return radialEnvelopeDetail(points, bins, smoothing).points
}

export function radialEnvelopeDetail(
  points: Point[],
  bins = ENVELOPE_BINS,
  smoothing = ENVELOPE_SMOOTHING,
): EnvelopeDetail {
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

  // 4. MATLAB: phiGrid = 0.5*(edges(1:end-1) + edges(2:end)), el centro de cada sector.
  //    Usar el borde del sector giraría todo el contorno medio sector (0.25°).
  const angles = smooth.map((_, k) => 0.5 * (edges[k] + edges[k + 1]))
  const envelope = smooth.map((r, k): Point => [r * Math.cos(angles[k]), r * Math.sin(angles[k])])
  return { points: envelope, angles, filled, smooth }
}

export type Fidelity = {
  /** Porcentaje de direcciones (sectores) donde la curva tiene partes internas. */
  innerDirectionsPct: number
  /** Cuánto se meten hacia adentro esas partes, como máximo (mm). */
  maxInnerDepthMm: number
  /** Cuánto cambia el radio por el suavizado, como máximo (mm). */
  maxSmoothingMm: number
}

/**
 * ¿Qué tanto de la curva original se pierde al pasar a la envolvente?
 *
 * La envolvente guarda UN radio por dirección (el más lejano). Si un rayo que
 * sale del centro corta la curva en varios radios distintos, la curva tiene
 * partes internas (lazos, pétalos que se cruzan) que CST no recibe.
 * Aquí se cuentan esos cortes en el centro de cada uno de los 720 sectores.
 */
export function envelopeFidelity(curve: Point[], detail: EnvelopeDetail): Fidelity {
  const n = detail.angles.length
  const step = (2 * Math.PI) / n
  const minR = new Array<number>(n).fill(Infinity)
  const maxR = new Array<number>(n).fill(-Infinity)

  for (let i = 0; i < curve.length; i++) {
    const p = curve[i]
    const q = curve[(i + 1) % curve.length]
    const a = Math.atan2(p[1], p[0])
    let d = Math.atan2(q[1], q[0]) - a
    if (d > Math.PI) d -= 2 * Math.PI
    if (d <= -Math.PI) d += 2 * Math.PI
    // Un tramo que pasa por el centro no tiene una dirección clara: se omite.
    if (Math.abs(d) < 1e-12 || Math.abs(d) > Math.PI - 1e-6) continue
    const lo = Math.min(a, a + d)
    const hi = Math.max(a, a + d)
    // Centros de sector c_k = (k + 0.5)·step dentro de [lo, hi).
    for (let k = Math.ceil(lo / step - 0.5); (k + 0.5) * step < hi; k++) {
      const c = (k + 0.5) * step
      const ux = Math.cos(c)
      const uy = Math.sin(c)
      // Corte del rayo con el tramo p→q.
      const den = (p[0] - q[0]) * uy - (p[1] - q[1]) * ux
      if (Math.abs(den) < 1e-15) continue
      const t = (p[0] * uy - p[1] * ux) / den
      if (t < 0 || t > 1) continue
      const r = (p[0] + t * (q[0] - p[0])) * ux + (p[1] + t * (q[1] - p[1])) * uy
      if (r <= 0) continue
      const kk = ((k % n) + n) % n
      minR[kk] = Math.min(minR[kk], r)
      maxR[kk] = Math.max(maxR[kk], r)
    }
  }

  const rOuter = Math.max(...detail.smooth)
  const tol = Math.max(1e-3, 0.005 * rOuter) // 0.5 % del radio, o 1 µm
  let inner = 0
  let maxDepth = 0
  for (let k = 0; k < n; k++) {
    if (!Number.isFinite(minR[k])) continue
    const depth = maxR[k] - minR[k]
    if (depth > tol) {
      inner++
      maxDepth = Math.max(maxDepth, depth)
    }
  }
  let maxSmoothing = 0
  for (let k = 0; k < n; k++) {
    maxSmoothing = Math.max(maxSmoothing, Math.abs(detail.smooth[k] - detail.filled[k]))
  }
  return { innerDirectionsPct: (100 * inner) / n, maxInnerDepthMm: maxDepth, maxSmoothingMm: maxSmoothing }
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
