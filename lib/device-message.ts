export interface DeviceIdentity {
  id: string
  name: string
  // Legacy wire format only; UI and ownership use name/id, not a device class.
  kind: "desktop" | "mobile"
  namingVersion?: 2
}

export interface DeviceMessage {
  id: string
  content: string
  sender_type: "desktop" | "mobile"
  sender?: DeviceIdentity
  created_at: string
}

export const DEVICE_NAME_LIMIT = 40
export const DEFAULT_DEVICE_NAME = "Device"
const DEVICE_ID_PATTERN = /^[a-f0-9]{32}$/

export function isDeviceIdentity(value: unknown): value is DeviceIdentity {
  if (!value || typeof value !== "object") return false
  const device = value as Partial<DeviceIdentity>
  return (
    typeof device.id === "string" && DEVICE_ID_PATTERN.test(device.id) &&
    typeof device.name === "string" && device.name.trim().length > 0 &&
    device.name.length <= DEVICE_NAME_LIMIT &&
    (device.kind === "desktop" || device.kind === "mobile") &&
    (device.namingVersion === undefined || device.namingVersion === 2)
  )
}

function getDeviceDisplayName(device: DeviceIdentity) {
  const wasAutomaticName = device.namingVersion !== 2 && (
    (device.kind === "desktop" && device.name === "PC") ||
    (device.kind === "mobile" && device.name === "Mobile"))
  return wasAutomaticName ? DEFAULT_DEVICE_NAME : device.name
}

export function restoreDeviceIdentity(value: unknown): DeviceIdentity | null {
  if (!isDeviceIdentity(value)) return null
  return { id: value.id, name: getDeviceDisplayName(value), kind: "desktop", namingVersion: 2 }
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
    return "Unknown device"
  }
  const label = `${getDeviceDisplayName(message.sender)} · ${message.sender.id.slice(0, 6).toUpperCase()}`
  return isOwnDeviceMessage(message, deviceId) ? "You" : label
}
