import { describe, expect, it } from 'vitest'
import { analyzeDesign, fitToSubstrate, toInputs } from './design.ts'
import { EXAMPLES } from './examples.ts'
import { readBackendJson, rel } from './testing.ts'

const golden = readBackendJson('golden/golden_cases.json')
const MODES = ['absorber', 'transmitter', 'sensor'] as const

describe('analyzeDesign con los casos del artículo', () => {
  it('área de cobre igual a la de Python', () => {
    const s = golden.cases.sensor.sensor
    const expected = {
      absorber: golden.cases.absorber.normal.total_area_mm2,
      transmitter: golden.cases.transmitter.complementary.remaining_area_mm2,
      sensor: 20 * 13 - s.ring1_slot_area_mm2 - s.ring2_slot_area_mm2,
    }
    const structures = { absorber: 'normal', transmitter: 'complementary', sensor: 'complementary' } as const
    for (const mode of MODES) {
      const a = analyzeDesign(toInputs(EXAMPLES[mode]), mode, structures[mode])
      expect(rel(a.structure!.copperArea, expected[mode])).toBeLessThan(1e-7)
    }
  })

  it('el JSON del caso tiene los valores de backend/examples', () => {
    for (const mode of MODES) {
      const j = readBackendJson(`examples/${mode}_case_params.json`)
      const c = analyzeDesign(toInputs(EXAMPLES[mode]), mode, EXAMPLES[mode].structure).caseRequest!
      expect(c.gielis).toEqual(j.gielis_parameters)
      expect(c.substrate.width_mm).toBe(j.substrate.width_mm)
      expect(c.substrate.length_mm).toBe(j.substrate.length_mm)
      expect(c.substrate.thickness_mm).toBe(j.substrate.thickness_mm)
      expect(c.substrate.eps_r).toBe(j.substrate.relative_permittivity)
      expect([c.frequency.min_ghz, c.frequency.max_ghz]).toEqual(j.simulation_setup.frequency_range_GHz)
      expect(c.transmission_line).toEqual(mode === 'sensor' ? { width_mm: 3 } : null)
    }
  })
})

describe('validación', () => {
  it('un error en frecuencias impide el JSON pero no el dibujo', () => {
    const a = analyzeDesign({ ...toInputs(EXAMPLES.absorber), f_max_ghz: '0.5' }, 'absorber', 'normal')
    expect(a.errors.f_max_ghz).toBeTruthy()
    expect(a.structure).not.toBeNull()
    expect(a.caseRequest).toBeNull()
  })

  it('un campo vacío no cuenta como cero', () => {
    const a = analyzeDesign({ ...toInputs(EXAMPLES.absorber), a: '' }, 'absorber', 'normal')
    expect(a.errors.a).toBe('Escribe un número.')
  })

  it('el monitor de campo debe estar dentro del barrido', () => {
    const base = { ...toInputs(EXAMPLES.absorber), monitor_fields: 'E' }
    expect(analyzeDesign({ ...base, monitor_freq_ghz: '9' }, 'absorber', 'normal').errors.monitor_freq_ghz).toBeTruthy()
    const ok = analyzeDesign({ ...base, monitor_freq_ghz: '2.4' }, 'absorber', 'normal')
    expect(ok.caseRequest!.field_monitors).toEqual({ fields: 'E', freq_ghz: 2.4 })
  })
})

describe('fitToSubstrate', () => {
  for (const mode of MODES) {
    it(`${mode}: el resonador queda dentro del sustrato con margen`, () => {
      const inputs = toInputs(EXAMPLES[mode])
      const before = analyzeDesign(inputs, mode, EXAMPLES[mode].structure)
      const fit = fitToSubstrate(inputs, before.envelope!)!
      const after = analyzeDesign({ ...inputs, ...fit }, mode, EXAMPLES[mode].structure)
      const W = Number(inputs.width_mm)
      const L = Number(inputs.length_mm)
      const m = Math.max(0.5, 0.05 * Math.min(W, L))
      expect(after.structure!.resonatorSize.width_mm).toBeLessThanOrEqual(W - 2 * m + 1e-6)
      expect(after.structure!.resonatorSize.height_mm).toBeLessThanOrEqual(L - 2 * m + 1e-6)
      expect(after.warnings).toEqual([])
    })
  }

  it('devuelve null si no hay forma de que quepa', () => {
    const inputs = { ...toInputs(EXAMPLES.absorber), dx_mm: '20' }
    const a = analyzeDesign(toInputs(EXAMPLES.absorber), 'absorber', 'normal')
    expect(fitToSubstrate(inputs, a.envelope!)).toBeNull()
  })
})
