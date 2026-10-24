export interface DeviceIdentity {
  id: string
  name: string
  kind: "desktop" | "mobile"
}

export interface DeviceMessage {
  id: string
  content: string
  sender_type: "desktop" | "mobile"
  sender?: DeviceIdentity
  created_at: string
}

export const DEVICE_NAME_LIMIT = 40
const DEVICE_ID_PATTERN = /^[a-f0-9]{32}$/

export function isDeviceIdentity(value: unknown): value is DeviceIdentity {
  if (!value || typeof value !== "object") return false
  const device = value as Partial<DeviceIdentity>
  return (
    typeof device.id === "string" && DEVICE_ID_PATTERN.test(device.id) &&
    typeof device.name === "string" && device.name.trim().length > 0 &&
    device.name.length <= DEVICE_NAME_LIMIT &&
    (device.kind === "desktop" || device.kind === "mobile")
  )
}

// Keep sender metadata inside the encrypted content, without a database migration.
export function encodeDeviceMessage(content: string, sender: DeviceIdentity) {
  return JSON.stringify({ ctrlcvMessageVersion: 1, content, sender })
}

export function decodeDeviceMessage(content: string): {
  content: string
  sender?: DeviceIdentity
} {
  try {
    const value = JSON.parse(content)
    if (
      value?.ctrlcvMessageVersion === 1 &&
      typeof value.content === "string" && isDeviceIdentity(value.sender)
    ) {
      return { content: value.content, sender: value.sender }
    }
  } catch {
    // Older plain text and attachment messages have no device metadata.
  }
  return { content }
}

export function isOwnDeviceMessage(message: DeviceMessage, deviceId?: string) {
  return Boolean(deviceId && message.sender?.id === deviceId)
}

export function getSenderLabel(message: DeviceMessage, deviceId?: string) {
  if (!message.sender) {
    return message.sender_type === "desktop" ? "PC (legacy)" : "Mobile (legacy)"
  }
  const label = `${message.sender.name} · ${message.sender.id.slice(0, 6).toUpperCase()}`
  return isOwnDeviceMessage(message, deviceId) ? "You" : label
}
