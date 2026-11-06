import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { Point } from '../lib/gielis.ts'

/**
 * Una capa del dibujo. Cada capa puede tener varios contornos; con
 * fill-rule "evenodd", un contorno dentro de otro se ve como un hueco.
 * Así se dibuja un anillo (C1 con C2 adentro) o una placa con ranuras.
 */
export type Layer = {
  id: string
  /** trace = cobre de la cara superior (la línea del sensor), dibujado translúcido. */
  kind: 'substrate' | 'copper' | 'trace' | 'curve'
  contours: Point[][]
  closed: boolean
}

export type LegendItem = { kind: Layer['kind']; label: string }

type Props = {
  layers: Layer[]
  legend: LegendItem[]
  /** Descripción para lectores de pantalla. */
  description: string
  /** Sustrato (W × L, en mm): la vista se encuadra a él y se dibujan sus cotas. */
  frame?: { width: number; length: number }
  /** Si está, la figura se puede tomar con el mouse (o mover con las flechas). */
  onMove?: {
    /** Al empezar a arrastrar. */
    start: () => void
    /** Desplazamiento total desde que empezó el arrastre, en mm. */
    drag: (dxMm: number, dyMm: number) => void
    /** Un empujón con las flechas del teclado, en mm. */
    nudge: (dxMm: number, dyMm: number) => void
  }
}

type View = { halfX: number; halfY: number; step: number }

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
  return Number(v.toPrecision(3)).toLocaleString('es-CO')
}

/** Cuánto encuadre se necesita para que todo quepa (y, si hay sustrato, sus cotas). */
function computeView(layers: Layer[], frame: Props['frame']): View {
  let ex = 0
  let ey = 0
  for (const layer of layers)
    for (const c of layer.contours)
      for (const [x, y] of c) {
        ex = Math.max(ex, Math.abs(x))
        ey = Math.max(ey, Math.abs(y))
      }
  if (frame) {
    ex = Math.max(ex, frame.width / 2)
    ey = Math.max(ey, frame.length / 2)
  } else {
    // Sin sustrato (vista Curva): cuadrado, para no deformar la sensación de tamaño.
    ex = ey = Math.max(ex, ey)
  }
  const big = Math.max(ex, ey, 1e-6)
  // Con sustrato se deja espacio para las cotas; sin él, un margen pequeño.
  const margin = frame ? 0.2 * big : 0.08 * big
  const step = niceStep(2 * big)
  return { halfX: ex + margin, halfY: ey + margin, step }
}

/**
 * Dibuja la placa: fuera del sustrato, verde oscuro; el sustrato en verde;
 * el cobre encima; una cuadrícula en milímetros y, si hay sustrato, sus cotas.
 *
 * En SVG el eje y crece hacia abajo; por eso el grupo de la geometría usa
 * scale(1, -1): así la figura queda con el eje y hacia arriba, como en MATLAB.
 */
