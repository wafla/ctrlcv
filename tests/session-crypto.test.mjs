import assert from "node:assert/strict"
import test from "node:test"
import { decryptMessage, encryptMessage, getChatCryptoKey, getSessionCryptoKey } from "../lib/client-crypto.ts"

test("private-key mode still requires a valid separate key", async () => {
  for (const key of [undefined, null, "", "1234", "ABCDEFGH"]) {
    await assert.rejects(getSessionCryptoKey("ABC123", true, key), /8-digit encryption key/)
  }
  const oldKey = await getChatCryptoKey("ABC123", "12345678")
  const newKey = await getSessionCryptoKey("ABC123", true, "12345678")
  assert.equal(await decryptMessage(await encryptMessage("legacy", oldKey), newKey), "legacy")
})

test("code-only peers independently derive the same key without a private key", async () => {
  const host = await getSessionCryptoKey("ABC123", false)
  const guest = await getSessionCryptoKey("abc123", false)
  const ciphertext = await encryptMessage("PC to PC", host)
  assert.equal(await decryptMessage(ciphertext, guest), "PC to PC")
  const staleHash = await getSessionCryptoKey("ABC123", false, "87654321")
  assert.equal(await decryptMessage(ciphertext, staleHash), "PC to PC")
  const differentCode = await getSessionCryptoKey("DEF456", false)
  await assert.rejects(decryptMessage(ciphertext, differentCode))
  const privateKey = await getSessionCryptoKey("ABC123", true, "12345678")
  await assert.rejects(decryptMessage(ciphertext, privateKey))
})
