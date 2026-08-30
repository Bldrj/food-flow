"use client"

import * as React from "react"

import { BASE_UNIT_LABELS, type Material } from "@/lib/types"
import { Input } from "@/components/ui/input"

/** Хайлттай материал сонгогч — олон материалаас нэр/кодоор шүүж сонгоно */
export function MaterialPicker({
  materials,
  value,
  onChange,
}: {
  materials: Material[]
  value: string
  onChange: (id: string) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const ref = React.useRef<HTMLDivElement>(null)

  // Гаднаас өөр материал оноогдвол (жишээ нь мөрөн дээрээс нэхэмжлэл нээхэд)
  // нээлттэй үлдсэн жагсаалт/хайлтыг тэглэнэ — эс бөгөөс сонгогдсон нэр
  // харагдахгүй хоосон харагдана
  const [lastValue, setLastValue] = React.useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setOpen(false)
    setQuery("")
  }

  const selected = materials.find((m) => m.id === value)
  const q = query.trim().toLowerCase()
  const filtered = q
    ? materials.filter((m) =>
        [m.name, m.code, m.base_code]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q)),
      )
    : materials

  React.useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", onDocMouseDown)
    return () => document.removeEventListener("mousedown", onDocMouseDown)
  }, [])

  return (
    <div ref={ref} className="relative">
      <Input
        placeholder="Нэр, кодоор хайх..."
        value={open ? query : selected ? selected.name : ""}
        onFocus={() => {
          setOpen(true)
          setQuery("")
        }}
        onChange={(e) => setQuery(e.target.value)}
      />
      {open && (
        <div className="bg-popover absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border shadow-md">
          {filtered.length === 0 ? (
            <p className="text-muted-foreground p-3 text-sm">
              Илэрц олдсонгүй
            </p>
          ) : (
            filtered.slice(0, 50).map((m) => (
              <button
                key={m.id}
                type="button"
                className="hover:bg-accent flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm"
                onClick={() => {
                  onChange(m.id)
                  setOpen(false)
                }}
              >
                <span>{m.name}</span>
                <span className="text-muted-foreground shrink-0 font-mono text-xs">
                  {m.base_code ?? m.code} · {BASE_UNIT_LABELS[m.base_unit]}
                </span>
              </button>
            ))
          )}
          {filtered.length > 50 && (
            <p className="text-muted-foreground border-t p-2 text-xs">
              {filtered.length - 50} илэрц нуугдсан — хайлтаа нарийсгана уу
            </p>
          )}
        </div>
      )}
    </div>
  )
}