export function BoardPreview({ layers, legend, description, frame, onMove }: Props) {
  const fitted = useMemo(() => computeView(layers, frame), [layers, frame])
  // Mientras se arrastra, el encuadre queda fijo para que la figura no "salte".
  const [lockedView, setLockedView] = useState<View | null>(null)
  const { halfX, halfY, step } = lockedView ?? fitted
  const drag = useRef<{ x: number; y: number; mmPerPx: number } | null>(null)

  const paths = useMemo(() => layers.map((l) => ({ ...l, d: toPath(l.contours, l.closed) })), [layers])

  const gridX: number[] = []
  for (let v = Math.ceil(-halfX / step) * step; v <= halfX + 1e-9; v += step) gridX.push(Number(v.toFixed(10)))
  const gridY: number[] = []
  for (let v = Math.ceil(-halfY / step) * step; v <= halfY + 1e-9; v += step) gridY.push(Number(v.toFixed(10)))

  function onPointerDown(e: PointerEvent<SVGSVGElement>) {
    if (!onMove || e.button !== 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    // El dibujo se ajusta al recuadro sin deformarse: la escala es la menor de las dos.
    const pxPerMm = Math.min(rect.width / (2 * halfX), rect.height / (2 * halfY))
    drag.current = { x: e.clientX, y: e.clientY, mmPerPx: 1 / pxPerMm }
    e.currentTarget.setPointerCapture(e.pointerId)
    setLockedView({ halfX, halfY, step })
    onMove.start()
  }

  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    if (!onMove || !drag.current) return
    const { x, y, mmPerPx } = drag.current
    // En pantalla y crece hacia abajo; en la placa, hacia arriba.
    onMove.drag((e.clientX - x) * mmPerPx, -(e.clientY - y) * mmPerPx)
  }

  function endDrag() {
    drag.current = null
    setLockedView(null)
  }

  function onKeyDown(e: KeyboardEvent<SVGSVGElement>) {
    if (!onMove) return
    const d = e.shiftKey ? 1 : 0.1
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-d, 0],
      ArrowRight: [d, 0],
      ArrowUp: [0, d],
      ArrowDown: [0, -d],
    }
    const m = moves[e.key]
    if (!m) return
    e.preventDefault()
    onMove.nudge(m[0], m[1])
  }

  // Cotas del sustrato (en coordenadas de pantalla: y ya invertida).
  const font = 0.045 * Math.max(halfX, halfY)
  const off = 0.08 * Math.max(halfX, halfY)

  return (
    <figure className="board">
      <svg
        className={onMove ? 'board__svg board__svg--movable' : 'board__svg'}
        viewBox={`${-halfX} ${-halfY} ${2 * halfX} ${2 * halfY}`}
        style={{ aspectRatio: `${2 * halfX} / ${2 * halfY}` }}
        role="img"
        aria-label={`${description}. Cada cuadro mide ${formatMm(step)} mm.${onMove ? ' Usa las flechas para mover la figura.' : ''}`}
        tabIndex={onMove ? 0 : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      >
        <rect className="board__outside" x={-halfX} y={-halfY} width={2 * halfX} height={2 * halfY} />
        <g transform="scale(1,-1)">
          {paths
            .filter((p) => p.kind === 'substrate')
            .map((p) => (
              <path key={p.id} className="board__substrate" d={p.d} />
            ))}
          {gridX.map((v) => (
            <line
              key={`x${v}`}
              className={v === 0 ? 'board__axis' : 'board__grid'}
              x1={v}
              y1={-halfY}
              x2={v}
              y2={halfY}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {gridY.map((v) => (
            <line
              key={`y${v}`}
              className={v === 0 ? 'board__axis' : 'board__grid'}
              x1={-halfX}
              y1={v}
              x2={halfX}
              y2={v}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {paths
            .filter((p) => p.kind !== 'substrate')
            .map((p) => (
              <path key={p.id} className={`board__${p.kind}`} d={p.d} vectorEffect="non-scaling-stroke" />
            ))}
        </g>

        {frame && (
          <g className="board__dims" aria-hidden="true">
            {/* Ancho W, debajo del sustrato */}
            <line
              x1={-frame.width / 2}
              y1={frame.length / 2 + off}
              x2={frame.width / 2}
              y2={frame.length / 2 + off}
              vectorEffect="non-scaling-stroke"
            />
            {[-1, 1].map((s) => (
              <line
                key={`wt${s}`}
                x1={(s * frame.width) / 2}
                y1={frame.length / 2 + off * 0.4}
                x2={(s * frame.width) / 2}
                y2={frame.length / 2 + off * 1.6}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <text x={0} y={frame.length / 2 + off + font * 1.3} fontSize={font} textAnchor="middle">
              W = {formatMm(frame.width)} mm
            </text>
            {/* Largo L, a la izquierda del sustrato */}
            <line
              x1={-frame.width / 2 - off}
              y1={-frame.length / 2}
              x2={-frame.width / 2 - off}
              y2={frame.length / 2}
              vectorEffect="non-scaling-stroke"
            />
            {[-1, 1].map((s) => (
              <line
                key={`lt${s}`}
                x1={-frame.width / 2 - off * 1.6}
                y1={(s * frame.length) / 2}
                x2={-frame.width / 2 - off * 0.4}
                y2={(s * frame.length) / 2}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <text
              x={-frame.width / 2 - off - font * 0.6}
              y={0}
              fontSize={font}
              textAnchor="middle"
              transform={`rotate(-90 ${-frame.width / 2 - off - font * 0.6} 0)`}
            >
              L = {formatMm(frame.length)} mm
            </text>
          </g>
        )}
      </svg>
      <figcaption className="board__caption">
        {legend.map((item) => (
          <span key={item.label} className={`board__legend board__legend--${item.kind}`}>
            {item.label}
          </span>
        ))}
        {onMove && <span className="board__hint">Arrastra la figura para moverla</span>}
        <span className="board__scale">Cada cuadro mide {formatMm(step)} mm</span>
      </figcaption>
    </figure>
  )
}
