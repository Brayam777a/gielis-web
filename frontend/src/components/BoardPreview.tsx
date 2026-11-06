import { useMemo } from 'react'
import type { Point } from '../lib/gielis.ts'

/**
 * Una capa del dibujo. Cada capa puede tener varios contornos; con
 * fill-rule "evenodd", un contorno dentro de otro se ve como un hueco.
 * Así se dibuja un anillo (C1 con C2 adentro) o una placa con ranuras.
 */
export type Layer = {
  id: string
  kind: 'substrate' | 'copper' | 'curve'
  contours: Point[][]
  closed: boolean
}

export type LegendItem = { kind: Layer['kind']; label: string }

type Props = {
  layers: Layer[]
  legend: LegendItem[]
  /** Descripción para lectores de pantalla. */
  description: string
}

/** Elige un paso de cuadrícula "redondo" (1, 2 o 5 × 10^k) para ~8 divisiones. */
function niceStep(span: number): number {
  const raw = span / 8
  const power = 10 ** Math.floor(Math.log10(raw))
  const unit = raw / power
  const nice = unit < 1.5 ? 1 : unit < 3.5 ? 2 : unit < 7.5 ? 5 : 10
  return nice * power
}

/** Convierte contornos en el atributo "d" de un <path> de SVG. */
function toPath(contours: Point[][], close: boolean): string {
  let d = ''
  for (const points of contours) {
    if (points.length === 0) continue
    d += `M${points[0][0].toFixed(4)} ${points[0][1].toFixed(4)}`
    for (let i = 1; i < points.length; i++) {
      d += `L${points[i][0].toFixed(4)} ${points[i][1].toFixed(4)}`
    }
    if (close) d += 'Z'
  }
  return d
}

function formatMm(v: number): string {
  return Number(v.toPrecision(3)).toString()
}

/**
 * Dibuja la placa: fuera del sustrato, verde oscuro; el sustrato en verde;
 * el cobre encima; una cuadrícula en milímetros.
 *
 * En SVG el eje y crece hacia abajo; por eso el grupo de la geometría usa
 * scale(1, -1): así la figura queda con el eje y hacia arriba, como en MATLAB.
 */
export function BoardPreview({ layers, legend, description }: Props) {
  const view = useMemo(() => {
    let extent = 0
    for (const layer of layers)
      for (const c of layer.contours)
        for (const [x, y] of c) extent = Math.max(extent, Math.abs(x), Math.abs(y))
    extent = extent > 0 ? extent : 1

    const step = niceStep(extent * 2)
    const half = Math.ceil((extent * 1.08) / step) * step
    const lines: number[] = []
    for (let v = -half; v <= half + step / 2; v += step) lines.push(Number(v.toFixed(10)))

    const paths = layers.map((l) => ({ ...l, d: toPath(l.contours, l.closed) }))
    return { half, step, lines, paths }
  }, [layers])

  const { half, step, lines, paths } = view
  const size = half * 2

  return (
    <figure className="board">
      <svg
        className="board__svg"
        viewBox={`${-half} ${-half} ${size} ${size}`}
        role="img"
        aria-label={`${description}. Cada cuadro mide ${formatMm(step)} mm.`}
      >
        <rect className="board__outside" x={-half} y={-half} width={size} height={size} />
        <g transform="scale(1,-1)">
          {paths
            .filter((p) => p.kind === 'substrate')
            .map((p) => (
              <path key={p.id} className="board__substrate" d={p.d} />
            ))}
          {lines.map((v) => (
            <g key={v}>
              <line
                className={v === 0 ? 'board__axis' : 'board__grid'}
                x1={v}
                y1={-half}
                x2={v}
                y2={half}
                vectorEffect="non-scaling-stroke"
              />
              <line
                className={v === 0 ? 'board__axis' : 'board__grid'}
                x1={-half}
                y1={v}
                x2={half}
                y2={v}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ))}
          {paths
            .filter((p) => p.kind !== 'substrate')
            .map((p) => (
              <path
                key={p.id}
                className={p.kind === 'copper' ? 'board__copper' : 'board__curve'}
                d={p.d}
                vectorEffect="non-scaling-stroke"
              />
            ))}
        </g>
      </svg>
      <figcaption className="board__caption">
        {legend.map((item) => (
          <span key={item.label} className={`board__legend board__legend--${item.kind}`}>
            {item.label}
          </span>
        ))}
        <span className="board__scale">Cada cuadro mide {formatMm(step)} mm</span>
      </figcaption>
    </figure>
  )
}
