import type { ConcentricParams } from './concentric.ts'
import type { GielisParams } from './gielis.ts'

export type Mode = 'absorber' | 'transmitter' | 'sensor'
export type StructureType = 'normal' | 'complementary'

export type Substrate = { width_mm: number; length_mm: number }

export type ExampleCase = {
  mode: Mode
  structure: StructureType
  gielis: GielisParams
  concentric: ConcentricParams
  substrate: Substrate
}

export const MODE_NAMES: Record<Mode, string> = {
  absorber: 'Absorbente',
  transmitter: 'Transmisor',
  sensor: 'Sensor',
}

/** Valores de los tres casos del artículo (backend/examples/*.json). */
export const EXAMPLES: Record<Mode, ExampleCase> = {
  absorber: {
    mode: 'absorber',
    structure: 'normal',
    gielis: { a: 4, b: 3.6, m: 8, n1: 1.1, n2: 1.7, n3: 1.7 },
    concentric: { gap_mm: 1.6, size1: 1.5, size2: 1.0, rotation_deg: 0, dx_mm: 0, dy_mm: 0 },
    substrate: { width_mm: 30, length_mm: 30 },
  },
  transmitter: {
    mode: 'transmitter',
    structure: 'normal',
    gielis: { a: 1, b: 1, m: 3.4, n1: 1, n2: -2, n3: 1 },
    concentric: { gap_mm: 1, size1: 11.6, size2: 8.6, rotation_deg: 0, dx_mm: 0, dy_mm: 0 },
    substrate: { width_mm: 30, length_mm: 30 },
  },
  sensor: {
    mode: 'sensor',
    structure: 'complementary',
    gielis: { a: 1.5, b: 1.5, m: 6, n1: 1.5, n2: 1.5, n3: 1.5 },
    concentric: { gap_mm: 1, size1: 2.4, size2: 1.4, rotation_deg: 0, dx_mm: 0, dy_mm: 0 },
    // En el JSON del sensor: width_mm = 20 (eje x), length_mm = 13 (eje y).
    substrate: { width_mm: 20, length_mm: 13 },
  },
}
