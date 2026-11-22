/** Shrinks a picked image so it fits inside a Firestore document next to the text. */
export async function imageToDataUrl(file: File): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file)
    for (const [edge, quality] of [[1280, 0.8], [960, 0.7], [720, 0.6]] as const) {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement("canvas")
      canvas.width = Math.round(bitmap.width * scale)
      canvas.height = Math.round(bitmap.height * scale)
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const url = canvas.toDataURL("image/jpeg", quality)
      if (url.length < 350_000) return url
    }
    return null
  } catch (error) {
    console.warn("Image could not be read", error)
    return null
  }
}
