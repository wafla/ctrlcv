"use client"

import { useEffect, useState } from "react"
import { DEVICE_NAME_LIMIT, isDeviceIdentity, type DeviceIdentity } from "@/lib/device-message"

const STORAGE_KEY = "ctrlcv:device:v1"
let currentDevice: DeviceIdentity | null = null
const listeners = new Set<(device: DeviceIdentity) => void>()

function publish(device: DeviceIdentity) {
  currentDevice = device
  listeners.forEach((listener) => listener(device))
}

function persist(device: DeviceIdentity) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(device))
  } catch {
    // Restricted storage still gets a stable identity for this page's lifetime.
  }
}

export function useDeviceIdentity() {
  const [device, setDevice] = useState<DeviceIdentity | null>(null)

  useEffect(() => {
    if (!currentDevice) {
      try {
        const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null")
        if (isDeviceIdentity(stored)) currentDevice = stored
      } catch {}
      if (!currentDevice) {
        const kind = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
          (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
          ? "mobile" : "desktop"
        currentDevice = {
          id: Array.from(crypto.getRandomValues(new Uint8Array(16)),
            (byte) => byte.toString(16).padStart(2, "0")).join(""),
          name: kind === "mobile" ? "Mobile" : "PC",
          kind,
        }
        persist(currentDevice)
      }
    }
    setDevice(currentDevice)
    listeners.add(setDevice)
    const syncStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return
      try {
        const stored: unknown = JSON.parse(event.newValue || "null")
        if (isDeviceIdentity(stored)) publish(stored)
      } catch {}
    }
    window.addEventListener("storage", syncStorage)
    return () => {
      listeners.delete(setDevice)
      window.removeEventListener("storage", syncStorage)
    }
  }, [])

  const renameDevice = (name: string) => {
    if (!currentDevice) return
    const updated = { ...currentDevice, name: name.trim().slice(0, DEVICE_NAME_LIMIT) ||
      (currentDevice.kind === "mobile" ? "Mobile" : "PC") }
    persist(updated)
    publish(updated)
  }

  return { device, renameDevice }
}
