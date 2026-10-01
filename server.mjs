import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer, request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGzip } from 'node:zlib'

const root = fileURLToPath(new URL('./dist/', import.meta.url)).replace(/[\\/]$/, '')
const apiTarget = process.env.API_PROXY_TARGET ? new URL(process.env.API_PROXY_TARGET) : null
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

createServer(async (request, response) => {
  if (apiTarget && request.url?.startsWith('/api/')) {
    const target = new URL(request.url, apiTarget)
    const send = target.protocol === 'https:' ? httpsRequest : httpRequest
    const upstream = send(target, { method: request.method, headers: { ...request.headers, host: target.host } }, incoming => {
      response.writeHead(incoming.statusCode ?? 502, incoming.headers)
      incoming.pipe(response)
      response.on('close', () => incoming.destroy())
    })
    upstream.setTimeout(120000, () => upstream.destroy(new Error('Backend timeout')))
    upstream.on('error', () => {
      if (response.headersSent) response.destroy()
      else response.writeHead(502, { 'Content-Type': 'application/json' }).end(JSON.stringify({ detail: 'Сервис платформы недоступен.' }))
    })
    request.on('aborted', () => upstream.destroy())
    response.on('close', () => upstream.destroy())
    request.pipe(upstream)
    return
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end()
    return
  }

  let pathname
  try {
    pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
  } catch {
    response.writeHead(400).end('Bad request')
    return
  }

  let file = resolve(root, `.${pathname}`)
  if (file !== root && !file.startsWith(`${root}${sep}`)) {
    response.writeHead(403).end('Forbidden')
    return
  }

  try {
    const info = await stat(file)
    if (info.isDirectory()) file = resolve(file, 'index.html')
  } catch {
    // Client-side routes should load the SPA entry point; missing assets should stay 404.
    if (extname(pathname)) {
      response.writeHead(404).end('Not found')
      return
    }
    file = resolve(root, 'index.html')
  }

  try {
    const info = await stat(file)
    if (!info.isFile()) {
      response.writeHead(404).end('Not found')
      return
    }

    const isEntry = file === resolve(root, 'index.html')
    const compressible = /\.(?:css|html|js|json|svg|txt|xml)$/i.test(file)
    const acceptsGzip = /(?:^|,)\s*gzip\s*(?:,|;|$)/i.test(request.headers['accept-encoding'] ?? '')
      && !/gzip\s*;\s*q=0(?:\.0*)?(?:,|$)/i.test(request.headers['accept-encoding'] ?? '')
    const shouldCompress = compressible && info.size >= 1024 && acceptsGzip
    response.writeHead(200, {
      'Content-Type': mimeTypes[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': isEntry ? 'no-cache' : 'public, max-age=31536000, immutable',
      'Vary': 'Accept-Encoding',
      ...(shouldCompress ? { 'Content-Encoding': 'gzip' } : { 'Content-Length': info.size }),
    })
    if (request.method === 'HEAD') response.end()
    else {
      const stream = createReadStream(file)
      if (shouldCompress) stream.pipe(createGzip()).pipe(response)
      else stream.pipe(response)
    }
  } catch {
    response.writeHead(404).end('Not found')
  }
}).listen(Number(process.env.PORT ?? 3000), process.env.HOST ?? '0.0.0.0')
