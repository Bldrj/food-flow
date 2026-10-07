"use client"

// Цехийн дэлгэцийн бүтэн дэлгэцийн заавар (таблетад зориулсан): нэг удаад
// нэг алхам — том зураг, том текст, Өмнөх/Дараах том товч, swipe, сумны
// товч. Нэмэлт: доод талд алхмын thumbnail зурвас (шууд үсрэх), «Орц»
// хажуу самбар (зааврыг хаалгүй хэмжээ харах), зураг дээр дарвал бүтэн
// дэлгэц, дэлгэц унтрахаас сэргийлэх Wake Lock, сүүлд үзсэн алхмыг санах.

import * as React from "react"

import type { TechCardStationStep } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { ImageLightbox } from "@/components/image-uploader"
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ListIcon,
  XIcon,
} from "lucide-react"

export type StepViewerIngredient = {
  group: string
  name: string
  qty: string
}

type Props = {
  title: string
  subtitle?: string
  steps: TechCardStationStep[]
  initialIndex?: number
  /** Орцын жагсаалт (энэ цехийн ажлын мөрүүд) — «Орц» самбарт гарна */
  ingredients?: StepViewerIngredient[]
  /** Сүүлд үзсэн алхмыг sessionStorage-д хадгалах түлхүүр (батч тус бүр) */
  storageKey?: string
  onClose: () => void
}

function readSaved(key: string | undefined): number | null {
  if (!key) return null
  try {
    const v = sessionStorage.getItem(`step-viewer:${key}`)
    return v === null ? null : Number(v)
  } catch {
    return null
  }
}

function writeSaved(key: string | undefined, idx: number) {
  if (!key) return
  try {
    sessionStorage.setItem(`step-viewer:${key}`, String(idx))
  } catch {
    // private горим гэх мэт — чимээгүй алгасна
  }
}

