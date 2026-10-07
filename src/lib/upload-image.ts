// Зураг Supabase Storage руу хуулах (migration 0033: material-images,
// tech-card-images public bucket-ууд). Гар утасны камерын 3–8 МБ зургийг
// bucket-ийн 5 МБ хязгаарт багтааж, цехийн дэлгэц хурдан ачаалдаг байхаар
// клиент талд урьдчилан багасгана (урт тал ≤ MAX_EDGE px, JPEG).

import type { SupabaseClient } from "@supabase/supabase-js"

export type ImageBucket = "material-images" | "tech-card-images"

const MAX_EDGE = 1600
const JPEG_QUALITY = 0.85
// Энэ хэмжээнээс бага бол шахахгүй шууд хуулна
const SKIP_RESIZE_BYTES = 600 * 1024

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Зураг уншиж чадсангүй"))
    }
    img.src = url
  })
}

/** Том зургийг canvas-аар багасгаж JPEG болгоно; жижиг бол хэвээр буцаана */
export async function compressImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Зөвхөн зургийн файл хуулна")
  }
  if (file.size <= SKIP_RESIZE_BYTES && file.type !== "image/heic") {
    return file
  }
  const img = await loadImage(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) return file
  ctx.drawImage(img, 0, 0, w, h)
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  )
  return blob ?? file
}

/** Зургийг багасгаад bucket-ийн prefix хавтаст хуулж, public URL буцаана */
export async function uploadImage(
  supabase: SupabaseClient,
  bucket: ImageBucket,
  prefix: string,
  file: File,
): Promise<string> {
  const blob = await compressImage(file)
  const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg"
  const path = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: false })
  if (error) throw new Error(error.message)
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}

/** Public URL-аас bucket доторх замыг салгана (устгахад) */
export function storagePathFromUrl(
  url: string,
  bucket: ImageBucket,
): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`
  const i = url.indexOf(marker)
  if (i < 0) return null
  return decodeURIComponent(url.slice(i + marker.length))
}

/** Storage-оос файлыг устгана; алдаа гарвал чимээгүй алгасна (DB-ийн
 *  холбоос аль хэдийн хасагдсан тул хоцорсон файл хор хөнөөлгүй) */
export async function removeImage(
  supabase: SupabaseClient,
  bucket: ImageBucket,
  url: string,
): Promise<void> {
  const path = storagePathFromUrl(url, bucket)
  if (!path) return
  await supabase.storage.from(bucket).remove([path])
}
