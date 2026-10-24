"use client"

import { useEffect, useId, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { InfoTip } from "@/components/info-tip"
import { DEVICE_NAME_LIMIT, type DeviceIdentity } from "@/lib/device-message"

export function DeviceNameInput({ device, onRename }: {
  device: DeviceIdentity | null
  onRename: (name: string) => void
}) {
  const id = useId()
  const [name, setName] = useState("")
  useEffect(() => setName(device?.name || ""), [device?.name])

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={id} className="shrink-0">Device</Label>
      <Input id={id} value={name} maxLength={DEVICE_NAME_LIMIT}
        disabled={!device} placeholder="Office PC" className="min-w-0"
        onChange={(event) => setName(event.target.value)}
        onBlur={() => {
          const savedName = name.trim() || (device?.kind === "mobile" ? "Mobile" : "PC")
          setName(savedName)
          onRename(savedName)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            event.currentTarget.blur()
          }
        }} />
      <InfoTip label="About device names">
        This name identifies your messages and is saved in this browser.
        {device && <span className="mt-1 block font-mono">
          Device ID: {device.id.slice(0, 6).toUpperCase()}
        </span>}
      </InfoTip>
    </div>
  )
}