export function StepViewer({
  title,
  subtitle,
  steps,
  initialIndex,
  ingredients = [],
  storageKey,
  onClose,
}: Props) {
  const last = Math.max(steps.length - 1, 0)
  const clamp = (n: number) => Math.min(Math.max(n, 0), last)
  const [idx, setIdx] = React.useState(() =>
    clamp(initialIndex ?? readSaved(storageKey) ?? 0),
  )
  // Нэг алхамд олон зураг байвал аль нь том харагдаж байгаа вэ
  const [imgIdx, setImgIdx] = React.useState(0)
  const [lightbox, setLightbox] = React.useState<string | null>(null)
  const [showIngredients, setShowIngredients] = React.useState(false)
  // Шилжилтийн чиглэл — анимацийн тулд
  const [dir, setDir] = React.useState<1 | -1>(1)
  const touchStart = React.useRef<{ x: number; y: number } | null>(null)
  const stripRef = React.useRef<HTMLDivElement>(null)

  const step = steps[idx]

  const go = React.useCallback(
    (next: number) => {
      if (next < 0 || next > last || next === idx) return
      setDir(next > idx ? 1 : -1)
      setIdx(next)
      setImgIdx(0)
    },
    [idx, last],
  )

  // Сүүлд үзсэн алхмаа санана — тасалдаад буцаж ормогц үргэлжилнэ
  React.useEffect(() => {
    writeSaved(storageKey, idx)
  }, [storageKey, idx])

  // Доод зурвас дээрх идэвхтэй алхмыг харагдах хэсэгт гүйлгэнэ
  React.useEffect(() => {
    const el = stripRef.current?.children[idx] as HTMLElement | undefined
    el?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" })
  }, [idx])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (lightbox) return
      if (e.key === "Escape") onClose()
      else if (e.key === "ArrowRight" || e.key === " ") go(idx + 1)
      else if (e.key === "ArrowLeft") go(idx - 1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [idx, go, onClose, lightbox])

  // Дэлгэцийн ард гүйлгэхээс сэргийлнэ
  React.useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // Таблетын дэлгэц хоол хийх явцад унтрахгүй (дэмждэг browser дээр)
  React.useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null
    const nav = navigator as Navigator & {
      wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> }
    }
    nav.wakeLock?.request("screen").then(
      (l) => {
        lock = l
      },
      () => {},
    )
    return () => {
      void lock?.release()
    }
  }, [])

  if (!step) return null

  const images = step.image_urls
  const hero = images[imgIdx] ?? images[0]

  // Орцыг бүлгээр
  const ingGroups = new Map<string, StepViewerIngredient[]>()
  for (const ing of ingredients) {
    const list = ingGroups.get(ing.group) ?? []
    list.push(ing)
    ingGroups.set(ing.group, list)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background"
      onTouchStart={(e) => {
        const t = e.touches[0]
        touchStart.current = t ? { x: t.clientX, y: t.clientY } : null
      }}
      onTouchEnd={(e) => {
        const start = touchStart.current
        touchStart.current = null
        const t = e.changedTouches[0]
        if (!start || !t) return
        const dx = t.clientX - start.x
        const dy = t.clientY - start.y
        // Босоо гүйлгэлтийг swipe гэж андуурахгүй
        if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx)) return
        if (dx < 0) go(idx + 1)
        else go(idx - 1)
      }}
    >
      {/* Толгой */}
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{title}</p>
          {subtitle && (
            <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {ingredients.length > 0 && (
            <Button
              variant={showIngredients ? "default" : "outline"}
              size="lg"
              onClick={() => setShowIngredients((v) => !v)}
            >
              <ListIcon />
              Орц
            </Button>
          )}
          <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium tabular-nums">
            {idx + 1} / {steps.length}
          </span>
          <Button variant="outline" size="icon-lg" onClick={onClose}>
            <XIcon />
            <span className="sr-only">Хаах</span>
          </Button>
        </div>
      </div>

      {/* Явцын зураас */}
      <div className="flex gap-1 px-4 pt-3">
        {steps.map((s, i) => (
          <button
            key={s.id}
            type="button"
            aria-label={`${i + 1}-р алхам`}
            onClick={() => go(i)}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= idx ? "bg-primary" : "bg-muted"
            }`}
          />
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Агуулга: зураг (байвал) + текст. Хэвтээ таблетад зэрэгцээ,
            босоо дээр зураг дээр, текст доор. key=idx → алхам солигдоход
            шинээр орж ирэх анимаци */}
        <div
          key={idx}
          className={`flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 duration-200 animate-in fade-in md:flex-row md:items-stretch ${
            dir > 0 ? "slide-in-from-right-4" : "slide-in-from-left-4"
          }`}
        >
          {hero && (
            <div className="flex min-h-0 flex-col gap-2 md:w-1/2 md:shrink-0">
              <button
                type="button"
                className="min-h-0 md:flex-1"
                onClick={() => setLightbox(hero)}
                title="Томруулж үзэх"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={hero}
                  alt=""
                  className="max-h-[42vh] w-full rounded-lg bg-muted object-contain md:max-h-full md:h-full"
                />
              </button>
              {images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto">
                  {images.map((u, i) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setImgIdx(i)}
                      className={`size-16 shrink-0 overflow-hidden rounded-md border-2 ${
                        i === imgIdx ? "border-primary" : "border-transparent"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u} alt="" className="size-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div
            className={`flex flex-1 flex-col gap-3 ${
              hero ? "" : "mx-auto max-w-3xl justify-center"
            }`}
          >
            <span className="flex size-12 items-center justify-center rounded-full bg-primary text-xl font-bold text-primary-foreground">
              {idx + 1}
            </span>
            <p
              className={`whitespace-pre-line leading-relaxed ${
                hero ? "text-2xl" : "text-3xl"
              }`}
            >
              {step.text || "—"}
            </p>
          </div>
        </div>

        {/* Орцын самбар: энэ цехийн ажлын мөрүүд бүлгээр, хэмжээтэй */}
        {showIngredients && ingredients.length > 0 && (
          <aside className="w-80 shrink-0 overflow-y-auto border-l bg-muted/30 p-4">
            <p className="mb-3 text-sm font-medium text-muted-foreground">
              Орц · энэ цехийн ажил
            </p>
            <div className="grid gap-4">
              {[...ingGroups.entries()].map(([group, list]) => (
                <div key={group}>
                  <p className="mb-1 text-sm font-medium">{group}</p>
                  <div className="grid gap-1">
                    {list.map((ing, i) => (
                      <p
                        key={i}
                        className="flex items-center justify-between gap-2 border-b py-1 text-base last:border-b-0"
                      >
                        <span>{ing.name}</span>
                        <span className="font-semibold tabular-nums">
                          {ing.qty}
                        </span>
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        )}
      </div>

      {/* Алхмын зурвас: дугаар + thumbnail, дарвал шууд үсэрнэ */}
      {steps.length > 1 && (
        <div
          ref={stripRef}
          className="flex gap-2 overflow-x-auto border-t px-4 py-2"
        >
          {steps.map((s, i) => {
            const active = i === idx
            const done = i < idx
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => go(i)}
                className={`flex h-14 shrink-0 items-center gap-2 rounded-lg border px-2 transition-colors ${
                  active
                    ? "border-primary bg-primary/10"
                    : done
                      ? "border-transparent bg-muted text-muted-foreground"
                      : "hover:bg-muted"
                }`}
              >
                <span
                  className={`flex size-7 items-center justify-center rounded-full text-sm font-semibold ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : done
                        ? "bg-emerald-500 text-white"
                        : "bg-muted text-foreground"
                  }`}
                >
                  {done ? <CheckIcon className="size-4" /> : i + 1}
                </span>
                {s.image_urls[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={s.image_urls[0]}
                    alt=""
                    className="size-10 rounded object-cover"
                  />
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Доод товчнууд: хуруугаар амархан дарахаар том */}
      <div className="grid grid-cols-2 gap-3 border-t p-4">
        <Button
          variant="outline"
          className="h-14 text-lg"
          disabled={idx === 0}
          onClick={() => go(idx - 1)}
        >
          <ChevronLeftIcon className="size-6" />
          Өмнөх
        </Button>
        {idx === last ? (
          <Button className="h-14 text-lg" onClick={onClose}>
            <CheckIcon className="size-6" />
            Дууслаа, хаах
          </Button>
        ) : (
          <Button className="h-14 text-lg" onClick={() => go(idx + 1)}>
            Дараах
            <ChevronRightIcon className="size-6" />
          </Button>
        )}
      </div>

      {lightbox && (
        <ImageLightbox url={lightbox} onClose={() => setLightbox(null)} />
      )}
    </div>
  )
}
