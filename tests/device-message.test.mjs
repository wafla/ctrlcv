import assert from "node:assert/strict"
import test from "node:test"
import {
  decodeDeviceMessage,
  encodeDeviceMessage,
  getSenderLabel,
  isDeviceIdentity,
  isOwnDeviceMessage,
} from "../lib/device-message.ts"
import { decryptMessage, encryptMessage, getChatCryptoKey } from "../lib/client-crypto.ts"

const officePC = { id: "a".repeat(32), name: "Office PC", kind: "desktop" }
const homePC = { id: "b".repeat(32), name: "Home PC", kind: "desktop" }
const phone = { id: "c".repeat(32), name: "Phone", kind: "mobile" }

function message(sender, content = "Hello") {
  return {
    id: "message-id",
    created_at: "2026-10-24T00:00:00Z",
    sender_type: sender.kind,
    ...decodeDeviceMessage(encodeDeviceMessage(content, sender)),
  }
}

test("PCs are identified by their device ID, regardless of which chat page they use", () => {
  const outgoing = message(officePC)
  const incoming = message(homePC)
  assert.equal(isOwnDeviceMessage(outgoing, officePC.id), true)
  assert.equal(isOwnDeviceMessage(incoming, officePC.id), false)
  assert.equal(isOwnDeviceMessage(outgoing, homePC.id), false)
  assert.equal(getSenderLabel(outgoing, officePC.id), "You")
  assert.equal(getSenderLabel(incoming, officePC.id), "Home PC · BBBBBB")
  assert.equal(isOwnDeviceMessage(message(phone), officePC.id), false)
  assert.equal(isOwnDeviceMessage(outgoing), false)
})

test("identical names stay distinguishable; renaming preserves ownership and old labels", () => {
  const before = message(officePC)
  const renamed = { ...officePC, name: "Workstation" }
  assert.equal(isOwnDeviceMessage(message(renamed), officePC.id), true)
  assert.equal(before.sender.name, "Office PC")
  assert.notEqual(
    getSenderLabel(message({ ...homePC, name: officePC.name })),
    getSenderLabel(before)
  )
})

test("legacy text and attachments remain readable without inventing device ownership", () => {
  const attachment = JSON.stringify({ type: "file", fileId: "legacy-file" })
  for (const content of ["plain text", "null", "123", attachment]) {
    assert.deepEqual(decodeDeviceMessage(content), { content })
  }
  const legacy = { ...message(officePC), sender: undefined }
  assert.equal(getSenderLabel(legacy, officePC.id), "PC (legacy)")
  assert.equal(isOwnDeviceMessage(legacy, officePC.id), false)
})

test("invalid device payloads are treated as content, never trusted as sender metadata", () => {
  for (const invalid of [null, {}, { ...officePC, id: "bad-id" },
    { ...officePC, kind: "other" }, { ...officePC, name: " " },
    { ...officePC, name: "x".repeat(41) }]) {
    assert.equal(isDeviceIdentity(invalid), false)
    const content = JSON.stringify({ ctrlcvMessageVersion: 1, content: "text", sender: invalid })
    assert.deepEqual(decodeDeviceMessage(content), { content })
  }
})

test("text, file metadata, and device metadata survive the actual encryption round trip", async () => {
  const key = await getChatCryptoKey("ABC123", "12345678")
  const attachment = JSON.stringify({ type: "file", fileId: "123", fileName: "report.zip",
    mimeType: "application/zip", size: 1234, transferVersion: "chunked-v1",
    chunkSize: 8388608, chunkCount: 1 })
  for (const content of ["Hello from another PC\n한글 메시지", attachment]) {
    const encrypted = await encryptMessage(encodeDeviceMessage(content, officePC), key)
    assert.equal(encrypted.includes(officePC.name), false)
    assert.equal(encrypted.includes(officePC.id), false)
    assert.deepEqual(decodeDeviceMessage(await decryptMessage(encrypted, key)),
      { content, sender: officePC })
  }
})
