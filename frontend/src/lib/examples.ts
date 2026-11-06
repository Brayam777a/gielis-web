import type { GielisParams } from './gielis.ts'

export type ExampleCase = {
  id: 'absorber' | 'transmitter' | 'sensor'
  name: string
  params: GielisParams
}

/** Parámetros de Gielis de los tres casos de backend/examples/*.json. */
export const EXAMPLES: ExampleCase[] = [
  {
    id: 'absorber',
    name: 'Absorbente',
    params: { a: 4, b: 3.6, m: 8, n1: 1.1, n2: 1.7, n3: 1.7 },
  },
  {
    id: 'transmitter',
    name: 'Transmisor',
    params: { a: 1, b: 1, m: 3.4, n1: 1, n2: -2, n3: 1 },
  },
  {
    id: 'sensor',
    name: 'Sensor',
    params: { a: 1.5, b: 1.5, m: 6, n1: 1.5, n2: 1.5, n3: 1.5 },
  },
]
