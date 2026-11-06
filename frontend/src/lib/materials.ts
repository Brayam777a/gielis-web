/**
 * Materiales que ofrece la app de MATLAB (actualizarControlesMaterial y
 * setEnglishUILabels en GielisMetaCST.mlapp).
 *
 * Con un dieléctrico predefinido, la app fija εr y tanδ y no deja cambiarlos.
 * Solo "Personalizado" permite escribirlos.
 */

export type DielectricId = 'FR4_lossy' | 'Rogers_RO4003C' | 'Rogers_RO5880' | 'Alumina' | 'Custom_Er'
export type ConductorId = 'Copper (annealed)' | 'PEC'

export type Dielectric = {
  id: DielectricId
  name: string
  /** null = el usuario escribe los valores. */
  preset: { eps_r: number; loss_tangent: number } | null
}

export const DIELECTRICS: Dielectric[] = [
  { id: 'FR4_lossy', name: 'FR-4 con pérdidas', preset: { eps_r: 4.3, loss_tangent: 0.02 } },
  { id: 'Rogers_RO4003C', name: 'Rogers RO4003C', preset: { eps_r: 3.55, loss_tangent: 0.0027 } },
  { id: 'Rogers_RO5880', name: 'Rogers RO5880', preset: { eps_r: 2.2, loss_tangent: 0.0009 } },
  { id: 'Alumina', name: 'Alúmina', preset: { eps_r: 9.8, loss_tangent: 0.0001 } },
  { id: 'Custom_Er', name: 'Personalizado', preset: null },
]

export const CONDUCTORS: { id: ConductorId; name: string }[] = [
  { id: 'Copper (annealed)', name: 'Cobre recocido' },
  { id: 'PEC', name: 'PEC (conductor eléctrico perfecto)' },
]

export function findDielectric(id: string): Dielectric | undefined {
  return DIELECTRICS.find((d) => d.id === id)
}
