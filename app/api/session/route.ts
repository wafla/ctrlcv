import { NextResponse } from "next/server"
import { getConnection } from "@/lib/oracle"
const oracledb = require("oracledb")

function generateSessionCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  let result = ""
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

export async function POST() {
  let conn

  try {
    conn = await getConnection()

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
        is_active,
        created_at,
        expires_at
      )
      VALUES (
        RAWTOHEX(sys_guid()),
        :code,
        1,
        SYS_EXTRACT_UTC(SYSTIMESTAMP),
        SYS_EXTRACT_UTC(SYSTIMESTAMP) + INTERVAL '2' HOUR
      )
      RETURNING id INTO :id
      `,
      {
        code: sessionCode,
        id: { dir: oracledb.BIND_OUT, type: oracledb.STRING },
      }
    )

    await conn.commit()

    return NextResponse.json({
      sessionId: result.outBinds!.id[0],
      sessionCode,
    })
  } catch (err: any) {
    if (conn) await conn.rollback()

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
    const code = searchParams.get("code")

    if (!code) {
      return NextResponse.json(
        { error: "Session code is required" },
        { status: 400 }
      )
    }

    conn = await getConnection()

    const result = await conn.execute(
      `
      SELECT
        id,
        session_code,
        expires_at
      FROM sessions
      WHERE session_code = :code
        AND is_active = 1
        AND expires_at > SYS_EXTRACT_UTC(SYSTIMESTAMP)
      `,
      { code }
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

    return NextResponse.json({
      sessionId: id,
      sessionCode,
      expiresAt,
    })
  } catch (err: any) {
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