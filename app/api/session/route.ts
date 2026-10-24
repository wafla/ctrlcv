import { NextResponse } from "next/server"
import { randomInt } from "crypto"
import { getConnection } from "@/lib/oracle"
import { cleanupExpiredFiles } from "@/lib/server-files"
import { recordUsageEvent } from "@/lib/usage"
const oracledb = require("oracledb")

function generateSessionCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  let result = ""
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(randomInt(chars.length))
  }
  return result
}

export async function POST(request: Request) {
  let conn

  try {
    let requiresKey = true
    try {
      const text = await request.text()
      const body: unknown = text ? JSON.parse(text) : {}
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return NextResponse.json({ error: "Invalid session settings" }, { status: 400 })
      }
      const setting = (body as { requiresKey?: unknown }).requiresKey
      if (setting !== undefined && typeof setting !== "boolean") {
        return NextResponse.json({ error: "Invalid session settings" }, { status: 400 })
      }
      requiresKey = setting !== false
    } catch {
      return NextResponse.json({ error: "Invalid session settings" }, { status: 400 })
    }

    conn = await getConnection()
    await cleanupExpiredFiles(conn)

    let sessionCode = generateSessionCode()
    let attempts = 0
    const maxAttempts = 5

    while (attempts < maxAttempts) {
      const check = await conn.execute(
        `
        SELECT 1
        FROM sessions
        WHERE session_code = :code
          AND is_active = 1
        `,
        { code: sessionCode }
      )

      if ((check.rows?.length ?? 0) === 0) break

      sessionCode = generateSessionCode()
      attempts++
    }

    if (attempts >= maxAttempts) {
      return NextResponse.json(
        { error: "Failed to generate unique session code" },
        { status: 500 }
      )
    }

    const result = await conn.execute(
      `
      INSERT INTO sessions (
        id,
        session_code,
        requires_key,
        is_active,
        created_at,
        expires_at
      )
      VALUES (
        RAWTOHEX(sys_guid()),
        :code,
        :requiresKey,
        1,
        SYS_EXTRACT_UTC(SYSTIMESTAMP),
        SYS_EXTRACT_UTC(SYSTIMESTAMP) + INTERVAL '2' HOUR
      )
      RETURNING id INTO :id
      `,
      {
        code: sessionCode,
        requiresKey: requiresKey ? 1 : 0,
        id: { dir: oracledb.BIND_OUT, type: oracledb.STRING },
      }
    )

    const sessionId = result.outBinds!.id[0]
    const expiryResult = await conn.execute(
      `SELECT expires_at FROM sessions WHERE id = :sessionId`,
      { sessionId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    )
    const expiresAt = expiryResult.rows![0].EXPIRES_AT
    await recordUsageEvent(conn, "session_created", { sessionId })

    await conn.commit()

    return NextResponse.json({
      sessionId,
      sessionCode,
      expiresAt,
      requiresKey,
    })
  } catch (err: any) {
    if (conn) await conn.rollback()
    if (conn) {
      await recordUsageEvent(conn, "api_error")
      await conn.commit()
    }

    console.error("POST /api/session error:", err)
    
    // 에러 메시지 추출
    const errorMessage = err?.message || String(err)
    const errorCode = err?.errorNum || err?.code || null
    
    return NextResponse.json(
      { 
        error: "Internal server error",
        details: errorMessage,
        code: errorCode
      },
      { status: 500 }
    )
  } finally {
    if (conn) await conn.close()
  }
}

export async function GET(request: Request) {
  let conn

  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get("code")?.trim().toUpperCase()

    if (!code || !/^[A-Z0-9]{6}$/.test(code)) {
      return NextResponse.json(
        { error: "Session code is required" },
        { status: 400 }
      )
    }

    conn = await getConnection()
    await cleanupExpiredFiles(conn)

    const result = await conn.execute(
      `
      SELECT
        id,
        session_code,
        requires_key,
        expires_at
      FROM sessions
      WHERE session_code = :code
        AND is_active = 1
        AND expires_at > SYS_EXTRACT_UTC(SYSTIMESTAMP)
      `,
      { code },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    )

    if (!result.rows || result.rows.length === 0) {
      return NextResponse.json(
        { error: "Session not found or expired" },
        { status: 404 }
      )
    }

    const row = result.rows[0]
    const id = row.ID
    const sessionCode = row.SESSION_CODE
    const expiresAt = row.EXPIRES_AT

    await recordUsageEvent(conn, "session_connected", { sessionId: id })
    await conn.commit()

    return NextResponse.json({
      sessionId: id,
      sessionCode,
      expiresAt,
      requiresKey: row.REQUIRES_KEY !== 0,
    })
  } catch (err: any) {
    if (conn) {
      await recordUsageEvent(conn, "api_error")
      await conn.commit()
    }
    console.error("GET /api/session error:", err)

    const errorMessage = err?.message || String(err)
    const errorCode = err?.errorNum || err?.code || null

    return NextResponse.json(
      { 
        error: "Internal server error. Try later",
        details: errorMessage,
        code: errorCode
      },
      { status: 500 }
    )
  } finally {
    if (conn) await conn.close()
  }
}
