"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

// Keep old QR/invitation URLs working, including the private key in the hash.
export default function LegacySessionPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace(`/${window.location.search}${window.location.hash}`)
  }, [router])

  return <div className="p-4 text-center">Connecting...</div>
}
