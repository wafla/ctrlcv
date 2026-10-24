import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { randomInt } from "node:crypto"
import vm from "node:vm"
import ts from "typescript"

// Exercise the real route handlers with an isolated Oracle double; tests never
// open the production wallet, create real sessions, or alter a real database.
const source = readFileSync(new URL("../app/api/session/route.ts", import.meta.url), "utf8")
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

function handlers(requiresKey = 1) {
  const state = { opened: 0, committed: 0, closed: 0, insertedMode: undefined, queriedCode: undefined }
  const connection = {
    execute: async (sql, binds) => {
      if (sql.includes("SELECT 1")) return { rows: [] }
      if (sql.includes("INSERT INTO sessions")) {
        state.insertedMode = binds.requiresKey
        assert.match(binds.code, /^[A-Z0-9]{6}$/)
        return { outBinds: { id: ["session-id"] } }
      }
      if (sql.includes("WHERE session_code = :code")) {
        state.queriedCode = binds.code
        return { rows: [{ ID: "session-id", SESSION_CODE: "ABC123",
          EXPIRES_AT: "2026-10-24T12:00:00Z", REQUIRES_KEY: requiresKey }] }
      }
      return { rows: [{ EXPIRES_AT: "2026-10-24T12:00:00Z" }] }
    },
    commit: async () => { state.committed++ },
    rollback: async () => {},
    close: async () => { state.closed++ },
  }
  const dependencies = {
    "next/server": { NextResponse: { json: (value, init) => Response.json(value, init) } },
    crypto: { randomInt },
    "@/lib/oracle": { getConnection: async () => { state.opened++; return connection } },
    "@/lib/server-files": { cleanupExpiredFiles: async () => {} },
    "@/lib/usage": { recordUsageEvent: async () => {} },
    oracledb: { BIND_OUT: 1, STRING: 2, OUT_FORMAT_OBJECT: 3 },
  }
  const module = { exports: {} }
  const run = vm.runInNewContext(`(function(require, module, exports) { ${compiled}\n})`, { URL, console })
  run((name) => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`)
    return dependencies[name]
  }, module, module.exports)
  return { ...module.exports, state }
}

test("session creation defaults to a private key and persists explicit code-only access", async () => {
  for (const [body, expected] of [[undefined, true], [{}, true], [{ requiresKey: true }, true],
    [{ requiresKey: false }, false]]) {
    const { POST, state } = handlers()
    const response = await POST(new Request("https://local.test/api/session", {
      method: "POST", body: body === undefined ? undefined : JSON.stringify(body),
    }))
    assert.equal(response.status, 200)
    assert.equal((await response.json()).requiresKey, expected)
    assert.equal(state.insertedMode, expected ? 1 : 0)
    assert.equal(state.closed, 1)
    assert.equal(state.committed, 1)
  }
})

test("malformed access modes are rejected before opening the database", async () => {
  for (const body of ['{"requiresKey":"false"}', 'null', '[]', '{broken']) {
    const { POST, state } = handlers()
    const response = await POST(new Request("https://local.test/api/session", { method: "POST", body }))
    assert.equal(response.status, 400)
    assert.equal(state.opened, 0)
  }
})

test("joining returns the stored mode and normalizes the typed session code", async () => {
  for (const [stored, expected] of [[1, true], [0, false], [undefined, true]]) {
    const { GET, state } = handlers(stored)
    const response = await GET(new Request("https://local.test/api/session?code=%20abc123%20"))
    assert.equal(response.status, 200)
    assert.equal((await response.json()).requiresKey, expected)
    assert.equal(state.queriedCode, "ABC123")
    assert.equal(state.closed, 1)
  }
})

test("invalid session codes never reach the database", async () => {
  for (const code of ["", "123", "A%26B123", "ABCDEFG"]) {
    const { GET, state } = handlers()
    assert.equal((await GET(new Request(`https://local.test/api/session?code=${code}`))).status, 400)
    assert.equal(state.opened, 0)
  }
})
