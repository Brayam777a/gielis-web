import { useMemo } from 'react'
import type { Point } from '../lib/gielis.ts'

type Props = {
  /** Curva original de Gielis (8000 puntos). */
  curve: Point[]
  /** Envolvente radial: el contorno que irá a CST (720 puntos). */
  envelope: Point[]
  showCurve: boolean
}

/** Elige un paso de cuadrícula "redondo" (1, 2 o 5 × 10^k) para ~8 divisiones. */
function niceStep(span: number): number {
  const raw = span / 8
  const power = 10 ** Math.floor(Math.log10(raw))
  const unit = raw / power
  const nice = unit < 1.5 ? 1 : unit < 3.5 ? 2 : unit < 7.5 ? 5 : 10
  return nice * power
}

function toPath(points: Point[], close: boolean): string {
  if (points.length === 0) return ''
  const [x0, y0] = points[0]
  let d = `M${x0.toFixed(4)} ${y0.toFixed(4)}`
  for (let i = 1; i < points.length; i++) {
    d += `L${points[i][0].toFixed(4)} ${points[i][1].toFixed(4)}`
  }
  return close ? `${d}Z` : d
}

function formatMm(v: number): string {
  return Number(v.toPrecision(3)).toString()
}

/**
 * Dibuja la forma como se vería en la placa: fondo verde de máscara
 * antisoldante, el contorno en cobre y una cuadrícula en milímetros.
 *
 * En SVG el eje y crece hacia abajo; por eso el grupo de la geometría usa
 * scale(1, -1): así la figura queda con el eje y hacia arriba, como en MATLAB.
 */
export function BoardPreview({ curve, envelope, showCurve }: Props) {
  const view = useMemo(() => {
    let extent = 0
    for (const [x, y] of envelope) extent = Math.max(extent, Math.abs(x), Math.abs(y))
    if (showCurve) for (const [x, y] of curve) extent = Math.max(extent, Math.abs(x), Math.abs(y))
    extent = extent > 0 ? extent : 1

    const step = niceStep(extent * 2)
    const half = Math.ceil((extent * 1.08) / step) * step
    const lines: number[] = []
    for (let v = -half; v <= half + step / 2; v += step) lines.push(Number(v.toFixed(10)))

    return {
      half,
      step,
      lines,
      envelopePath: toPath(envelope, true),
      curvePath: toPath(curve, false),
    }
  }, [curve, envelope, showCurve])

  const { half, step, lines } = view
  const size = half * 2

  return (
    <figure className="board">
      <svg
        className="board__svg"
        viewBox={`${-half} ${-half} ${size} ${size}`}
        role="img"
        aria-label={`Contorno de la estructura; cada cuadro mide ${formatMm(step)} mm`}
      >
        <rect className="board__mask" x={-half} y={-half} width={size} height={size} />
        <g transform="scale(1,-1)">
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
          <path className="board__copper" d={view.envelopePath} vectorEffect="non-scaling-stroke" />
          {showCurve && (
            <path className="board__curve" d={view.curvePath} vectorEffect="non-scaling-stroke" />
          )}
        </g>
      </svg>
      <figcaption className="board__caption">
        <span className="board__legend board__legend--copper">Contorno que irá a CST</span>
        {showCurve && <span className="board__legend board__legend--curve">Curva original</span>}
        <span className="board__scale">Cada cuadro mide {formatMm(step)} mm</span>
      </figcaption>
    </figure>
  )
}
