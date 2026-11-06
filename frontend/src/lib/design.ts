/**
 * Todo el cálculo del diseño en una función pura: del texto de los campos a
 * la geometría lista para dibujar. No usa React, así que se puede leer y
 * probar por separado.
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
  generateCurve,
  polygonArea,
  radialEnvelope,
  validateParams,
  type GielisCurve,
  type GielisParams,
  type Point,
} from './gielis.ts'

export type FieldKey = keyof GielisParams | keyof ConcentricParams | 'width_mm' | 'length_mm'
export type Inputs = Record<FieldKey, string>

export type FieldConfig = {
  key: FieldKey
  label: string
  math?: boolean
  hint: string
  min: number
  max: number
  step: number
}

/** Los campos del formulario, agrupados como se muestran en pantalla. */
export const FIELD_GROUPS: { title: string; fields: FieldConfig[] }[] = [
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
    fields: [
      { key: 'width_mm', label: 'Ancho', hint: 'W, en el eje x, en mm', min: 1, max: 100, step: 0.5 },
      { key: 'length_mm', label: 'Largo', hint: 'L, en el eje y, en mm', min: 1, max: 100, step: 0.5 },
    ],
  },
]

/** Convierte un caso de ejemplo en el texto de los campos. */
export function toInputs(ex: ExampleCase): Inputs {
  const all = { ...ex.gielis, ...ex.concentric, ...ex.substrate }
  return Object.fromEntries(Object.entries(all).map(([k, v]) => [k, String(v)])) as Inputs
}

export type Structure = {
  rings: ConcentricResult
  /** Puentes del sensor (vacío en los otros modos). */
  bridges: Point[][]
  /** Rectángulo del sustrato, centrado en el origen. */
  substrate: Point[]
  copperArea: number
}

export type Analysis = {
  errors: Partial<Record<FieldKey, string>>
  curve: GielisCurve | null
  envelope: Point[] | null
  structure: Structure | null
  warnings: string[]
  /** Error que impide calcular (no es culpa de un campo en particular). */
  error: string | null
}

export function analyzeDesign(inputs: Inputs, mode: Mode, structureType: StructureType): Analysis {
  // Un campo vacío no es cero: se marca como "escribe un número".
  const num = (k: FieldKey) => (inputs[k].trim() === '' ? NaN : Number(inputs[k]))

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
  if (!(W > 0)) errors.width_mm = 'El ancho debe ser mayor que 0 mm.'
  if (!(L > 0)) errors.length_mm = 'El largo debe ser mayor que 0 mm.'

  const result: Analysis = { errors, curve: null, envelope: null, structure: null, warnings: [], error: null }

  // 1. Curva y envolvente: solo dependen de los 6 parámetros de Gielis.
  if (['a', 'b', 'm', 'n1', 'n2', 'n3'].some((k) => k in errors)) return result
  try {
    result.curve = generateCurve(gielis)
    result.envelope = radialEnvelope(result.curve.points)
  } catch (e) {
    result.error = (e as Error).message
    return result
  }

  // 2. Anillos y estructura: necesitan además los campos de anillos y sustrato.
  if (Object.keys(errors).length > 0) return result
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

    // Área de cobre: anillos en la normal; placa menos ranuras en la complementaria.
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

    result.structure = { rings, bridges, substrate, copperArea }
  } catch (e) {
    result.error = (e as Error).message
  }
  return result
}
