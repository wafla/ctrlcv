// Start a small sliding window of requests, then consume in file order. Settled
// failures are retained as values so an out-of-order failure is never unhandled.
export async function consumeOrderedChunks<T>(
  count: number,
  load: (index: number, signal: AbortSignal) => Promise<T>,
  consume: (chunk: T, index: number) => Promise<void>,
  concurrency = 3
) {
  if (!Number.isSafeInteger(count) || count <= 0 ||
      !Number.isSafeInteger(concurrency) || concurrency <= 0) {
    throw new Error("Invalid download configuration.")
  }

  const controller = new AbortController()
  type Result = { ok: true; value: T } | { ok: false; error: unknown }
  const pending = new Map<number, Promise<Result>>()
  let next = 0
  const enqueue = (index: number) => {
    const result = Promise.resolve().then(() => load(index, controller.signal)).then(
      (value): Result => ({ ok: true, value }),
      (error): Result => {
        controller.abort(error)
        return { ok: false, error }
      }
    )
    pending.set(index, result)
  }

  try {
    while (next < Math.min(count, concurrency)) enqueue(next++)
    for (let index = 0; index < count; index += 1) {
      const result = await pending.get(index)!
      pending.delete(index)
      if (controller.signal.aborted) throw controller.signal.reason
      if (!result.ok) throw result.error
      // Prefetch while the current chunk is being written to disk.
      if (next < count) enqueue(next++)
      await consume(result.value, index)
    }
  } finally {
    controller.abort()
    pending.clear()
  }
}
