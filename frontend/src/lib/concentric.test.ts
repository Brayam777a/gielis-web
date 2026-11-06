import { describe, expect, it } from 'vitest'
import { buildConcentric, centerForSensor, clipConvex, splitBridge } from './concentric.ts'
import { generateCurve, polygonArea, radialEnvelope } from './gielis.ts'
import { readBackendJson, rel } from './testing.ts'

const golden = readBackendJson('golden/golden_cases.json')
const CASES = ['absorber', 'transmitter', 'sensor'] as const

function build(name: (typeof CASES)[number]) {
  const g = golden.cases[name]
  const cfg = readBackendJson(`examples/${name}_case_params.json`)
  const cg = cfg.concentric_geometry
  const envelope = radialEnvelope(generateCurve(g.gielis_parameters).points)
  const rings = buildConcentric(envelope, {
    size1: cg.size_1,
    size2: cg.size_2,
    gap_mm: cg.gap_mm,
    rotation_deg: cg.rotation_deg,
    dx_mm: cg.dx_mm,
    dy_mm: cg.dy_mm,
  })
  return { g, cfg, cg, envelope, rings }
}

describe('anillos C1–C4 contra los valores de referencia de Python', () => {
  for (const name of CASES) {
    it(name, () => {
      const { g, rings } = build(name)
      for (const k of ['c1', 'c2', 'c3', 'c4'] as const) {
        expect(rel(polygonArea(rings[k]), g.concentric[k].area_mm2)).toBeLessThan(1e-9)
      }
      expect(rings.warnings).toEqual([])
    })
  }

  it('anillos de la estructura normal (absorbente y transmisor)', () => {
    for (const name of ['absorber', 'transmitter'] as const) {
      const { g, rings } = build(name)
      expect(rel(polygonArea(rings.c1) - polygonArea(rings.c2), g.normal.ring1_area_mm2)).toBeLessThan(1e-9)
      expect(rel(polygonArea(rings.c3) - polygonArea(rings.c4), g.normal.ring2_area_mm2)).toBeLessThan(1e-9)
    }
  })

  it('placa complementaria del transmisor', () => {
    const { g, cfg, rings } = build('transmitter')
    const plate =
      cfg.substrate.width_mm * cfg.substrate.length_mm -
      (polygonArea(rings.c1) - polygonArea(rings.c2)) -
      (polygonArea(rings.c3) - polygonArea(rings.c4))
    expect(rel(plate, g.complementary.remaining_area_mm2)).toBeLessThan(1e-9)
  })

  it('sensor: centrado, puentes y ranuras', () => {
    const { g, cg, rings } = build('sensor')
    const before = rings.c1[0]
    const s = centerForSensor(rings, 0, 0)
    const [tx, ty] = [s.c1[0][0] - before[0], s.c1[0][1] - before[1]]
    expect(Math.abs(tx - g.sensor.centering_translation_mm[0])).toBeLessThan(1e-9)
    expect(Math.abs(ty - g.sensor.centering_translation_mm[1])).toBeLessThan(1e-9)

    const b1 = splitBridge(s.c1, s.c2, Math.PI / 2, cg.gap_mm)
    const b2 = splitBridge(s.c3, s.c4, -Math.PI / 2, cg.gap_mm)
    expect(rel(polygonArea(b1), g.sensor.bridge1_area_mm2)).toBeLessThan(1e-9)
    expect(rel(polygonArea(b2), g.sensor.bridge2_area_mm2)).toBeLessThan(1e-9)

    const covered = (o: typeof b1, i: typeof b1, b: typeof b1) =>
      polygonArea(clipConvex(o, b)) - polygonArea(clipConvex(i, b))
    const slot1 = polygonArea(s.c1) - polygonArea(s.c2) - covered(s.c1, s.c2, b1)
    const slot2 = polygonArea(s.c3) - polygonArea(s.c4) - covered(s.c3, s.c4, b2)
    expect(rel(slot1, g.sensor.ring1_slot_area_mm2)).toBeLessThan(1e-7)
    expect(rel(slot2, g.sensor.ring2_slot_area_mm2)).toBeLessThan(1e-7)
  })
})

describe('ajustes automáticos', () => {
  it('si el tamaño 2 no cabe, lo corrige y lo avisa', () => {
    const { envelope } = build('absorber')
    const r = buildConcentric(envelope, { size1: 1.5, size2: 1.6, gap_mm: 1.6, rotation_deg: 0, dx_mm: 0, dy_mm: 0 })
    expect(r.effective.size2).toBeLessThan(1.5)
    expect(r.warnings).toHaveLength(1)
  })

  it('si el gap es demasiado grande, da un error explicado', () => {
    const { envelope } = build('absorber')
    expect(() =>
      buildConcentric(envelope, { size1: 1.5, size2: 1, gap_mm: 20, rotation_deg: 0, dx_mm: 0, dy_mm: 0 }),
    ).toThrow(/gap/)
  })
})
