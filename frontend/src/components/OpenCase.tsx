import { useId, useState, type ChangeEvent } from 'react'
import { parseCaseFile, type LoadedCase } from '../lib/caseFile.ts'

type Props = { onLoad: (c: LoadedCase) => void }

/**
 * Botón para abrir un caso guardado (.json): el de esta página o uno de
 * backend/examples/. Muestra qué se cargó, avisos o el error.
 */
export function OpenCase({ onLoad }: Props) {
  const id = useId()
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; lines: string[] } | null>(null)

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Se limpia para poder abrir el mismo archivo otra vez.
    e.target.value = ''
    if (!file) return
    const result = parseCaseFile(await file.text())
    if (result.ok) {
      onLoad(result.value)
      setMessage({ kind: 'ok', lines: [`Se cargó "${file.name}".`, ...result.value.notes] })
    } else {
      setMessage({ kind: 'error', lines: [`No se pudo abrir "${file.name}": ${result.error}`] })
    }
  }

  return (
    <div className="open-case">
      <label className="button" htmlFor={id}>
        Abrir un caso (.json)
      </label>
      <input id={id} className="open-case__input" type="file" accept=".json,application/json" onChange={onFile} />
      {message && (
        <div className={`open-case__message open-case__message--${message.kind}`} role="status">
          {message.lines.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
      )}
    </div>
  )
}
