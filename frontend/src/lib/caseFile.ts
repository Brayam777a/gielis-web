/**
 * Abrir un caso guardado en JSON y convertirlo en los campos del formulario.
 *
 * Acepta dos formatos:
 *   1. El JSON que genera esta página (tiene "schema_version").
 *   2. Los archivos del artículo: backend/examples/*_case_params.json
 *      (tienen "gielis_parameters").
 *
 * Es una función pura: recibe texto y devuelve el caso o un error explicado.
 */
import { EXAMPLES, type Mode, type MonitorFields, type StructureType } from './examples.ts'
import type { Inputs } from './design.ts'
import { CONDUCTORS, DIELECTRICS, findDielectric } from './materials.ts'

export type LoadedCase = {
  mode: Mode
  structure: StructureType
  inputs: Inputs
  /** Cosas que conviene avisar (por ejemplo, un material que se cargó como Personalizado). */
  notes: string[]
}

export type LoadResult = { ok: true; value: LoadedCase } | { ok: false; error: string }

type Json = Record<string, unknown>

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Lee un número de un objeto; si falta o no es número, lanza un error con la ruta. */
function num(obj: Json, key: string, path: string): number {
  const v = obj[key]
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`Falta el número "${path}.${key}".`)
  return v
}

function obj(parent: Json, key: string, path = ''): Json {
  const v = parent[key]
  if (!isObject(v)) throw new Error(`Falta la sección "${path ? `${path}.` : ''}${key}".`)
  return v
}

/** Nombres de material que usan los archivos del artículo → id de la app. */
function dielectricFromName(name: string): string | undefined {
  const n = name.toLowerCase()
  if (n.includes('fr-4') || n.includes('fr4')) return 'FR4_lossy'
  if (n.includes('4003')) return 'Rogers_RO4003C'
  if (n.includes('5880')) return 'Rogers_RO5880'
  if (n.includes('alumina') || n.includes('alúmina')) return 'Alumina'
  return DIELECTRICS.find((d) => d.id.toLowerCase() === n)?.id
}

function conductorFromName(name: string): string | undefined {
  const n = name.toLowerCase()
  if (n.includes('pec')) return 'PEC'
  if (n.includes('copper') || n.includes('cobre')) return 'Copper (annealed)'
  return undefined
}

/**
 * Si εr y tanδ del archivo coinciden con un material predefinido, se usa ese
 * material. Si no, se carga como Personalizado para conservar los valores del
 * archivo, y se avisa.
 */
function resolveDielectric(id: string | undefined, epsR: number, tan: number, notes: string[]): string {
  const d = id ? findDielectric(id) : undefined
  if (d?.preset && d.preset.eps_r === epsR && d.preset.loss_tangent === tan) return d.id
  if (d?.preset) {
    notes.push(
      `El archivo dice ${d.name} con εr = ${epsR} y tanδ = ${tan}, pero ese material predefinido tiene εr = ${d.preset.eps_r} y tanδ = ${d.preset.loss_tangent}. Se cargó como Personalizado para conservar los valores del archivo.`,
    )
  } else if (!d) {
    notes.push('El material del sustrato no está en la lista: se cargó como Personalizado con su εr y tanδ.')
  }
  return 'Custom_Er'
}

function fromPageFormat(j: Json): LoadedCase {
  const notes: string[] = []
  const mode = j.mode
  if (mode !== 'absorber' && mode !== 'transmitter' && mode !== 'sensor') throw new Error('"mode" debe ser absorber, transmitter o sensor.')
  const structure = j.structure_type
  if (structure !== 'normal' && structure !== 'complementary') throw new Error('"structure_type" debe ser normal o complementary.')

  const g = obj(j, 'gielis')
  const c = obj(j, 'concentric')
  const s = obj(j, 'substrate')
  const m = obj(j, 'metal')
  const f = obj(j, 'frequency')
  const epsR = num(s, 'eps_r', 'substrate')
  const tan = num(s, 'loss_tangent', 'substrate')
  const dielectric = resolveDielectric(String(s.material ?? ''), epsR, tan, notes)
  const conductor = CONDUCTORS.some((x) => x.id === m.material) ? String(m.material) : undefined
  if (!conductor) throw new Error('"metal.material" debe ser "Copper (annealed)" o "PEC".')

  const line = j.transmission_line
  const monitors = j.field_monitors
  let monitorFields: MonitorFields = 'none'
  let monitorFreq = (num(f, 'min_ghz', 'frequency') + num(f, 'max_ghz', 'frequency')) / 2
  if (isObject(monitors)) {
    if (monitors.fields !== 'E' && monitors.fields !== 'EH') throw new Error('"field_monitors.fields" debe ser E o EH.')
    monitorFields = monitors.fields
    monitorFreq = num(monitors, 'freq_ghz', 'field_monitors')
  }

  const inputs = {
    a: num(g, 'a', 'gielis'),
    b: num(g, 'b', 'gielis'),
    m: num(g, 'm', 'gielis'),
    n1: num(g, 'n1', 'gielis'),
    n2: num(g, 'n2', 'gielis'),
    n3: num(g, 'n3', 'gielis'),
    gap_mm: num(c, 'gap_mm', 'concentric'),
    size1: num(c, 'size1', 'concentric'),
    size2: num(c, 'size2', 'concentric'),
    rotation_deg: num(c, 'rotation_deg', 'concentric'),
    dx_mm: num(c, 'dx_mm', 'concentric'),
    dy_mm: num(c, 'dy_mm', 'concentric'),
    dielectric,
    width_mm: num(s, 'width_mm', 'substrate'),
    length_mm: num(s, 'length_mm', 'substrate'),
    thickness_mm: num(s, 'thickness_mm', 'substrate'),
    eps_r: epsR,
    loss_tangent: tan,
    conductor,
    metal_thickness_mm: num(m, 'thickness_mm', 'metal'),
    f_min_ghz: num(f, 'min_ghz', 'frequency'),
    f_max_ghz: num(f, 'max_ghz', 'frequency'),
    monitor_fields: monitorFields,
    monitor_freq_ghz: monitorFreq,
    line_width_mm: isObject(line) ? num(line, 'width_mm', 'transmission_line') : EXAMPLES[mode].line_width_mm,
  }
  return { mode, structure, inputs: stringify(inputs), notes }
}

