// Unknown capacity is not a 10 MB limit. Upload initialization remains the
// authority when this advisory request fails or has not finished yet.
export async function fetchUploadLimit(
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<number> {
  const response = await fetcher("/api/files", {
    cache: "no-store",
    redirect: "error",
    signal,
  })
  if (!response.ok || response.redirected) {
    throw new Error("Could not check the upload limit.")
  }
  const data: unknown = await response.json()
  const maxFileSize = data && typeof data === "object"
    ? (data as { maxFileSize?: unknown }).maxFileSize
    : undefined
  if (typeof maxFileSize !== "number" || !Number.isSafeInteger(maxFileSize) || maxFileSize < 0) {
    throw new Error("The server returned an invalid upload limit.")
  }
  return maxFileSize
}
