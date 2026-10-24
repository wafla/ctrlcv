import assert from "node:assert/strict"
import test from "node:test"
import { createSessionInviteUrl } from "../lib/session-info.ts"

test("private invite links contain the session code and full key in the fragment", () => {
  const link = new URL(createSessionInviteUrl("https://ctrlcv.net", {
    sessionCode: "ABC123", requiresKey: true,
  }, "00123456"))
  assert.equal(link.href, "https://ctrlcv.net/?code=ABC123#key=00123456")
  assert.equal(link.searchParams.has("key"), false)
})

test("code-only links never include a key, including a stale previous key", () => {
  for (const key of [undefined, null, "00123456"]) {
    assert.equal(createSessionInviteUrl("http://127.0.0.1:3000", {
      sessionCode: "ABC123", requiresKey: false,
    }, key), "http://127.0.0.1:3000/?code=ABC123")
  }
})

test("private invite links are never copied without a complete key", () => {
  for (const key of [undefined, null, "", "123", "abcdefgh"]) {
    assert.throws(() => createSessionInviteUrl("https://ctrlcv.net", {
      sessionCode: "ABC123", requiresKey: true,
    }, key), /encryption key is missing/)
  }
})
