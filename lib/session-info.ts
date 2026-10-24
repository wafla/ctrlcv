export interface SessionInfo {
  sessionId: string
  sessionCode: string
  expiresAt: string
  requiresKey: boolean
}

export function createSessionInviteUrl(
  origin: string,
  session: Pick<SessionInfo, "sessionCode" | "requiresKey">,
  keyParam?: string | null
) {
  const url = new URL("/", origin)
  url.searchParams.set("code", session.sessionCode)
  if (session.requiresKey) {
    if (!keyParam || !/^\d{8}$/.test(keyParam)) {
      throw new Error("The session's encryption key is missing.")
    }
    url.hash = new URLSearchParams({ key: keyParam }).toString()
  }
  return url.toString()
}
