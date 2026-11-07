import { useEffect, useState, type PointerEvent } from 'react'
import { axisTicks, nearestIndex } from '../lib/simulation.ts'

export type Series = {
  label: string
  values: number[]
  /** Clase CSS del trazo: results-chart__line--s11, --s21 o --absorption. */
  tone: 's11' | 's21' | 'absorption'
}

export type Marker = { index: number; tone: Series['tone'] }

type Props = {
  title: string
  unit: string
  frequency: number[]
  series: Series[]
  /** Límites del eje vertical; si no se dan, se calculan con los datos. */
  domain?: [number, number]
  markers?: Marker[]
  /** Punto bajo el mouse, compartido entre las gráficas. */
  hover: number | null
  onHover: (index: number | null) => void
}

const M = { top: 12, right: 40, bottom: 30, left: 44 }

/** Mide el tamaño real de un elemento para dibujar el SVG en píxeles (texto nítido). */
function useSize() {
  const [el, setEl] = useState<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ width: Math.round(width), height: Math.round(height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return [setEl, size] as const
}

/**
 * Gráfica de líneas contra la frecuencia, dibujada con SVG (sin librerías).
 * Al pasar el mouse marca la frecuencia más cercana en todas las gráficas.
 */
export function ResultsChart({ title, unit, frequency, series, domain, markers = [], hover, onHover }: Props) {
  const [ref, { width, height }] = useSize()

  const fMin = frequency[0]
  const fMax = frequency[frequency.length - 1]
  const all = series.flatMap((s) => s.values)
  const [yMin, yMax] = domain ?? [Math.floor(Math.min(...all) / 10) * 10, Math.max(0, Math.ceil(Math.max(...all)))]

  const plotW = Math.max(width - M.left - M.right, 1)
  const plotH = Math.max(height - M.top - M.bottom, 1)
  const x = (f: number) => M.left + ((f - fMin) / (fMax - fMin)) * plotW
  const y = (v: number) => M.top + ((yMax - Math.max(yMin, Math.min(yMax, v))) / (yMax - yMin)) * plotH

  const path = (values: number[]) =>
    values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(frequency[i]).toFixed(1)},${y(v).toFixed(1)}`).join('')

  function move(e: PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect()
    const f = fMin + ((e.clientX - box.left - M.left) / plotW) * (fMax - fMin)
    onHover(nearestIndex(frequency, f))
  }

  const xTicks = axisTicks(fMin, fMax, 8)
  const yTicks = axisTicks(yMin, yMax, 5)

  return (
    <figure className="results-chart">
      <figcaption className="results-chart__title">
        <span>
          {title} ({unit})
        </span>
        <span className="results-chart__legend">
          {series.map((s) => (
            <span key={s.label} className={`results-chart__key results-chart__key--${s.tone}`}>
              {s.label}
            </span>
          ))}
        </span>
      </figcaption>
      <div className="results-chart__plot" ref={ref}>
        {width > 0 && height > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={`${title}: ${series.map((s) => s.label).join(', ')} entre ${fMin} y ${fMax} GHz`}
            onPointerMove={move}
            onPointerLeave={() => onHover(null)}
          >
            <g className="results-chart__grid">
              {xTicks.map((t) => (
                <line key={`x${t}`} x1={x(t)} x2={x(t)} y1={M.top} y2={M.top + plotH} />
              ))}
              {yTicks.map((t) => (
                <line key={`y${t}`} x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} />
              ))}
            </g>
            <g className="results-chart__labels">
              {xTicks.map((t) => (
                <text key={`x${t}`} x={x(t)} y={height - 10} textAnchor="middle">
                  {t}
                </text>
              ))}
              {yTicks.map((t) => (
                <text key={`y${t}`} x={M.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle">
                  {t}
                </text>
              ))}
              <text x={M.left + plotW + 8} y={height - 10} className="results-chart__unit">
                GHz
              </text>
            </g>
            {series.map((s) => (
              <path key={s.label} d={path(s.values)} className={`results-chart__line results-chart__line--${s.tone}`} />
            ))}
            {markers.map((m) => {
              const s = series.find((ss) => ss.tone === m.tone)
              if (!s) return null
              return (
                <circle
                  key={`${m.tone}${m.index}`}
                  cx={x(frequency[m.index])}
                  cy={y(s.values[m.index])}
                  r={4}
                  className={`results-chart__marker results-chart__line--${m.tone}`}
                />
              )
            })}
            {hover !== null && (
              <g className="results-chart__hover">
                <line x1={x(frequency[hover])} x2={x(frequency[hover])} y1={M.top} y2={M.top + plotH} />
                {series.map((s) => (
                  <circle key={s.label} cx={x(frequency[hover])} cy={y(s.values[hover])} r={3.5} />
                ))}
              </g>
            )}
          </svg>
        )}
      </div>
    </figure>
  )
}
