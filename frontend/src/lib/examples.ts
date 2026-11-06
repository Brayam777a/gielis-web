import type { ConcentricParams } from './concentric.ts'
import type { GielisParams } from './gielis.ts'
import type { ConductorId, DielectricId } from './materials.ts'

export type Mode = 'absorber' | 'transmitter' | 'sensor'
export type StructureType = 'normal' | 'complementary'

export type Substrate = {
  dielectric: DielectricId
  /** W, en el eje x. */
  width_mm: number
  /** L, en el eje y. */
  length_mm: number
  thickness_mm: number
  eps_r: number
  loss_tangent: number
}

export type Metal = { conductor: ConductorId; metal_thickness_mm: number }

export type Frequency = { f_min_ghz: number; f_max_ghz: number }

export type ExampleCase = {
  mode: Mode
  structure: StructureType
  gielis: GielisParams
  concentric: ConcentricParams
  substrate: Substrate
  metal: Metal
  frequency: Frequency
  /** Ancho de la línea microstrip; solo se usa en el sensor. */
  line_width_mm: number
}

export const MODE_NAMES: Record<Mode, string> = {
  absorber: 'Absorbente',
  transmitter: 'Transmisor',
  sensor: 'Sensor',
}

/**
 * Valores de los tres casos del artículo (backend/examples/*.json).
 *
 * Nota: el JSON del transmisor dice tanδ = 0.002 para el RO4003C, pero la app
 * fija 0.0027 para ese material y no deja cambiarlo. Aquí seguimos a la app.
 */
export const EXAMPLES: Record<Mode, ExampleCase> = {
  absorber: {
    mode: 'absorber',
    structure: 'normal',
    gielis: { a: 4, b: 3.6, m: 8, n1: 1.1, n2: 1.7, n3: 1.7 },
    concentric: { gap_mm: 1.6, size1: 1.5, size2: 1.0, rotation_deg: 0, dx_mm: 0, dy_mm: 0 },
    substrate: { dielectric: 'FR4_lossy', width_mm: 30, length_mm: 30, thickness_mm: 1.6, eps_r: 4.3, loss_tangent: 0.02 },
    metal: { conductor: 'Copper (annealed)', metal_thickness_mm: 0.035 },
    frequency: { f_min_ghz: 1, f_max_ghz: 8 },
    line_width_mm: 3,
  },
  transmitter: {
    mode: 'transmitter',
    structure: 'normal',
    gielis: { a: 1, b: 1, m: 3.4, n1: 1, n2: -2, n3: 1 },
    concentric: { gap_mm: 1, size1: 11.6, size2: 8.6, rotation_deg: 0, dx_mm: 0, dy_mm: 0 },
    substrate: { dielectric: 'Rogers_RO4003C', width_mm: 30, length_mm: 30, thickness_mm: 1.524, eps_r: 3.55, loss_tangent: 0.0027 },
    metal: { conductor: 'PEC', metal_thickness_mm: 0.035 },
    frequency: { f_min_ghz: 1, f_max_ghz: 8 },
    line_width_mm: 3,
  },
  sensor: {
    mode: 'sensor',
    structure: 'complementary',
    gielis: { a: 1.5, b: 1.5, m: 6, n1: 1.5, n2: 1.5, n3: 1.5 },
    concentric: { gap_mm: 1, size1: 2.4, size2: 1.4, rotation_deg: 0, dx_mm: 0, dy_mm: 0 },
    // En el JSON del sensor: width_mm = 20 (eje x), length_mm = 13 (eje y).
    substrate: { dielectric: 'FR4_lossy', width_mm: 20, length_mm: 13, thickness_mm: 1.6, eps_r: 4.3, loss_tangent: 0.02 },
    metal: { conductor: 'Copper (annealed)', metal_thickness_mm: 0.035 },
    frequency: { f_min_ghz: 1, f_max_ghz: 8 },
    line_width_mm: 3,
  },
}
