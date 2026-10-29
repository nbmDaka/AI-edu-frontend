import { createServer } from 'vite'
import { createReadStream, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const model = process.env.TEACHER_PREVIEW_MODEL || fileURLToPath(new URL('../../../avatar/MetaHumanTeacher/Saved/WebExport/characters/teacher/03-glb/teacher-browser.glb', import.meta.url))
const assets = new Map([
  ['/__teacher.glb', [model, 'model/gltf-binary']],
  ['/__cedar.wav', [fileURLToPath(new URL('../../../avatar/MetaHumanTeacher/Saved/Authoring/VoiceSamples/teacher-cedar.wav', import.meta.url)), 'audio/wav']],
  ['/__faces.json', [fileURLToPath(new URL('../../../avatar/MetaHumanTeacher/Saved/Authoring/cedar-a2f-cloud.json', import.meta.url)), 'application/json']],
])
const server = await createServer({
  server: { host: '127.0.0.1', port: 5190, strictPort: true },
  plugins: [{
    name: 'local-teacher-preview',
    configureServer(vite) {
      vite.middlewares.use((request, response, next) => {
        const asset = assets.get(request.url?.split('?')[0])
        if (!asset) { next(); return }
        if (request.method !== 'GET') { response.writeHead(405).end(); return }
        response.writeHead(200, { 'Content-Type': asset[1], 'Content-Length': statSync(asset[0]).size, 'Cache-Control': 'no-store' })
        createReadStream(asset[0]).pipe(response)
      })
    },
  }],
})
await server.listen()
console.log('Teacher validation: http://127.0.0.1:5190/tools/teacher-preview.html')
