import { describe, expect, it } from 'vitest'
import { parseCaseFile } from './caseFile.ts'
import { analyzeDesign, toInputs } from './design.ts'
import { EXAMPLES } from './examples.ts'
import { readBackendText } from './testing.ts'

const MODES = ['absorber', 'transmitter', 'sensor'] as const

describe('abrir los archivos del artículo (backend/examples)', () => {
  it('absorbente y sensor quedan igual que los ejemplos de la página', () => {
    for (const mode of ['absorber', 'sensor'] as const) {
      const r = parseCaseFile(readBackendText(`examples/${mode}_case_params.json`))
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.value.inputs).toEqual(toInputs(EXAMPLES[mode]))
    }
  })

  it('transmisor: conserva la tanδ del archivo (0.002) como material Personalizado y lo avisa', () => {
    const r = parseCaseFile(readBackendText('examples/transmitter_case_params.json'))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.inputs.dielectric).toBe('Custom_Er')
    expect(r.value.inputs.loss_tangent).toBe('0.002')
    expect(r.value.notes.length).toBe(2)
  })
})

describe('guardar y volver a abrir (formato de la página)', () => {
  for (const mode of MODES) {
    it(`${mode}: el caso queda idéntico`, () => {
      const inputs = { ...toInputs(EXAMPLES[mode]), monitor_fields: 'EH', monitor_freq_ghz: '3.5' }
      const first = analyzeDesign(inputs, mode, EXAMPLES[mode].structure).caseRequest
      const r = parseCaseFile(JSON.stringify(first))
      expect(r.ok).toBe(true)
      if (!r.ok) return
      const second = analyzeDesign(r.value.inputs, r.value.mode, r.value.structure).caseRequest
      expect(second).toEqual(first)
    })
  }
})

describe('archivos inválidos', () => {
  const bad: [string, RegExp][] = [
    ['no es json', /no es un JSON válido/],
    ['[1, 2]', /objeto JSON/],
    ['{"schema_version": "2.0"}', /no soportada/],
    ['{"x": 1}', /No se reconoce el formato/],
    ['{"schema_version": "1.0", "mode": "absorber", "structure_type": "normal", "gielis": {"a": 1}}', /concentric/],
  ]
  for (const [text, message] of bad) {
    it(text.slice(0, 30), () => {
      const r = parseCaseFile(text)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toMatch(message)
    })
  }
})
