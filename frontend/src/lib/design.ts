/**
 * Todo el cálculo del diseño en una función pura: del texto de los campos a
 * la geometría lista para dibujar y al JSON del caso. No usa React, así que se
 * puede leer y probar por separado.
 */
import {
  buildConcentric,
  centerForSensor,
  clipConvex,
  fitsInSubstrate,
  splitBridge,
  validateConcentric,
  type ConcentricParams,
  type ConcentricResult,
} from './concentric.ts'
import type { ExampleCase, Mode, StructureType } from './examples.ts'
import {
  envelopeFidelity,
  generateCurve,
  polygonArea,
  radialEnvelopeDetail,
  validateParams,
  type Fidelity,
  type GielisCurve,
  type GielisParams,
  type Point,
} from './gielis.ts'
import { CONDUCTORS, findDielectric, type ConductorId, type DielectricId } from './materials.ts'

type NumericKey =
  | keyof GielisParams
  | keyof ConcentricParams
  | 'width_mm'
  | 'length_mm'
  | 'thickness_mm'
  | 'eps_r'
  | 'loss_tangent'
  | 'metal_thickness_mm'
  | 'f_min_ghz'
  | 'f_max_ghz'
  | 'line_width_mm'

export type FieldKey = NumericKey | 'dielectric' | 'conductor'
export type Inputs = Record<FieldKey, string>

export type FieldConfig = {
  key: NumericKey
  label: string
  math?: boolean
  hint: string
  min: number
  max: number
  step: number
}

export type FieldGroup = {
  title: string
  /** Selector de material que va antes de los campos. */
  select?: 'dielectric' | 'conductor'
  /** Solo se muestra en modo sensor. */
  sensorOnly?: boolean
  fields: FieldConfig[]
}

/** Los campos del formulario, agrupados como se muestran en pantalla. */
export const FIELD_GROUPS: FieldGroup[] = [
  {
    title: 'Curva de Gielis',
    fields: [
      { key: 'a', label: 'a', math: true, hint: 'Escala en la dirección del coseno', min: 0.1, max: 10, step: 0.1 },
      { key: 'b', label: 'b', math: true, hint: 'Escala en la dirección del seno', min: 0.1, max: 10, step: 0.1 },
      { key: 'm', label: 'm', math: true, hint: 'Simetría: cuántos lóbulos tiene la forma', min: 0.01, max: 20, step: 0.01 },
      { key: 'n1', label: 'n1', math: true, hint: 'Forma general: picos agudos o redondeados', min: 0.1, max: 20, step: 0.1 },
      { key: 'n2', label: 'n2', math: true, hint: 'Forma del término del coseno', min: -10, max: 20, step: 0.1 },
      { key: 'n3', label: 'n3', math: true, hint: 'Forma del término del seno', min: -10, max: 20, step: 0.1 },
    ],
  },
  {
    title: 'Anillos concéntricos',
    fields: [
      { key: 'gap_mm', label: 'Gap', hint: 'Ancho de cada anillo, en mm', min: 0.05, max: 5, step: 0.05 },
      { key: 'size1', label: 'Tamaño 1', hint: 'Escala del anillo exterior', min: 0.1, max: 20, step: 0.1 },
      { key: 'size2', label: 'Tamaño 2', hint: 'Escala del anillo interior', min: 0.1, max: 20, step: 0.1 },
      { key: 'rotation_deg', label: 'Rotación', hint: 'Giro de la estructura, en grados', min: -180, max: 180, step: 1 },
      { key: 'dx_mm', label: 'dx', hint: 'Desplazamiento horizontal, en mm', min: -15, max: 15, step: 0.1 },
      { key: 'dy_mm', label: 'dy', hint: 'Desplazamiento vertical, en mm', min: -15, max: 15, step: 0.1 },
    ],
  },
  {
    title: 'Sustrato',
    select: 'dielectric',
    fields: [
      { key: 'width_mm', label: 'Ancho', hint: 'W, en el eje x, en mm', min: 1, max: 100, step: 0.5 },
      { key: 'length_mm', label: 'Largo', hint: 'L, en el eje y, en mm', min: 1, max: 100, step: 0.5 },
      { key: 'thickness_mm', label: 'Espesor', hint: 'h, en mm', min: 0.1, max: 10, step: 0.001 },
      { key: 'eps_r', label: 'εr', math: true, hint: 'Permitividad relativa', min: 1, max: 15, step: 0.01 },
      { key: 'loss_tangent', label: 'tanδ', math: true, hint: 'Tangente de pérdidas', min: 0, max: 0.2, step: 0.0001 },
    ],
  },
  {
    title: 'Metal',
    select: 'conductor',
    fields: [
      { key: 'metal_thickness_mm', label: 'Espesor', hint: 'Del cobre o PEC, en mm', min: 0.001, max: 0.2, step: 0.001 },
    ],
  },
  {
    title: 'Línea microstrip',
    sensorOnly: true,
    fields: [
      { key: 'line_width_mm', label: 'Ancho', hint: 'De la línea en la cara superior, en mm', min: 0.1, max: 10, step: 0.1 },
    ],
  },
  {
    title: 'Frecuencias',
    fields: [
      { key: 'f_min_ghz', label: 'Mínima', hint: 'Inicio del barrido, en GHz', min: 0.1, max: 50, step: 0.1 },
      { key: 'f_max_ghz', label: 'Máxima', hint: 'Fin del barrido, en GHz', min: 0.1, max: 50, step: 0.1 },
    ],
  },
]

