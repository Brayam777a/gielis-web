import { useId } from 'react'

type Props = {
  /** Nombre corto del parámetro, como aparece en la fórmula (a, b, m…). */
  symbol: string
  /** Qué controla el parámetro, en palabras. */
  hint: string
  /** Texto tal como lo escribió el usuario (puede estar a medio escribir: "-", "1."). */
  value: string
  min: number
  max: number
  step: number
  error?: string
  onChange: (value: string) => void
}

/**
 * Un parámetro de la súperfórmula: deslizador para explorar rápido y campo
 * numérico para escribir el valor exacto. Los dos muestran el mismo valor.
 */
export function ParameterField({ symbol, hint, value, min, max, step, error, onChange }: Props) {
  const id = useId()
  const errorId = `${id}-error`
  const numeric = Number(value)
  // El deslizador no acepta valores fuera de rango ni texto incompleto.
  const sliderValue = Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : min

  return (
    <div className={error ? 'param param--invalid' : 'param'}>
      <label className="param__label" htmlFor={id}>
        <span className="param__symbol">{symbol}</span>
        <span className="param__hint">{hint}</span>
      </label>
      <div className="param__inputs">
        <input
          type="range"
          className="param__slider"
          min={min}
          max={max}
          step={step}
          value={sliderValue}
          aria-label={`${symbol}: ${hint}`}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          id={id}
          type="number"
          className="param__number"
          inputMode="decimal"
          step={step}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      {error && (
        <p className="param__error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  )
}
