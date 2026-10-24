"use client"

import { useEffect, useState } from "react"
import { DEFAULT_DEVICE_NAME, DEVICE_NAME_LIMIT, restoreDeviceIdentity, type DeviceIdentity } from "@/lib/device-message"

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
        currentDevice = restoreDeviceIdentity(JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"))
      } catch {}
      if (!currentDevice) {
        currentDevice = {
          id: Array.from(crypto.getRandomValues(new Uint8Array(16)),
            (byte) => byte.toString(16).padStart(2, "0")).join(""),
          name: DEFAULT_DEVICE_NAME,
          // Compatibility with the existing database and encrypted message format.
          kind: "desktop",
          namingVersion: 2,
        }
      }
      persist(currentDevice)
    }
    setDevice(currentDevice)
    listeners.add(setDevice)
    const syncStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return
      try {
        const stored = restoreDeviceIdentity(JSON.parse(event.newValue || "null"))
        if (stored) publish(stored)
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
    const updated = { ...currentDevice, name: name.trim().slice(0, DEVICE_NAME_LIMIT) || DEFAULT_DEVICE_NAME }
    persist(updated)
    publish(updated)
  }

  return { device, renameDevice }
}
