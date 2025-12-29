import { NextResponse } from "next/server"
import { getConnection } from "@/lib/oracle"

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

    await conn.commit()

    return NextResponse.json({
      id: result.outBinds!.id[0],
      sessionId,
      content: content.trim(),
      senderType,
      createdAt: result.outBinds!.createdAt[0],
    })
  } catch (err) {
    if (conn) await conn.rollback()
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

    return NextResponse.json(result.rows ?? [])
  } catch (err) {
    console.error("GET /api/messages error:", err)

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  } finally {
    if (conn) await conn.close()
  }
}