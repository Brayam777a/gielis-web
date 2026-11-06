import { useState } from 'react'
import type { CaseRequest } from '../lib/design.ts'

type Props = { caseRequest: CaseRequest | null }

/**
 * Muestra el caso completo en JSON: es lo que el front le enviará al backend
 * para simular. Se puede copiar o descargar como archivo.
 */
export function CaseJson({ caseRequest }: Props) {
  const [copied, setCopied] = useState(false)

  if (!caseRequest) {
    return (
      <p className="case-json__empty">
        El JSON del caso aparece cuando todos los campos son válidos.
      </p>
    )
  }

  const text = JSON.stringify(caseRequest, null, 2)
  const fileName = `${caseRequest.mode}_caso.json`

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  function download() {
    // Se crea un archivo en memoria y se simula un clic en un enlace de descarga.
    const blob = new Blob([text], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <details className="case-json">
      <summary>Ver el caso en JSON</summary>
      <div className="case-json__actions">
        <button type="button" className="button" onClick={copy}>
          {copied ? 'Copiado' : 'Copiar'}
        </button>
        <button type="button" className="button case-json__download" onClick={download}>
          Descargar
        </button>
      </div>
      <pre className="case-json__code">{text}</pre>
    </details>
  )
}
