"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { Info } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

// Hover or focus for a quick explanation; click/tap to keep it open.
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const pinned = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const clearTimer = () => clearTimeout(timer.current)
  const show = () => { clearTimer(); setOpen(true) }
  const hide = () => {
    clearTimer()
    if (!pinned.current) timer.current = setTimeout(() => setOpen(false), 150)
  }
  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <Popover open={open} onOpenChange={(next) => {
      clearTimer()
      if (!next) pinned.current = false
      setOpen(next)
    }}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={label}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onPointerEnter={(event) => { if (event.pointerType !== "touch") show() }}
          onPointerLeave={hide}
          onFocus={show}
          onBlur={hide}
          onClick={(event) => {
            event.preventDefault()
            clearTimer()
            pinned.current = !pinned.current
            setOpen(pinned.current)
          }}>
          <Info className="size-3.5" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent aria-label={label} side="top" sideOffset={6}
        className="max-w-[calc(100vw-2rem)] p-3 text-xs leading-relaxed text-popover-foreground"
        onPointerEnter={clearTimer} onPointerLeave={hide}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}>
        {children}
      </PopoverContent>
    </Popover>
  )
}
