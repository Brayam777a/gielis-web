import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { axisTicks, nearestIndex } from '../lib/simulation.ts'

export type Series = {
  label: string
  values: number[]
  /** Clase CSS del trazo: results-chart__line--s11, --s21 o --absorption. */
  tone: 's11' | 's21' | 'absorption'
}

export type Marker = { index: number; tone: Series['tone'] }

export type ReferenceLine = { label: string; frequency_ghz: number }

type Props = {
  title: string
  unit: string
  frequency: number[]
  series: Series[]
  /** Límites del eje vertical; si no se dan, se calculan con los datos. */
  domain?: [number, number]
  markers?: Marker[]
  references?: ReferenceLine[]
  /** Nombre sugerido al exportar la gráfica como SVG. */
  exportName?: string
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
export function ResultsChart({
  title,
  unit,
  frequency,
  series,
  domain,
  markers = [],
  references = [],
  exportName,
  hover,
  onHover,
}: Props) {
  const [ref, { width, height }] = useSize()
  const svgRef = useRef<SVGSVGElement | null>(null)

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
  const hoverX = hover !== null ? x(frequency[hover]) : 0
  const tipX = hoverX > M.left + plotW - 144 ? hoverX - 142 : hoverX + 8
  const tipW = 134
  const tipH = 12 + (1 + series.length) * 14

  function exportChartSvg() {
    if (!svgRef.current) return
    const clone = svgRef.current.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    const ns = 'http://www.w3.org/2000/svg'
    const style = document.createElementNS(ns, 'style')
    style.textContent = [
      '.results-chart__bg{fill:#163a2c}',
      '.results-chart__grid line{stroke:#e8e6d9;stroke-opacity:.14}',
      '.results-chart__labels text{fill:#e8e6d9;fill-opacity:.75;font-size:12px;font-family:system-ui,sans-serif}',
      '.results-chart__line{fill:none;stroke-width:2;stroke-linejoin:round}',
      '.results-chart__line--s11,.results-chart__line--absorption{stroke:#e0a06a}',
      '.results-chart__line--s21{stroke:#e8e6d9}',
      '.results-chart__marker{fill:#163a2c}',
      '.results-chart__ref line{stroke:#e8e6d9;stroke-opacity:.45;stroke-dasharray:4 4;stroke-width:1.25}',
      '.results-chart__ref text{fill:#e8e6d9;fill-opacity:.72;font-size:11px;font-family:system-ui,sans-serif}',
      '.results-chart__hover,.results-chart__tooltip{display:none}',
    ].join('')
    const bg = document.createElementNS(ns, 'rect')
    bg.setAttribute('x', '0')
    bg.setAttribute('y', '0')
    bg.setAttribute('width', String(width))
    bg.setAttribute('height', String(height))
    bg.setAttribute('class', 'results-chart__bg')
    clone.prepend(bg)
    clone.prepend(style)
    const filename = exportName ? (exportName.endsWith('.svg') ? exportName : `${exportName}.svg`) : 'gielis-grafica.svg'
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

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
          <button type="button" className="link-button results-chart__export" onClick={exportChartSvg}>
            Exportar SVG
          </button>
        </span>
      </figcaption>
      <div className="results-chart__plot" ref={ref}>
        {width > 0 && height > 0 && (
          <svg
            ref={svgRef}
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
            {references
              .filter((r) => r.frequency_ghz >= fMin && r.frequency_ghz <= fMax)
              .map((r) => (
                <g key={r.label} className="results-chart__ref" aria-hidden="true">
                  <line x1={x(r.frequency_ghz)} x2={x(r.frequency_ghz)} y1={M.top} y2={M.top + plotH} />
                  <text x={x(r.frequency_ghz) + 3} y={M.top + 11}>
                    {r.frequency_ghz}
                  </text>
                </g>
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
              <>
                <g className="results-chart__hover">
                  <line x1={hoverX} x2={hoverX} y1={M.top} y2={M.top + plotH} />
                  {series.map((s) => (
                    <circle key={s.label} cx={hoverX} cy={y(s.values[hover])} r={3.5} />
                  ))}
                </g>
                <g className="results-chart__tooltip" transform={`translate(${tipX}, ${M.top + 6})`} pointerEvents="none">
                  <rect width={tipW} height={tipH} rx={5} />
                  <text x={8} y={14} className="results-chart__tooltip-freq">
                    f = {frequency[hover].toLocaleString('es-CO', { maximumFractionDigits: 3 })} GHz
                  </text>
                  {series.map((s, idx) => (
                    <text key={s.label} x={8} y={28 + idx * 14}>
                      {s.label.split(' ')[0]} ={' '}
                      {s.values[hover].toLocaleString('es-CO', {
                        maximumFractionDigits: unit === '%' ? 1 : 2,
                      })}{' '}
                      {unit}
                    </text>
                  ))}
                </g>
              </>
            )}
          </svg>
        )}
      </div>
    </figure>
  )
}
