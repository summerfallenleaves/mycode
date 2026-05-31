/**
 * @fileoverview withTimeout() and createTimeoutSignal() for AbortController-based tool execution timeout
 * @module @my-agent/core/safety/timeout
 */

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms),
    ),
  ])
}

export function createTimeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController()
  setTimeout(() => controller.abort(new Error(`Timed out after ${ms}ms`)), ms)
  return controller.signal
}