/** Convierte un caso de ejemplo en el texto de los campos. */
export function toInputs(ex: ExampleCase): Inputs {
  const all = {
    ...ex.gielis,
    ...ex.concentric,
    ...ex.substrate,
    ...ex.metal,
    ...ex.frequency,
    line_width_mm: ex.line_width_mm,
  }
  return Object.fromEntries(Object.entries(all).map(([k, v]) => [k, String(v)])) as Inputs
}

/**
 * El caso completo, listo para enviarlo al backend cuando exista.
 * Los nombres son los mismos que usa el código de Python, con la unidad
 * en el nombre.
 */
export type CaseRequest = {
  schema_version: '1.0'
  mode: Mode
  structure_type: StructureType
  gielis: GielisParams
  concentric: ConcentricParams
  substrate: {
    material: DielectricId
    width_mm: number
    length_mm: number
    thickness_mm: number
    eps_r: number
    loss_tangent: number
  }
  metal: { material: ConductorId; thickness_mm: number }
  transmission_line: { width_mm: number } | null
  frequency: { min_ghz: number; max_ghz: number }
}

export type Structure = {
  rings: ConcentricResult
  /** Puentes del sensor (vacío en los otros modos). */
  bridges: Point[][]
  /** Rectángulo del sustrato, centrado en el origen. */
  substrate: Point[]
  /** Línea microstrip del sensor (cara superior); null en los otros modos. */
  line: Point[] | null
  copperArea: number
}

export type Analysis = {
  errors: Partial<Record<FieldKey, string>>
  curve: GielisCurve | null
  envelope: Point[] | null
  /** Qué tanto de la curva original se pierde en el contorno que va a CST. */
  fidelity: Fidelity | null
  /** Avisos sobre la curva (partes internas, puntas redondeadas): valen en las dos vistas. */
  curveNotices: string[]
  structure: Structure | null
  /** Solo existe si no hay ningún error en el formulario. */
  caseRequest: CaseRequest | null
  warnings: string[]
  /** Error que impide calcular (no es culpa de un campo en particular). */
  error: string | null
}

const GIELIS_KEYS = ['a', 'b', 'm', 'n1', 'n2', 'n3'] as const
/** Campos que cambian la forma dibujada. Los demás no impiden dibujar. */
const GEOMETRY_KEYS: FieldKey[] = [
  ...GIELIS_KEYS,
  'gap_mm',
  'size1',
  'size2',
  'rotation_deg',
  'dx_mm',
  'dy_mm',
  'width_mm',
  'length_mm',
]

