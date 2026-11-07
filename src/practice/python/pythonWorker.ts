/// <reference lib="webworker" />
// Python runs here, off the main thread; the page terminates this worker when a run exceeds its time limit.
import type { RunRequest, StepOutput, WorkerMessage } from './protocol'

type Pyodide = {
  loadPackage: (names: string[]) => Promise<unknown>
  globals: { get: (name: string) => () => PyNamespace }
  runPythonAsync: (code: string, options: { globals: PyNamespace }) => Promise<unknown>
  runPython: (code: string, options: { globals: PyNamespace }) => unknown
  setStdout: (options: { batched: (text: string) => void }) => void
  setStderr: (options: { batched: (text: string) => void }) => void
  FS: { writeFile: (path: string, data: Uint8Array) => void }
}
type PyNamespace = { set: (key: string, value: unknown) => void; destroy?: () => void }

const HELPERS = `
import json as __lab_json, math as __lab_math
def __lab_plain(v):
    if hasattr(v, 'item') and type(v).__module__.startswith('numpy') and getattr(v, 'ndim', 1) == 0:
        return v.item()
    if hasattr(v, 'tolist') and not isinstance(v, (str, bytes)):
        return v.tolist()
    return list(v) if isinstance(v, tuple) else v
def __lab_scalar(v):
    v = __lab_plain(v)
    if v is None or isinstance(v, (bool, int, str)):
        return v
    if isinstance(v, float):
        if __lab_math.isfinite(v):
            return v
        raise ValueError('значение не является конечным числом')
    raise TypeError('тип ' + type(v).__name__ + ' не поддерживается в проверке')
def __lab_value(v):
    v = __lab_plain(v)
    if isinstance(v, list):
        if len(v) > 100:
            raise ValueError('список длиннее 100 элементов')
        return [__lab_scalar(x) for x in v]
    return __lab_scalar(v)
`
const FIGURES = `
import sys as __lab_sys
__lab_figures = []
if 'matplotlib.pyplot' in __lab_sys.modules:
    import base64 as __lab_b64, io as __lab_io
    __lab_plt = __lab_sys.modules['matplotlib.pyplot']
    for __lab_n in __lab_plt.get_fignums():
        __lab_buf = __lab_io.BytesIO()
        __lab_plt.figure(__lab_n).savefig(__lab_buf, format='png', dpi=90, bbox_inches='tight')
        __lab_figures.append(__lab_b64.b64encode(__lab_buf.getvalue()).decode())
    __lab_plt.close('all')
__lab_json.dumps(__lab_figures)
`

let pyodide: Promise<Pyodide> | null = null
const loaded = new Set<string>()

function lastLine(error: unknown) {
  const text = error instanceof Error ? error.message : String(error)
  const lines = text.trim().split('\n').filter(Boolean)
  return { full: text.slice(-4000), short: (lines.at(-1) ?? text).slice(0, 2000) }
}

async function boot(baseUrl: string) {
  const module = await import(/* @vite-ignore */ `${baseUrl}pyodide.mjs`)
  const instance = await module.loadPyodide({ indexURL: baseUrl, env: { MPLBACKEND: 'Agg' } }) as Pyodide
  return instance
}

async function run(request: RunRequest): Promise<StepOutput[]> {
  pyodide ??= boot(request.baseUrl)
  const py = await pyodide
  const missing = request.packages.filter(name => !loaded.has(name))
  if (missing.length) { await py.loadPackage(missing); missing.forEach(name => loaded.add(name)) }
  for (const file of request.datasets) {
    const response = await fetch(file.url, { credentials: 'same-origin' })
    if (!response.ok) throw new Error(`Не удалось загрузить набор данных ${file.name}`)
    py.FS.writeFile(file.name.split(/[\\/]/).pop() || 'data', new Uint8Array(await response.arrayBuffer()))
  }
  const ns = py.globals.get('dict')()
  py.runPython(HELPERS, { globals: ns })
  const outputs: StepOutput[] = []
  let failed = false
  for (const step of request.steps) {
    const output: StepOutput = { stdout: '', error: '', figures: [], results: [] }
    if (failed) {
      output.results = step.checks.map(() => ({ error: 'Предыдущий шаг завершился с ошибкой' }))
      outputs.push(output); continue
    }
    let text = ''
    py.setStdout({ batched: chunk => { text += chunk + '\n' } })
    py.setStderr({ batched: chunk => { text += chunk + '\n' } })
    try {
      await py.runPythonAsync(step.code, { globals: ns })
    } catch (error) {
      output.error = lastLine(error).full
      failed = true
    }
    output.stdout = text.slice(-20000)
    for (const expression of step.checks) {
      if (failed) { output.results.push({ error: 'Код шага завершился с ошибкой' }); continue }
      try {
        ns.set('__lab_expr', expression)
        const json = py.runPython('__lab_json.dumps(__lab_value(eval(__lab_expr)))', { globals: ns }) as string
        output.results.push({ value: JSON.parse(json) })
      } catch (error) { output.results.push({ error: lastLine(error).short }) }
    }
    try { output.figures = JSON.parse(py.runPython(FIGURES, { globals: ns }) as string) } catch { output.figures = [] }
    outputs.push(output)
  }
  ns.destroy?.()
  return outputs
}

self.onmessage = async (event: MessageEvent<RunRequest>) => {
  let message: WorkerMessage
  try { message = { id: event.data.id, ok: true, steps: await run(event.data) } }
  catch (error) { message = { id: event.data.id, ok: false, error: lastLine(error).full } }
  self.postMessage(message)
}
