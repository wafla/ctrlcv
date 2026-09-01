import { NextResponse } from "next/server"
import { getConnection } from "@/lib/oracle"
import { recordUsageEvent } from "@/lib/usage"

const oracledb = require("oracledb")

export async function POST(request: Request) {
  let conn

  try {
    const { sessionId, content, senderType } = await request.json()

    if (!sessionId || !content || !senderType) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    conn = await getConnection()

    const sessionCheck = await conn.execute(
      `
      SELECT id
      FROM sessions
      WHERE id = :sessionId
        AND is_active = 1
        AND expires_at > SYS_EXTRACT_UTC(SYSTIMESTAMP)
      FOR UPDATE
      `,
      { sessionId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    )

    if ((sessionCheck.rows?.length ?? 0) === 0) {
      return NextResponse.json(
        { error: "Session not found or expired" },
        { status: 404 }
      )
    }

    const result = await conn.execute(
      `
      INSERT INTO messages (
        id,
        session_id,
        content,
        sender_type,
        created_at
      )
      VALUES (
        RAWTOHEX(sys_guid()),
        :sessionId,
        :content,
        :senderType,
        SYSTIMESTAMP AT TIME ZONE 'UTC'
      )
      RETURNING id, created_at INTO :id, :createdAt
      `,
      {
        sessionId,
        content: content.trim(),
        senderType,
        id: { dir: oracledb.BIND_OUT, type: oracledb.STRING },
        createdAt: { dir: oracledb.BIND_OUT, type: oracledb.STRING },
      }
    )

    await conn.execute(
      `
      UPDATE sessions
      SET expires_at = SYS_EXTRACT_UTC(SYSTIMESTAMP) + INTERVAL '2' HOUR
      WHERE id = :sessionId
      `,
      { sessionId }
    )

    await conn.execute(
      `
      UPDATE image_attachments
      SET expires_at = SYS_EXTRACT_UTC(SYSTIMESTAMP) + INTERVAL '2' HOUR
      WHERE session_id = :sessionId
      `,
      { sessionId }
    )

    const expiryResult = await conn.execute(
      `SELECT expires_at FROM sessions WHERE id = :sessionId`,
      { sessionId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    )
    const expiresAt = expiryResult.rows![0].EXPIRES_AT

    await recordUsageEvent(conn, "message_sent", { sessionId })

    await conn.commit()

    return NextResponse.json({
      id: result.outBinds!.id[0],
      sessionId,
      content: content.trim(),
      senderType,
      createdAt: result.outBinds!.createdAt[0],
      expiresAt,
    })
  } catch (err) {
    if (conn) await conn.rollback()
    if (conn) {
      await recordUsageEvent(conn, "api_error")
      await conn.commit()
    }
    console.error("POST /api/messages error:", err)

    return NextResponse.json(
      { error: "Internal server error" },
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
    const sessionId = searchParams.get("sessionId")

    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 }
      )
    }

    conn = await getConnection()

    const sessionResult = await conn.execute(
      `
      SELECT expires_at
      FROM sessions
      WHERE id = :sessionId
        AND is_active = 1
        AND expires_at > SYS_EXTRACT_UTC(SYSTIMESTAMP)
      `,
      { sessionId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    )

    if ((sessionResult.rows?.length ?? 0) === 0) {
      return NextResponse.json(
        { error: "Session not found or expired" },
        { status: 404 }
      )
    }

    const result = await conn.execute(
      `
      SELECT
        id,
        session_id,
        content,
        sender_type,
        created_at
      FROM messages
      WHERE session_id = :sessionId
      ORDER BY created_at ASC
      `,
      { sessionId },
      { 
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        fetchInfo: {
            CONTENT: { type: oracledb.STRING },
        },
      }
    )

    const expiresAt = new Date(sessionResult.rows![0].EXPIRES_AT).toISOString()
    return NextResponse.json(result.rows ?? [], {
      headers: {
        "Cache-Control": "no-store",
        "X-Session-Expires-At": expiresAt,
      },
    })
  } catch (err) {
    if (conn) {
      await recordUsageEvent(conn, "api_error")
      await conn.commit()
    }
    console.error("GET /api/messages error:", err)

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  } finally {
    if (conn) await conn.close()
  }
}
