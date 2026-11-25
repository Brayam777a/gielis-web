import { describe, expect, it } from 'vitest'
import { defaultApiUrl, getApiToken, getApiUrl, normalizeApiUrl, setApiToken, setApiUrl, type SimulationResult } from './api.ts'
import { getPublishedReferences } from './examples.ts'
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

  it('normaliza y recuerda la dirección del servidor CST', () => {
    expect(normalizeApiUrl('  192.168.1.50:8000///  ')).toBe('http://192.168.1.50:8000')
    expect(normalizeApiUrl('https://100.85.10.20:8000/')).toBe('https://100.85.10.20:8000')
    expect(normalizeApiUrl('   ')).toBe(defaultApiUrl())

    const saved = setApiUrl('100.85.10.20:8000/')
    expect(saved).toBe('http://100.85.10.20:8000')

    // En Node (sin window) devuelve el valor por defecto; con localStorage se conserva.
    const store = new Map<string, string>()
    const prevWindow = (globalThis as { window?: unknown }).window
    ;(globalThis as { window?: unknown }).window = {
      location: { protocol: 'http:', port: '5173', hostname: 'localhost', origin: 'http://localhost:5173' },
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v)
        },
        removeItem: (k: string) => {
          store.delete(k)
        },
      },
    }
    try {
      expect(setApiUrl('100.85.10.20:8000/')).toBe('http://100.85.10.20:8000')
      expect(getApiUrl()).toBe('http://100.85.10.20:8000')
      expect(setApiUrl('')).toBe('http://localhost:8000')
      expect(getApiUrl()).toBe('http://localhost:8000')
    } finally {
      if (prevWindow === undefined) delete (globalThis as { window?: unknown }).window
      else (globalThis as { window?: unknown }).window = prevWindow
    }
  })

  it('guarda y limpia el token API en sessionStorage', () => {
    expect(getApiToken()).toBe('')
    const session = new Map<string, string>()
    const prevWindow = (globalThis as { window?: unknown }).window
    ;(globalThis as { window?: unknown }).window = {
      sessionStorage: {
        getItem: (k: string) => session.get(k) ?? null,
        setItem: (k: string, v: string) => {
          session.set(k, v)
        },
        removeItem: (k: string) => {
          session.delete(k)
        },
      },
    }
    try {
      expect(setApiToken('  mi-token  ')).toBe('mi-token')
      expect(getApiToken()).toBe('mi-token')
      expect(setApiToken('')).toBe('')
      expect(getApiToken()).toBe('')
    } finally {
      if (prevWindow === undefined) delete (globalThis as { window?: unknown }).window
      else (globalThis as { window?: unknown }).window = prevWindow
    }
  })

  it('devuelve las referencias publicadas del artículo por modo y estructura', () => {
    expect(getPublishedReferences('absorber', 'normal').map((r) => r.frequency_ghz)).toEqual([2.435, 3.849])
    expect(getPublishedReferences('transmitter', 'normal').map((r) => r.frequency_ghz)).toEqual([3.114, 3.478, 5.403])
    expect(getPublishedReferences('transmitter', 'complementary').map((r) => r.frequency_ghz)).toEqual([3.513, 4.745])
    expect(getPublishedReferences('sensor', 'complementary').map((r) => r.frequency_ghz)).toEqual([4.171])
  })
})
