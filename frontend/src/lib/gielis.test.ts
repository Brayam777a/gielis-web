import { describe, expect, it } from 'vitest'
import {
  envelopeFidelity,
  generateCurve,
  matlabRat,
  periodMultiplier,
  polygonArea,
  radialEnvelope,
  radialEnvelopeDetail,
  validateParams,
} from './gielis.ts'
import { readBackendJson, rel } from './testing.ts'

const golden = readBackendJson('golden/golden_cases.json')
const CASES = ['absorber', 'transmitter', 'sensor'] as const

describe('matlabRat: igual que rat() de MATLAB', () => {
  const cases: [number, [number, number]][] = [
    [8, [8, 1]],
    [3.4, [17, 5]],
    [2.5, [5, 2]],
    [1 / 3, [1, 3]],
    // Fraction.limit_denominator() de Python daba 314159/100000.
    [3.14159, [355, 113]],
  ]
  for (const [m, expected] of cases) {
    it(`rat(${m}) = ${expected[0]}/${expected[1]}`, () => {
      expect(matlabRat(m)).toEqual(expected)
    })
  }

  it('periodo de θ con m = 3.14159 es 452π, como en MATLAB', () => {
    expect(periodMultiplier({ a: 2, b: 1, m: 3.14159, n1: 2, n2: 2, n3: 2 })).toBe(452)
  })
})

describe('validateParams', () => {
  it('rechaza a, b o n1 en cero y m con más de 2 decimales', () => {
    const e = validateParams({ a: 0, b: 1, m: 3.141, n1: 0, n2: 1, n3: 1 })
    expect(Object.keys(e).sort()).toEqual(['a', 'm', 'n1'])
  })

  it('acepta los tres casos del artículo', () => {
    for (const name of CASES) {
      expect(validateParams(golden.cases[name].gielis_parameters)).toEqual({})
    }
  })
})

describe('curva y envolvente contra los valores de referencia de Python', () => {
  for (const name of CASES) {
    it(name, () => {
      const g = golden.cases[name]
      const curve = generateCurve(g.gielis_parameters)
      expect(curve.points).toHaveLength(8000)
      expect(curve.u).toBe(g.curve.period_multiplier_u)
      expect(rel(curve.rhoMax, g.curve.rho_max)).toBeLessThan(1e-12)
      const envelope = radialEnvelope(curve.points)
      expect(envelope).toHaveLength(720)
      expect(rel(polygonArea(envelope), g.base_envelope.area_mm2)).toBeLessThan(1e-9)
    })
  }

  it('cada vértice va en el centro de su sector: el primero está en π/720', () => {
    const env = radialEnvelope(generateCurve({ a: 1, b: 1, m: 4, n1: 2, n2: 2, n3: 2 }).points)
    expect(Math.abs(Math.atan2(env[0][1], env[0][0]) - Math.PI / 720)).toBeLessThan(1e-12)
  })
})

describe('envelopeFidelity', () => {
  const fidelity = (name: (typeof CASES)[number]) => {
    const curve = generateCurve(golden.cases[name].gielis_parameters)
    return envelopeFidelity(curve.points, radialEnvelopeDetail(curve.points))
  }

  it('absorbente y sensor no tienen partes internas', () => {
    expect(fidelity('absorber').innerDirectionsPct).toBe(0)
    expect(fidelity('sensor').innerDirectionsPct).toBe(0)
  })

  it('el transmisor tiene partes internas que la envolvente no conserva', () => {
    const f = fidelity('transmitter')
    expect(f.innerDirectionsPct).toBeGreaterThan(90)
    expect(f.maxInnerDepthMm).toBeGreaterThan(0.5)
  })
})
