import { createHash } from "crypto";

type UsageEventType =
  | "session_created"
  | "session_connected"
  | "message_sent"
  | "image_uploaded"
  | "image_bytes_uploaded"
  | "file_uploaded"
  | "file_bytes_uploaded"
  | "api_error";

function hashSessionId(sessionId?: string | null) {
  if (!sessionId) return null;

  const salt =
    process.env.USAGE_HASH_SECRET ||
    process.env.ORACLE_WALLET_PASSWORD ||
    "ctrlcv-usage-events";

  return createHash("sha256").update(`${salt}:${sessionId}`).digest("hex");
}

function dailyIncrementSql(eventType: UsageEventType) {
  const columns: Record<UsageEventType, string | null> = {
    session_created: "sessions_created",
    session_connected: "session_connections",
    message_sent: "messages_sent",
    image_uploaded: "images_uploaded",
    image_bytes_uploaded: "image_bytes_uploaded",
    file_uploaded: "files_uploaded",
    file_bytes_uploaded: "file_bytes_uploaded",
    api_error: "api_errors",
  };

  const column = columns[eventType];
  if (!column) return null;

  return `
    MERGE INTO usage_daily_stats d
    USING (SELECT TRUNC(CAST(SYS_EXTRACT_UTC(SYSTIMESTAMP) AS DATE)) AS stat_date FROM dual) s
    ON (d.stat_date = s.stat_date)
    WHEN MATCHED THEN UPDATE SET
      d.${column} = d.${column} + :eventValue,
      d.updated_at = SYS_EXTRACT_UTC(SYSTIMESTAMP)
    WHEN NOT MATCHED THEN INSERT (
      stat_date,
      ${column}
    ) VALUES (
      s.stat_date,
      :eventValue
    )
  `;
}

export async function recordUsageEvent(
  conn: any,
  eventType: UsageEventType,
  options: { sessionId?: string | null; value?: number } = {}
) {
  const eventValue = options.value ?? 1;

  try {
    await conn.execute(
      `
      INSERT INTO usage_events (
        event_type,
        session_id_hash,
        event_value
      )
      VALUES (
        :eventType,
        :sessionIdHash,
        :eventValue
      )
      `,
      {
        eventType,
        sessionIdHash: hashSessionId(options.sessionId),
        eventValue,
      }
    );

    const incrementSql = dailyIncrementSql(eventType);
    if (incrementSql) {
      await conn.execute(incrementSql, { eventValue });
    }

  } catch (error) {
    console.error("Failed to record usage event:", error);
  }
}
