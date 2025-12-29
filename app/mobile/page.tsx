// app/mobile/page.tsx
import { Suspense } from "react"
import MobileClient from "./MobileClient"

export default function Page() {
  return (
    <Suspense fallback={<div className="p-4 text-center">Loading...</div>}>
      <MobileClient />
    </Suspense>
  )
}
