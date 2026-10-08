import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules() })

test('accepts ready messages only from the configured local iframe', async () => {
  vi.stubEnv('VITE_LOCAL_AVATAR', '1')
  vi.resetModules()
  const { useKevinAvatar } = await import('./KevinAvatar')
  function Panel() {
    const avatar = useKevinAvatar(vi.fn(), vi.fn())
    return <>{avatar.portrait}<span>{avatar.ready ? 'ready' : 'loading'}</span></>
  }
  render(<Panel/> )
  const frame = screen.getByTitle('Кевин') as HTMLIFrameElement
  act(() => window.dispatchEvent(new MessageEvent('message', { origin: 'https://untrusted.example', source: frame.contentWindow, data: { type: 'kevin-ready' } })))
  expect(screen.getByText('loading')).toBeTruthy()
  act(() => window.dispatchEvent(new MessageEvent('message', { origin: 'http://localhost:5184', source: window, data: { type: 'kevin-ready' } })))
  expect(screen.getByText('loading')).toBeTruthy()
  act(() => window.dispatchEvent(new MessageEvent('message', { origin: 'http://localhost:5184', source: frame.contentWindow, data: { type: 'kevin-ready' } })))
  expect(screen.getByText('ready')).toBeTruthy()
})

test('does not expose the trial avatar on a public hostname even with the build flag', async () => {
  vi.stubEnv('VITE_LOCAL_AVATAR', '1')
  vi.stubGlobal('location', { hostname: 'test.aiedu.com.kz', origin: 'https://test.aiedu.com.kz' })
  vi.resetModules()
  const { localAvatarEnabled } = await import('./KevinAvatar')
  expect(localAvatarEnabled).toBe(false)
})

test('queues a greeting only for a greeting and forwards it with the speech start', async () => {
  vi.stubEnv('VITE_LOCAL_AVATAR', '1')
  vi.resetModules()
  const { useKevinAvatar } = await import('./KevinAvatar')
  function Panel() {
    const avatar = useKevinAvatar(vi.fn(), vi.fn())
    return <>{avatar.portrait}<button onClick={() => { avatar.prepareResponse('Здравствуйте, Кевин!'); avatar.accept({ kind: 'start' }) }}>greet</button>
      <button onClick={() => { avatar.prepareResponse('Объясните тему.'); avatar.accept({ kind: 'start' }) }}>explain</button></>
  }
  render(<Panel/> )
  const frame = screen.getByTitle('Кевин') as HTMLIFrameElement
  const post = vi.spyOn(frame.contentWindow!, 'postMessage')
  act(() => screen.getByText('greet').click())
  expect(post).toHaveBeenNthCalledWith(1, { type: 'kevin-gesture', name: 'wave' }, 'http://localhost:5184')
  expect(post).toHaveBeenNthCalledWith(2, { type: 'kevin-stream', data: { kind: 'start' } }, 'http://localhost:5184')
  act(() => screen.getByText('explain').click())
  expect(post).toHaveBeenNthCalledWith(3, { type: 'kevin-gesture', name: 'explain' }, 'http://localhost:5184')
})
