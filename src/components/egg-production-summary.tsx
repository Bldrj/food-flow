import { eggProductionSummary, eggTransferSummary, EGG_GRAMS_PER_PIECE } from "@/lib/egg-production-summary"
import type { RiceBatch } from "@/lib/rice-production-summary"
import type { Material, StationTransfer } from "@/lib/types"
import { Button } from "@/components/ui/button"

const qty = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 3 })
export function EggProductionSummary({ batches, transfers, materials, transferError, onTransfer }: {
  batches: readonly RiceBatch[]; transfers: readonly StationTransfer[]; materials: readonly Material[]
  transferError: boolean; onTransfer?: () => void
}) {
  const summary = eggProductionSummary(batches)
  const actual = eggTransferSummary(transfers, materials)
  const remaining = Math.max(0, summary.hotKg - actual.normKg)
  return (
    <section className="space-y-4" aria-label="Өндөг бэлтгэлийн нэгтгэл">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Өндөг бэлтгэл — өдрийн хэрэгцээ</h2>
          <p className="text-sm text-muted-foreground">Тухайн өдрийн хийгдэж буй болон дууссан хоол · Халуун туслахын Excel норм · Түүхий өндөгний жин</p>
        </div>
        {onTransfer && <Button onClick={onTransfer}>Халуун цехэд өндөг өгөх</Button>}
      </div>
      {summary.unknown.length > 0 && <p role="alert" className="text-amber-600">Өндөгний норм шалгах: {summary.unknown.join(", ")}. Нийлбэрт оруулаагүй.</p>}
      <div className="rounded-lg border p-4">
        <p>Нийт түүхий өндөг: <strong>{qty(summary.totalKg)} кг</strong></p>
        <p className="text-sm text-muted-foreground">{EGG_GRAMS_PER_PIECE} г / ширхэгийн нормоор {qty(summary.totalKg * 1000 / EGG_GRAMS_PER_PIECE)} ш-тэй тэнцэнэ. Бэлэн омлет, пуддингийн жинг үүнд нэмэхгүй.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {(["hot_aux", "hot"] as const).map(station => (
          <div className="rounded-lg border" key={station}>
            <div className="border-b p-4">
              <h3 className="font-semibold">{station === "hot_aux" ? "Халуун туслахад ашиглах" : "Халуун цехэд өгөх"}</h3>
              <p>{qty(station === "hot_aux" ? summary.hotAuxKg : summary.hotKg)} кг түүхий өндөг</p>
            </div>
            <div className="divide-y px-4">
              {!summary.rows.some(r => r.station === station) && <p className="py-4 text-sm text-muted-foreground">Энэ өдөрт хэрэгцээ алга</p>}
              {summary.rows.filter(r => r.station === station).map(row => (
                <div className="py-3 text-sm" key={row.key}>
                  <p className="font-medium">{row.food} · {row.use}</p>
                  <p>{qty(row.portions)} порц × {qty(row.grams)} г = {qty(row.rawKg)} кг түүхий өндөг</p>
                  {row.readyKg !== null && <p className="text-muted-foreground">Бэлэн бүтээгдэхүүний норм: {qty(row.readyKg)} кг</p>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-1 rounded-lg border p-4 text-sm">
        <h3 className="font-semibold">Халуун туслах → Халуун: бүртгэсэн шилжилт</h3>
        {transferError ? <p role="alert" className="text-destructive">Шилжилтийн мэдээлэл уншиж чадсангүй. Өгсөн, үлдсэн хэмжээг баталгаажуулах боломжгүй.</p> : <>
          <p>Өгсөнөөс буцаалтыг хассан: {qty(actual.pieces)} ш өндөг · {qty(actual.litres)} л шингэн өндөг</p>
          <p className="text-muted-foreground">Ширхэгийн өндөг {EGG_GRAMS_PER_PIECE} г/ш нормоор {qty(actual.normKg)} кг-тэй тэнцэнэ; жинлэсэн бодит кг биш.</p>
          {actual.litres !== 0 ? <p className="text-amber-600">Шингэн өндөгний л → кг хөрвүүлэлт баталгаажаагүй тул өгөх үлдэгдлийг кг-аар тооцоогүй.</p>
            : <p>Өгөх үлдсэн норм: <strong>{qty(remaining)} кг</strong>{actual.normKg > summary.hotKg && ` · Нормоос илүү: ${qty(actual.normKg-summary.hotKg)} кг`}</p>}
        </>}
        <p className="text-muted-foreground">Хоол тус бүрээр өгсөн хэмжээ бүртгэгддэггүй. Энэ нь цехийн нийт шилжилт; агуулахын үлдэгдэл биш.</p>
      </div>
    </section>
  )
}
