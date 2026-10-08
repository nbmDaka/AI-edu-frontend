import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { createReadStream, readFileSync } from 'node:fs'
import type { Plugin } from 'vite'

const require = createRequire(import.meta.url)
export function voiceAssets(): Plugin {
  const vad = dirname(require.resolve('@ricky0123/vad-web'))
  const ort = dirname(require.resolve('onnxruntime-web/wasm'))
  const files = new Map([
    ['vad.worklet.bundle.min.js', join(vad, 'vad.worklet.bundle.min.js')],
    ['silero_vad_v5.onnx', join(vad, 'silero_vad_v5.onnx')],
    ['ort-wasm-simd-threaded.mjs', join(ort, 'ort-wasm-simd-threaded.mjs')],
    ['ort-wasm-simd-threaded.wasm', join(ort, 'ort-wasm-simd-threaded.wasm')],
  ])
  return {
    name: 'local-voice-assets',
    generateBundle() {
      for (const [name, path] of files) this.emitFile({ type: 'asset', fileName: `voice-assets/${name}`, source: readFileSync(path) })
    },
    configureServer(server) {
      server.middlewares.use('/voice-assets/', (req, res, next) => {
        const path = files.get((req.url ?? '').split('?')[0].replace(/^\//, ''))
        if (!path) { next(); return }
        res.setHeader('Content-Type', path.endsWith('.wasm') ? 'application/wasm' : /\.(mjs|js)$/.test(path) ? 'text/javascript' : 'application/octet-stream')
        createReadStream(path).pipe(res)
      })
    },
  }
}
