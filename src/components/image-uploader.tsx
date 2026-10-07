"use client"

// Зураг хуулах/харуулах нийтлэг хэсэг (migration 0033). Нэг (материал)
// эсвэл олон (цехийн заавар) зурагтай ажиллана: thumbnail жагсаалт + нэмэх
// товч + мөр бүр дээр устгах. Хуулах явцад Storage руу шууд бичиж,
// URL-уудаа onChange-аар эцэг рүү дамжуулна — DB-д хадгалах нь эцгийн ажил.

import * as React from "react"
import { createPortal } from "react-dom"

import { createClient } from "@/lib/supabase/client"
import { removeImage, uploadImage, type ImageBucket } from "@/lib/upload-image"

import { Button } from "@/components/ui/button"
import { ImagePlusIcon, Loader2Icon, XIcon } from "lucide-react"

type Props = {
  bucket: ImageBucket
  /** bucket доторх хавтас (материалын id, ТК-ийн id гэх мэт) */
  prefix: string
  urls: string[]
  onChange: (urls: string[]) => void
  /** 1 = ганц зураг (шинэ зураг хуучныг солино) */
  max?: number
  /** thumbnail-ийн хэмжээ */
  size?: "xs" | "sm" | "md"
  disabled?: boolean
}

export function ImageUploader({
  bucket,
  prefix,
  urls,
  onChange,
  max,
  size = "md",
  disabled,
}: Props) {
  const supabase = React.useMemo(() => createClient(), [])
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [preview, setPreview] = React.useState<string | null>(null)

  const single = max === 1
  const canAdd = !disabled && (max === undefined || urls.length < max || single)

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    setError(null)
    try {
      const list = Array.from(files)
      const limit =
        max === undefined ? list.length : Math.max(0, max - (single ? 0 : urls.length))
      const uploaded: string[] = []
      for (const f of list.slice(0, Math.max(limit, single ? 1 : 0))) {
        uploaded.push(await uploadImage(supabase, bucket, prefix, f))
      }
      if (single) {
        // Хуучин зургийг Storage-оос цэвэрлэнэ
        for (const old of urls) void removeImage(supabase, bucket, old)
        onChange(uploaded.slice(-1))
      } else {
        onChange([...urls, ...uploaded])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  async function remove(url: string) {
    onChange(urls.filter((u) => u !== url))
    void removeImage(supabase, bucket, url)
  }

  const box = size === "xs" ? "size-10" : size === "sm" ? "size-16" : "size-28"

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        {urls.map((u) => (
          <div key={u} className={`group relative ${box} rounded-md border bg-muted`}>
            <button
              type="button"
              className="size-full overflow-hidden rounded-md"
              onClick={() => setPreview(u)}
              title="Томруулж үзэх"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" className="size-full object-cover" />
            </button>
            {!disabled && (
              <button
                type="button"
                className={`absolute rounded-full bg-black/60 text-white opacity-80 hover:opacity-100 ${size === "xs" ? "-top-1 -right-1 p-0.5" : "top-0.5 right-0.5 p-0.5"}`}
                title="Зураг устгах"
                onClick={() => remove(u)}
              >
                <XIcon className="size-3.5" />
                <span className="sr-only">Устгах</span>
              </button>
            )}
          </div>
        ))}
        {canAdd && (
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className={`flex ${box} flex-col items-center justify-center gap-1 rounded-md border border-dashed text-xs text-muted-foreground hover:bg-muted disabled:opacity-50`}
          >
            {uploading ? (
              <Loader2Icon className="size-5 animate-spin" />
            ) : (
              <ImagePlusIcon className="size-5" />
            )}
            {size !== "xs" &&
              (uploading ? "Хуулж байна" : single && urls.length > 0 ? "Солих" : "Зураг")}
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={!single}
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      {preview && <ImageLightbox url={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}

/** Зургийг бүтнээр нь харуулах энгийн overlay — цехийн дэлгэц дээр ч ашиглана.
 *  body руу portal-ддог: thumbnail <p>/<button> дотор байсан ч <div> overlay
 *  HTML-ийн хувьд зөв байрлана (hydration алдаа гарахгүй) */
export function ImageLightbox({
  url,
  onClose,
}: {
  url: string
  onClose: () => void
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])
  if (typeof document === "undefined") return null
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        className="max-h-full max-w-full rounded-md object-contain"
        onClick={(e) => e.stopPropagation()}
      />
      <Button
        variant="secondary"
        size="icon-sm"
        className="absolute top-3 right-3"
        onClick={onClose}
      >
        <XIcon />
        <span className="sr-only">Хаах</span>
      </Button>
    </div>,
    document.body,
  )
}

/** Ганц зургийн thumbnail — дарвал томорно. Мөр дээр дарах өөр үйлдэлтэй
 *  (жишээ нь агуулахын дэлгэрэнгүй) хүснэгтэд ч ашиглахаар click-ээ
 *  дээшээ дамжуулдаггүй */
export function ImageThumb({
  url,
  size = "md",
  className = "",
}: {
  url: string | null | undefined
  size?: "sm" | "md" | "lg"
  className?: string
}) {
  const [preview, setPreview] = React.useState(false)
  if (!url) return null
  const box = size === "sm" ? "size-8" : size === "lg" ? "size-14" : "size-10"
  return (
    <>
      <button
        type="button"
        className={`${box} shrink-0 overflow-hidden rounded-md border bg-muted ${className}`}
        onClick={(e) => {
          e.stopPropagation()
          setPreview(true)
        }}
        title="Томруулж үзэх"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" className="size-full object-cover" />
      </button>
      {preview && <ImageLightbox url={url} onClose={() => setPreview(false)} />}
    </>
  )
}

/** Зөвхөн харуулах thumbnail мөр (цехийн дэлгэц) — дарвал томорно */
export function ImageStrip({
  urls,
  size = "md",
}: {
  urls: string[]
  size?: "sm" | "md" | "lg"
}) {
  const [preview, setPreview] = React.useState<string | null>(null)
  if (urls.length === 0) return null
  const box = size === "sm" ? "size-16" : size === "lg" ? "size-40" : "size-28"
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {urls.map((u) => (
          <button
            key={u}
            type="button"
            className={`${box} overflow-hidden rounded-md border bg-muted`}
            onClick={() => setPreview(u)}
            title="Томруулж үзэх"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt="" className="size-full object-cover" />
          </button>
        ))}
      </div>
      {preview && <ImageLightbox url={preview} onClose={() => setPreview(null)} />}
    </>
  )
}