export function analyzeDesign(inputs: Inputs, mode: Mode, structureType: StructureType): Analysis {
  // Un campo vacío no es cero: se marca como "escribe un número".
  const num = (k: NumericKey) => (inputs[k].trim() === '' ? NaN : Number(inputs[k]))

  const gielis: GielisParams = { a: num('a'), b: num('b'), m: num('m'), n1: num('n1'), n2: num('n2'), n3: num('n3') }
  const ring: ConcentricParams = {
    gap_mm: num('gap_mm'),
    size1: num('size1'),
    size2: num('size2'),
    rotation_deg: num('rotation_deg'),
    dx_mm: num('dx_mm'),
    dy_mm: num('dy_mm'),
  }
  const W = num('width_mm')
  const L = num('length_mm')

  const errors: Analysis['errors'] = { ...validateParams(gielis), ...validateConcentric(ring) }
  const positive = (k: NumericKey, name: string) => {
    if (!(num(k) > 0)) errors[k] = Number.isNaN(num(k)) ? 'Escribe un número.' : `${name} debe ser mayor que 0.`
  }
  positive('width_mm', 'El ancho')
  positive('length_mm', 'El largo')
  positive('thickness_mm', 'El espesor')
  positive('metal_thickness_mm', 'El espesor')

  const dielectric = findDielectric(inputs.dielectric)
  if (!dielectric) errors.dielectric = 'Elige un material.'
  if (!CONDUCTORS.some((c) => c.id === inputs.conductor)) errors.conductor = 'Elige un material.'

  const epsR = num('eps_r')
  const tan = num('loss_tangent')
  if (Number.isNaN(epsR)) errors.eps_r = 'Escribe un número.'
  else if (epsR < 1) errors.eps_r = 'εr debe ser mayor o igual que 1.'
  if (Number.isNaN(tan)) errors.loss_tangent = 'Escribe un número.'
  else if (tan < 0 || tan > 0.2) errors.loss_tangent = 'tanδ debe estar entre 0 y 0.2.'

  const fMin = num('f_min_ghz')
  const fMax = num('f_max_ghz')
  positive('f_min_ghz', 'La frecuencia mínima')
  if (Number.isNaN(fMax)) errors.f_max_ghz = 'Escribe un número.'
  else if (!errors.f_min_ghz && !(fMax > fMin)) errors.f_max_ghz = 'La frecuencia máxima debe superar la mínima.'

  const lineWidth = num('line_width_mm')
  if (mode === 'sensor') {
    if (Number.isNaN(lineWidth)) errors.line_width_mm = 'Escribe un número.'
    else if (lineWidth < 0.1 || lineWidth > 10) errors.line_width_mm = 'El ancho debe estar entre 0.1 y 10 mm.'
  }

  const result: Analysis = {
    errors,
    curve: null,
    envelope: null,
    fidelity: null,
    curveNotices: [],
    structure: null,
    caseRequest: null,
    warnings: [],
    error: null,
  }

  // 1. Curva y envolvente: solo dependen de los 6 parámetros de Gielis.
  if (GIELIS_KEYS.some((k) => k in errors)) return result
  try {
    result.curve = generateCurve(gielis)
    const detail = radialEnvelopeDetail(result.curve.points)
    result.envelope = detail.points
    const f = envelopeFidelity(result.curve.points, detail)
    result.fidelity = f
    const fmt = (v: number) => Number(v.toPrecision(2)).toString()
    if (f.innerDirectionsPct > 0) {
      result.curveNotices.push(
        `La curva original tiene partes internas (lazos o pétalos que se cruzan) en el ${fmt(f.innerDirectionsPct)} % de las direcciones, hasta ${fmt(f.maxInnerDepthMm)} mm hacia adentro. Igual que la app de MATLAB, a CST solo va el contorno exterior en cobre: esas partes internas no se construyen.`,
      )
    }
    if (f.maxSmoothingMm > 0.02 * result.curve.rhoMax) {
      result.curveNotices.push(
        `El suavizado del contorno redondea las puntas hasta ${fmt(f.maxSmoothingMm)} mm: la forma en CST será más redondeada que la curva original.`,
      )
    }
  } catch (e) {
    result.error = (e as Error).message
    return result
  }

  // 2. Anillos y estructura: necesitan además los anillos y el tamaño del sustrato.
  if (GEOMETRY_KEYS.some((k) => k in errors)) return result
  try {
    let rings: ConcentricResult
    if (mode === 'sensor') {
      // La app centra el sensor y después aplica dx/dy.
      rings = buildConcentric(result.envelope, { ...ring, dx_mm: 0, dy_mm: 0 })
      rings = centerForSensor(rings, ring.dx_mm, ring.dy_mm)
    } else {
      rings = buildConcentric(result.envelope, ring)
    }
    result.warnings.push(...rings.warnings)

    const bridges =
      mode === 'sensor'
        ? [
            splitBridge(rings.c1, rings.c2, Math.PI / 2, ring.gap_mm),
            splitBridge(rings.c3, rings.c4, -Math.PI / 2, ring.gap_mm),
          ]
        : []

    const substrate: Point[] = [
      [-W / 2, -L / 2],
      [W / 2, -L / 2],
      [W / 2, L / 2],
      [-W / 2, L / 2],
    ]
    if (!fitsInSubstrate([rings.c1], W, L)) {
      result.warnings.push(
        mode === 'sensor'
          ? 'El resonador se sale del sustrato: la app no dejaría construirlo. Aumenta W o L, o reduce los tamaños.'
          : 'La estructura se sale de la celda: aumenta W o L, o reduce los tamaños.',
      )
    }

    // Línea del sensor: atraviesa todo el sustrato en x, centrada en y = 0 (como la app).
    let line: Point[] | null = null
    if (mode === 'sensor' && !errors.line_width_mm) {
      const h = lineWidth / 2
      line = [
        [-W / 2, -h],
        [W / 2, -h],
        [W / 2, h],
        [-W / 2, h],
      ]
      if (lineWidth >= L) result.warnings.push('La línea es más ancha que el sustrato: reduce su ancho o aumenta L.')
    }

    // Área de cobre del resonador: anillos en la normal; placa menos ranuras en la complementaria.
    const ring1 = polygonArea(rings.c1) - polygonArea(rings.c2)
    const ring2 = polygonArea(rings.c3) - polygonArea(rings.c4)
    let copperArea = ring1 + ring2
    if (structureType === 'complementary') {
      let slots = ring1 + ring2
      if (mode === 'sensor') {
        // Donde está el puente no hay ranura: se resta el área del anillo que cubre.
        const covered = (outer: Point[], inner: Point[], bridge: Point[]) =>
          polygonArea(clipConvex(outer, bridge)) - polygonArea(clipConvex(inner, bridge))
        slots -= covered(rings.c1, rings.c2, bridges[0]) + covered(rings.c3, rings.c4, bridges[1])
      }
      copperArea = W * L - slots
    }

    result.structure = { rings, bridges, substrate, line, copperArea }
  } catch (e) {
    result.error = (e as Error).message
    return result
  }

  // 3. El caso completo, solo si todo el formulario es válido.
  if (Object.keys(errors).length === 0 && dielectric) {
    result.caseRequest = {
      schema_version: '1.0',
      mode,
      structure_type: structureType,
      gielis,
      concentric: ring,
      substrate: {
        material: dielectric.id,
        width_mm: W,
        length_mm: L,
        thickness_mm: num('thickness_mm'),
        eps_r: epsR,
        loss_tangent: tan,
      },
      metal: { material: inputs.conductor as ConductorId, thickness_mm: num('metal_thickness_mm') },
      transmission_line: mode === 'sensor' ? { width_mm: lineWidth } : null,
      frequency: { min_ghz: fMin, max_ghz: fMax },
    }
  }
  return result
}
