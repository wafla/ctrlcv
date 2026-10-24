import assert from "node:assert/strict"
import test from "node:test"
import { createHash } from "node:crypto"
import { setTimeout as delay } from "node:timers/promises"
import { encryptFileChunk, encryptFile } from "../lib/client-crypto.ts"
import { FILE_CHUNK_SIZE, loadEncryptedAttachmentBlob, saveEncryptedAttachment } from "../lib/client-file-transfer.ts"

const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"])
const plaintext = Buffer.alloc(FILE_CHUNK_SIZE * 3 + 17)
for (let index = 0; index < 4; index++) {
  plaintext.fill(index + 1, index * FILE_CHUNK_SIZE, Math.min(plaintext.length, (index + 1) * FILE_CHUNK_SIZE))
}
const encrypted = await Promise.all(Array.from({ length: 4 }, async (_, index) => {
  const start = index * FILE_CHUNK_SIZE
  const blob = await encryptFileChunk(new Blob([plaintext.subarray(start, start + FILE_CHUNK_SIZE)]), key)
  return blob.arrayBuffer()
}))
const attachment = { fileId: "file", fileName: "test.bin", mimeType: "application/octet-stream",
  size: plaintext.length, transferVersion: "chunked-v1", chunkSize: FILE_CHUNK_SIZE, chunkCount: 4 }
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex")

function mockServer(t, override) {
  let accessCalls = 0
  let active = 0
  let maxActive = 0
  const requests = []
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (url.includes("/access?")) {
      accessCalls++
      return Response.json({ token: "download-token" })
    }
    assert.equal(options.headers.Authorization, "Bearer download-token")
    const params = new URL(url, "https://local.test").searchParams
    const index = Number(params.get("offset")) / (FILE_CHUNK_SIZE + 28)
    assert.equal(Number.isInteger(index), true)
    assert.equal(Number(params.get("length")), encrypted[index].byteLength)
    requests.push(index)
    active++
    maxActive = Math.max(maxActive, active)
    try {
      const overridden = await override?.(index, options, requests)
      if (overridden) return overridden
      // Make later chunks arrive first to catch accidental write reordering.
      await delay(index === 0 ? 40 : 5, undefined, { signal: options.signal })
      return new Response(encrypted[index])
    } finally { active-- }
  })
  return { requests, get accessCalls() { return accessCalls }, get maxActive() { return maxActive } }
}

function mockDisk(t, writeOverride) {
  const originalWindow = globalThis.window
  const state = { chunks: [], closed: false, aborted: false }
  globalThis.window = {
    showSaveFilePicker: async (options) => {
      assert.equal(options.suggestedName, attachment.fileName)
      return { createWritable: async () => ({
        write: async (bytes) => {
          await writeOverride?.(bytes)
          state.chunks.push(Buffer.from(bytes))
        },
        close: async () => { state.closed = true },
        abort: async () => { state.aborted = true },
      }) }
    },
  }
  t.after(() => {
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
  })
  return state
}

test("blob downloads overlap requests but decrypt and assemble exact original bytes", async (t) => {
  const server = mockServer(t)
  const progress = []
  const blob = await loadEncryptedAttachmentBlob({ attachment, encryptionKey: key, sessionId: "session",
    onProgress: (value) => progress.push(value) })
  assert.equal(hash(Buffer.from(await blob.arrayBuffer())), hash(plaintext))
  assert.equal(server.accessCalls, 1)
  assert.equal(server.maxActive, 3)
  assert.deepEqual(progress, [0, 25, 50, 75, 100])
})

test("streamed downloads retry transient failures and write chunks in original order", async (t) => {
  let attempts = 0
  const server = mockServer(t, (index) => {
    if (index === 1 && attempts++ === 0) return new Response("retry", { status: 503 })
  })
  const disk = mockDisk(t)
  await saveEncryptedAttachment({ attachment, encryptionKey: key, sessionId: "session" })
  assert.equal(attempts, 2)
  assert.equal(server.requests.filter((index) => index === 1).length, 2)
  assert.equal(hash(Buffer.concat(disk.chunks)), hash(plaintext))
  assert.equal(disk.closed, true)
  assert.equal(disk.aborted, false)
})

test("permanent HTTP failures are not retried and cancel the other downloads and disk output", async (t) => {
  const signals = []
  const server = mockServer(t, async (index, options) => {
    signals.push(options.signal)
    if (index === 1) return new Response("expired", { status: 404 })
    await delay(1000, undefined, { signal: options.signal })
  })
  const disk = mockDisk(t)
  await assert.rejects(saveEncryptedAttachment({ attachment, encryptionKey: key, sessionId: "session" }), /HTTP 404/)
  assert.equal(server.requests.filter((index) => index === 1).length, 1)
  assert.equal(signals.every((signal) => signal.aborted), true)
  assert.equal(disk.aborted, true)
  assert.equal(disk.closed, false)
})

test("a damaged authenticated chunk never produces a completed output file", async (t) => {
  mockServer(t, (index) => {
    if (index === 0) {
      const damaged = new Uint8Array(encrypted[0].slice(0))
      damaged[15] ^= 1
      return new Response(damaged)
    }
  })
  const disk = mockDisk(t)
  await assert.rejects(saveEncryptedAttachment({ attachment, encryptionKey: key, sessionId: "session" }))
  assert.equal(disk.aborted, true)
  assert.equal(disk.closed, false)
})

test("legacy whole-file downloads remain compatible", async (t) => {
  const content = new File(["legacy file"], "legacy.txt", { type: "text/plain" })
  const ciphertext = await encryptFile(content, key)
  t.mock.method(globalThis, "fetch", async () => new Response(ciphertext))
  const blob = await loadEncryptedAttachmentBlob({ attachment: {
    fileId: "old", fileName: content.name, size: content.size, mimeType: content.type,
  }, encryptionKey: key, sessionId: "session" })
  assert.equal(await blob.text(), "legacy file")
})

test("invalid chunk metadata is rejected before any download request", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("unexpected fetch") })
  await assert.rejects(loadEncryptedAttachmentBlob({ attachment: { ...attachment, chunkCount: 999 },
    encryptionKey: key, sessionId: "session" }), /Invalid chunked attachment metadata/)
  assert.equal(fetch.mock.callCount(), 0)
})

test("truncated responses are retried and exhausted retries abort the output", async (t) => {
  const server = mockServer(t, (index) => {
    if (index === 0) return new Response(new Uint8Array(10))
  })
  const disk = mockDisk(t)
  await assert.rejects(saveEncryptedAttachment({ attachment, encryptionKey: key, sessionId: "session" }),
    /incomplete file chunk/)
  assert.equal(server.requests.filter((index) => index === 0).length, 3)
  assert.equal(disk.aborted, true)
  assert.equal(disk.closed, false)
})

test("a real disk write error aborts the writable file instead of closing it", async (t) => {
  mockServer(t)
  const disk = mockDisk(t, async () => { throw new Error("disk is full") })
  await assert.rejects(saveEncryptedAttachment({ attachment, encryptionKey: key, sessionId: "session" }),
    /disk is full/)
  assert.equal(disk.aborted, true)
  assert.equal(disk.closed, false)
})
