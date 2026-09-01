import { createHash, timingSafeEqual } from "crypto"
import { NextResponse } from "next/server"
import { getConnection } from "@/lib/oracle"
import { cleanupExpiredFiles } from "@/lib/server-files"

export const dynamic = "force-dynamic"

function secretsMatch(provided: string, expected: string) {
  const providedHash = createHash("sha256").update(provided).digest()
  const expectedHash = createHash("sha256").update(expected).digest()

  return timingSafeEqual(providedHash, expectedHash)
}

export async function GET(request: Request) {
  const expectedSecret = process.env.DB_KEEPALIVE_SECRET

  if (!expectedSecret) {
    return NextResponse.json(
      { error: "DB keepalive is not configured" },
      { status: 503 }
    )
  }

  const authorization = request.headers.get("authorization")
  const bearerSecret = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : ""
  const querySecret = new URL(request.url).searchParams.get("secret") ?? ""
  const providedSecret = bearerSecret || querySecret

  if (!providedSecret || !secretsMatch(providedSecret, expectedSecret)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  let connection

  try {
    connection = await getConnection()
    await connection.execute("SELECT 1 FROM dual")
    await cleanupExpiredFiles(connection)

    return NextResponse.json({
      ok: true,
      checkedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error("GET /api/db-keepalive error:", error)
    return NextResponse.json(
      { error: "Database keepalive failed" },
      { status: 500 }
    )
  } finally {
    if (connection) {
      await connection.close()
    }
  }
}
