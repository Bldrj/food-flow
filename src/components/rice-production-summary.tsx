import { riceProductionSummary, RICE_YIELD, type RiceBatch } from "@/lib/rice-production-summary"

const qty = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 3 })

export function RiceProductionSummary({ batches }: { batches: readonly RiceBatch[] }) {
  const { groups, pending, unknown } = riceProductionSummary(batches)
  return (
    <section className="space-y-4" aria-label="Будаа агшаалгын нэгтгэл">
      <div>
        <h2 className="text-lg font-semibold">Будаа агшаалга — өдрийн хэрэгцээ</h2>
        <p className="text-sm text-muted-foreground">
          Тухайн өдрийн хийгдэж буй болон дууссан хоол · Халуун туслахын Excel норм · 1 кг хуурай → {RICE_YIELD} кг агшаасан будаа
        </p>
        <p className="text-sm text-muted-foreground">
          Үлдэгдэл болон өнөөдөр агшаасан хэмжээг хасаагүй нийт хэрэгцээ.
        </p>
      </div>
      {unknown.length > 0 && (
        <p role="alert" className="rounded-lg border border-amber-500 p-3 text-sm">
          Будааны норм шалгах хоол: {[...new Set(unknown)].join(", ")}. Эдгээрийг нийлбэрт оруулаагүй.
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map(group => (
          <div key={group.type} className="rounded-lg border">
            <div className="space-y-1 border-b p-4">
              <h3 className="font-semibold">{group.name}</h3>
              <p>Агшаасан: <strong>{qty(group.cookedKg)} кг</strong></p>
              <p className="text-sm text-muted-foreground">Хуурай будаа: {qty(group.dryKg)} кг</p>
            </div>
            <div className="divide-y px-4">
              {group.details.length === 0 && <p className="py-4 text-sm text-muted-foreground">Энэ өдөрт хэрэгцээ алга</p>}
              {group.details.map(row => (
                <div key={row.key} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
                  <div>
                    <p>{row.food}{row.use ? ` · ${row.use}` : ""}</p>
                    <p className="text-muted-foreground">{qty(row.portions)} порц × {qty(row.gramsPerPortion)} г</p>
                  </div>
                  <span className="font-medium">{qty(row.cookedKg)} кг</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {pending.length > 0 && (
        <div className="rounded-lg border border-amber-500 p-4 text-sm">
          <p className="font-medium">Ояакодон — хэмжээ, будааны төрлийг баталгаажуулах</p>
          <p>Дөрвөн төрлийн нийлбэрт оруулаагүй. Одоогийн түр норм: 350 г / порц.</p>
          {pending.map(row => <p key={row.key}>{qty(row.portions)} порц: {qty(row.cookedKg)} кг агшаасан · {qty(row.cookedKg / RICE_YIELD)} кг хуурай</p>)}
        </div>
      )}
    </section>
  )
}
