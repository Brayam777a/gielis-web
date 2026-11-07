import { describe, expect, it } from 'vitest'
import type { SimulationResult } from './api.ts'
import { axisTicks, isFinished, nearestIndex, resultToCsv, sameJson } from './simulation.ts'

describe('simulation', () => {
  it('sabe qué estados ya no cambian', () => {
    expect(isFinished('done')).toBe(true)
    expect(isFinished('cancelled')).toBe(true)
    expect(isFinished('simulating')).toBe(false)
  })

  it('compara casos por contenido, no por el orden de las claves', () => {
    expect(sameJson({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 })).toBe(true)
    expect(sameJson({ a: 1 }, { a: 1.5 })).toBe(false)
    expect(sameJson({ a: null }, { a: {} })).toBe(false)
    expect(sameJson([1, 2], { 0: 1, 1: 2 })).toBe(false)
  })

  it('exporta solo las columnas que existen', () => {
    const r: SimulationResult = {
      simulator: 'mock',
      frequency_ghz: [1, 2],
      s11_db: [-1, -20],
      s21_db: null,
      absorption: [0.2, 0.99],
      resonances: [],
      notes: [],
    }
    expect(resultToCsv(r)).toBe('frecuencia_GHz,S11_dB,absorcion\n1,-1,0.2\n2,-20,0.99\n')
  })

  it('escoge marcas redondas para los ejes', () => {
    expect(axisTicks(1, 8)).toEqual([2, 4, 6, 8])
    expect(axisTicks(1, 8, 8)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(axisTicks(-47, 0, 5)).toEqual([-40, -30, -20, -10, 0])
    expect(axisTicks(0, 100, 4)).toEqual([0, 50, 100])
  })

  it('encuentra el punto más cercano', () => {
    const xs = [1, 2, 3, 4]
    expect(nearestIndex(xs, 0)).toBe(0)
    expect(nearestIndex(xs, 2.4)).toBe(1)
    expect(nearestIndex(xs, 2.6)).toBe(2)
    expect(nearestIndex(xs, 9)).toBe(3)
  })
})
