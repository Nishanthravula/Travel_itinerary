/**
 * One resilient JSON fetch for every data source: a timeout, a couple of
 * retries with backoff, cancellation, and errors the UI can explain.
 */

export type HttpErrorKind = 'timeout' | 'network' | 'http' | 'parse'

export class HttpError extends Error {
  readonly kind: HttpErrorKind
  readonly status?: number
  constructor(kind: HttpErrorKind, message: string, status?: number) {
    super(message)
    this.name = 'HttpError'
    this.kind = kind
    this.status = status
  }
}

export interface FetchJsonOptions<T = unknown> {
  init?: RequestInit
  /** Per-attempt timeout. */
  timeoutMs?: number
  /** Extra attempts after the first. */
  retries?: number
  /** Caller cancellation — aborts immediately, never retried. */
  signal?: AbortSignal
  /** Reject a well-formed but unusable answer by throwing an HttpError. */
  validate?: (data: T) => void
}

const BACKOFF_MS = 600
const isRetryable = (e: HttpError) =>
  e.kind !== 'http' || e.status === 429 || (e.status ?? 0) >= 500

const abortError = () => new DOMException('The request was cancelled.', 'AbortError')

/**
 * Fetch and parse JSON. Pass several URLs to rotate through mirrors — each
 * retry goes to the next one.
 */
export async function fetchJson<T>(
  url: string | URL | (string | URL)[],
  opts: FetchJsonOptions<T> = {},
): Promise<T> {
  const urls = Array.isArray(url) ? url : [url]
  const { init, timeoutMs = 12_000, retries = 2, signal, validate } = opts

  let lastError: HttpError | undefined
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) throw abortError()
    if (attempt > 0) await sleep(BACKOFF_MS * 2 ** (attempt - 1), signal)

    try {
      const data = await attemptOnce<T>(urls[attempt % urls.length], init, timeoutMs, signal)
      validate?.(data)
      return data
    } catch (err) {
      if (!(err instanceof HttpError)) throw err // caller abort
      lastError = err
      if (!isRetryable(err)) break
    }
  }
  throw lastError!
}

async function attemptOnce<T>(
  url: string | URL,
  init: RequestInit | undefined,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<T> {
  const ctrl = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    ctrl.abort()
  }, timeoutMs)
  const onAbort = () => ctrl.abort()
  signal?.addEventListener('abort', onAbort, { once: true })

  try {
    let res: Response
    try {
      res = await fetch(url, { ...init, signal: ctrl.signal })
    } catch (err) {
      if (signal?.aborted) throw abortError()
      if (timedOut) throw new HttpError('timeout', `Timed out after ${timeoutMs / 1000}s`)
      throw new HttpError('network', err instanceof Error ? err.message : 'Network error')
    }
    if (!res.ok) throw new HttpError('http', `HTTP ${res.status}`, res.status)
    try {
      return (await res.json()) as T
    } catch {
      if (signal?.aborted) throw abortError()
      // Busy public services sometimes answer 200 with an HTML error page.
      throw new HttpError('parse', 'Unexpected response format', res.status)
    }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(abortError())
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export const isAbort = (err: unknown): boolean =>
  err instanceof DOMException && err.name === 'AbortError'