function fromArticleFormat(j: Json): LoadedCase {
  const notes: string[] = []
  const label = String(j.case ?? '').toLowerCase()
  const mode: Mode | undefined = label.includes('absorber')
    ? 'absorber'
    : label.includes('transmitter')
      ? 'transmitter'
      : label.includes('sensor')
        ? 'sensor'
        : undefined
  if (!mode) throw new Error('No se reconoce el modo: "case" debe decir Absorber, Transmitter o Sensor.')

  const g = obj(j, 'gielis_parameters')
  const c = obj(j, 'concentric_geometry')
  const s = obj(j, 'substrate')
  const m = obj(j, 'metal')
  const sim = obj(j, 'simulation_setup')

  // structure_type puede ser "Normal", "Complementary (locked…)" o una lista con los dos.
  const rawType = Array.isArray(c.structure_type) ? c.structure_type[0] : c.structure_type
  let structure: StructureType = String(rawType ?? '').toLowerCase().startsWith('compl') ? 'complementary' : 'normal'
  if (Array.isArray(c.structure_type) && c.structure_type.length > 1) {
    notes.push(`El archivo trae varias estructuras (${c.structure_type.join(', ')}); se cargó la primera.`)
  }
  if (mode === 'sensor') structure = 'complementary'

  const range = sim.frequency_range_GHz
  if (!Array.isArray(range) || range.length !== 2 || !range.every((v) => typeof v === 'number')) {
    throw new Error('Falta "simulation_setup.frequency_range_GHz" como [mínima, máxima].')
  }
  const [fMin, fMax] = range as [number, number]

  const epsR = num(s, 'relative_permittivity', 'substrate')
  const tan = num(s, 'loss_tangent', 'substrate')
  const dielectric = resolveDielectric(dielectricFromName(String(s.material ?? '')), epsR, tan, notes)
  const conductor = conductorFromName(String(m.material ?? ''))
  if (!conductor) throw new Error('No se reconoce "metal.material": debe ser cobre o PEC.')

  const line = j.transmission_line
  const inputs = {
    a: num(g, 'a', 'gielis_parameters'),
    b: num(g, 'b', 'gielis_parameters'),
    m: num(g, 'm', 'gielis_parameters'),
    n1: num(g, 'n1', 'gielis_parameters'),
    n2: num(g, 'n2', 'gielis_parameters'),
    n3: num(g, 'n3', 'gielis_parameters'),
    gap_mm: num(c, 'gap_mm', 'concentric_geometry'),
    size1: num(c, 'size_1', 'concentric_geometry'),
    size2: num(c, 'size_2', 'concentric_geometry'),
    rotation_deg: num(c, 'rotation_deg', 'concentric_geometry'),
    dx_mm: num(c, 'dx_mm', 'concentric_geometry'),
    dy_mm: num(c, 'dy_mm', 'concentric_geometry'),
    dielectric,
    width_mm: num(s, 'width_mm', 'substrate'),
    length_mm: num(s, 'length_mm', 'substrate'),
    thickness_mm: num(s, 'thickness_mm', 'substrate'),
    eps_r: epsR,
    loss_tangent: tan,
    conductor,
    metal_thickness_mm: num(m, 'thickness_mm', 'metal'),
    f_min_ghz: fMin,
    f_max_ghz: fMax,
    monitor_fields: 'none',
    monitor_freq_ghz: (fMin + fMax) / 2,
    line_width_mm: isObject(line)
      ? num(line, 'microstrip_width_mm', 'transmission_line')
      : EXAMPLES[mode].line_width_mm,
  }
  return { mode, structure, inputs: stringify(inputs), notes }
}

function stringify(values: Record<keyof Inputs, number | string>): Inputs {
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v)])) as Inputs
}

/** Convierte el texto de un archivo en un caso para el formulario. */
export function parseCaseFile(text: string): LoadResult {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false, error: 'El archivo no es un JSON válido.' }
  }
  if (!isObject(json)) return { ok: false, error: 'El archivo debe contener un objeto JSON.' }
  try {
    if ('schema_version' in json) {
      if (json.schema_version !== '1.0') {
        return { ok: false, error: `Versión de formato no soportada: ${String(json.schema_version)}. Esta página lee la 1.0.` }
      }
      return { ok: true, value: fromPageFormat(json) }
    }
    if ('gielis_parameters' in json) return { ok: true, value: fromArticleFormat(json) }
    return {
      ok: false,
      error: 'No se reconoce el formato: debe ser un caso guardado desde esta página o un archivo de examples/.',
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
