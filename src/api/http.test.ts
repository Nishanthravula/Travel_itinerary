import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpError, fetchJson } from './http'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** Run a fetchJson call to completion while advancing fake time. */
async function settle<T>(p: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  const wrapped = p.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  )
  await vi.advanceTimersByTimeAsync(120_000)
  return wrapped
}

describe('fetchJson', () => {
  it('returns parsed JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ a: 1 })))
    const r = await settle(fetchJson<{ a: number }>('https://x.test/a'))
    expect(r).toEqual({ ok: true, value: { a: 1 } })
  })

  it('retries after a 429 and then succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({}, 429)).mockResolvedValueOnce(json({ ok: 1 }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await settle(fetchJson('https://x.test/a'))
    expect(r.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry a 404', async () => {
    const fetchMock = vi.fn(async () => json({}, 404))
    vi.stubGlobal('fetch', fetchMock)
    const r = await settle(fetchJson('https://x.test/a'))
    expect(r.ok).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    if (!r.ok) expect(r.error).toMatchObject({ kind: 'http', status: 404 })
  })

  it('treats an HTML body as a parse error after retrying', async () => {
    const fetchMock = vi.fn(async () => new Response('<html>busy</html>', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await settle(fetchJson('https://x.test/a', { retries: 2 }))
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toBeInstanceOf(HttpError)
      expect(r.error).toMatchObject({ kind: 'parse' })
    }
  })

  it('times out a request that never answers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: unknown, init?: RequestInit) =>
          new Promise((_, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            )
          }),
      ),
    )
    const r = await settle(fetchJson('https://x.test/a', { timeoutMs: 1000, retries: 0 }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatchObject({ kind: 'timeout' })
  })

  it('stops immediately, without retrying, when the caller aborts', async () => {
    const fetchMock = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          )
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const ctrl = new AbortController()
    const p = settle(fetchJson('https://x.test/a', { signal: ctrl.signal }))
    ctrl.abort()
    const r = await p
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(r.ok).toBe(false)
    if (!r.ok) expect((r.error as Error).name).toBe('AbortError')
  })

  it('rotates through mirror URLs on each retry', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({}, 504)).mockResolvedValueOnce(json({ ok: 1 }))
    vi.stubGlobal('fetch', fetchMock)
    await settle(fetchJson(['https://one.test/x', 'https://two.test/x']))
    expect(String(fetchMock.mock.calls[0][0])).toContain('one.test')
    expect(String(fetchMock.mock.calls[1][0])).toContain('two.test')
  })
})
