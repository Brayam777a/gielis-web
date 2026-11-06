import { useId } from 'react'

type Props = {
  label: string
  value: string
  options: { id: string; name: string }[]
  error?: string
  onChange: (value: string) => void
}

/** Un selector de material con su etiqueta y su mensaje de error. */
export function SelectField({ label, value, options, error, onChange }: Props) {
  const id = useId()
  return (
    <div className={error ? 'param param--invalid' : 'param'}>
      <label className="param__label" htmlFor={id}>
        <span className="param__name">{label}</span>
      </label>
      <select
        id={id}
        className="param__select"
        value={value}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      {error && <p className="param__error">{error}</p>}
    </div>
  )
}
