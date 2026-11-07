import { useCallback, useEffect, useRef, useState } from 'react'
import type { RunRequest, StepOutput, WorkerMessage } from './protocol'

// Self-hosting: put the Pyodide release into public/pyodide/ and set VITE_PYODIDE_URL=/pyodide/.
export const PYODIDE_URL = import.meta.env.VITE_PYODIDE_URL || 'https://cdn.jsdelivr.net/pyodide/v0.29.5/full/'
const FIRST_RUN_LIMIT = 180_000
const RUN_LIMIT = 30_000

export type PythonStatus = 'idle' | 'running'

export function usePython() {
  const worker = useRef<Worker | null>(null)
  const warm = useRef(false)
  const counter = useRef(0)
  const [status, setStatus] = useState<PythonStatus>('idle')

  const reset = useCallback(() => { worker.current?.terminate(); worker.current = null; warm.current = false }, [])
  useEffect(() => reset, [reset])

  const run = useCallback((request: Omit<RunRequest, 'id' | 'baseUrl'>) => new Promise<StepOutput[]>((resolve, reject) => {
    worker.current ??= new Worker(new URL('./pythonWorker.ts', import.meta.url), { type: 'module' })
    const current = worker.current
    const id = ++counter.current
    setStatus('running')
    const limit = warm.current ? RUN_LIMIT : FIRST_RUN_LIMIT
    const timer = window.setTimeout(() => {
      reset(); setStatus('idle')
      reject(new Error(`Код выполнялся дольше ${limit / 1000} с и был остановлен. Проверьте бесконечные циклы.`))
    }, limit)
    current.onmessage = (event: MessageEvent<WorkerMessage>) => {
      if (event.data.id !== id) return
      window.clearTimeout(timer); setStatus('idle')
      if (event.data.ok) { warm.current = true; resolve(event.data.steps) } else reject(new Error(event.data.error))
    }
    current.onerror = event => {
      window.clearTimeout(timer); reset(); setStatus('idle')
      reject(new Error(event.message || 'Не удалось запустить Python в браузере'))
    }
    current.postMessage({ ...request, id, baseUrl: PYODIDE_URL } satisfies RunRequest)
  }), [reset])

  return { run, status, warm: warm.current }
}
