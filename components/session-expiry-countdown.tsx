"use client"

import { useEffect, useMemo, useState } from "react"

function getRemainingMs(expiresAt: string) {
  const timestamp = new Date(expiresAt).getTime()
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : 0
}

function formatRemainingTime(remainingMs: number) {
  const totalSeconds = Math.ceil(remainingMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":")
}

export function SessionExpiryCountdown({ expiresAt }: { expiresAt: string }) {
  const [remainingMs, setRemainingMs] = useState(() => getRemainingMs(expiresAt))

  useEffect(() => {
    const updateRemaining = () => setRemainingMs(getRemainingMs(expiresAt))
    updateRemaining()
    const interval = window.setInterval(updateRemaining, 1000)
    return () => window.clearInterval(interval)
  }, [expiresAt])

  const isExpired = remainingMs <= 0
  const isExpiringSoon = remainingMs > 0 && remainingMs <= 10 * 60 * 1000
  const containerClass = useMemo(() => {
    if (isExpired) return "border-destructive/40 bg-destructive/10 text-destructive"
    if (isExpiringSoon) return "border-amber-500/40 bg-amber-500/10 text-amber-700"
    return "border-border bg-muted/30 text-foreground"
  }, [isExpired, isExpiringSoon])

  return (
    <div className={`rounded-md border px-3 py-2 text-center ${containerClass}`}>
      <p className="text-sm font-medium" aria-live="polite">
        {isExpired
          ? "Session expired"
          : `Session expires in ${formatRemainingTime(remainingMs)}`}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Sending a message resets the expiration time to 2 hours.
      </p>
    </div>
  )
}
