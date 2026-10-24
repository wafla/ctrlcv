import assert from "node:assert/strict"
import test from "node:test"
import { setImmediate } from "node:timers/promises"
import { consumeOrderedChunks } from "../lib/ordered-download.ts"

function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

test("downloads overlap, write in order, and never buffer an entire large file ahead", async () => {
  const loads = []
  const writes = []
  const first = deferred()
  const diskWrite = deferred()
  const running = consumeOrderedChunks(100, async (index) => {
    loads.push(index)
    if (index === 0) await first.promise
    return index
  }, async (chunk) => {
    writes.push(chunk)
    if (chunk === 0) await diskWrite.promise
  })
  await setImmediate()
  assert.deepEqual(loads, [0, 1, 2])
  assert.deepEqual(writes, [])
  first.resolve()
  await setImmediate()
  assert.deepEqual(loads, [0, 1, 2, 3])
  assert.deepEqual(writes, [0])
  diskWrite.resolve()
  await running
  assert.deepEqual(writes, Array.from({ length: 100 }, (_, index) => index))
})

test("an out-of-order download failure immediately aborts remaining requests", async () => {
  const failure = new Error("network failed")
  const cancelled = []
  const consumed = []
  await assert.rejects(consumeOrderedChunks(10, (index, signal) => {
    if (index === 1) return Promise.reject(failure)
    return new Promise((_, reject) => {
      signal.addEventListener("abort", () => {
        cancelled.push(index)
        reject(signal.reason)
      }, { once: true })
    })
  }, async (value) => { consumed.push(value) }), (error) => error === failure)
  assert.deepEqual(cancelled.sort(), [0, 2])
  assert.deepEqual(consumed, [])
})

test("a disk-write failure also aborts prefetches", async () => {
  let signal
  await assert.rejects(consumeOrderedChunks(10, async (index, receivedSignal) => {
    signal = receivedSignal
    return index
  }, async () => { throw new Error("disk full") }), /disk full/)
  assert.equal(signal.aborted, true)
})
