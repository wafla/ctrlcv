// app/page.tsx
import { Suspense } from "react"
import HomeClient from "./HomeClient"

export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Loading...</div>}>
      <HomeClient />
    </Suspense>
  )
}
