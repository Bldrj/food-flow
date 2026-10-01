import { RiceProductionEditor } from '@/components/rice-production-editor'
import { Button } from '@/components/ui/button'
import { RICE_TYPES } from '@/lib/rice-production-summary'
import type { RiceDestination, RiceFlowRow, RiceActualState } from '@/lib/rice-flow'
const qty = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 3 })
export function RiceFlowSummary({ rows, onTransfer, actual, date, actor, onProductionSaved }: {
  rows: readonly RiceFlowRow[]
  actual: readonly RiceActualState[]
  date: string
  actor: string
  onProductionSaved?: () => void
  onTransfer?: (row: RiceFlowRow, destination: RiceDestination) => void
}) {
  const ready = rows.every(row => row.material)
  return <section className="space-y-3" aria-label="Будааны үйлдвэрлэл, шилжүүлэг">
    <h2 className="text-lg font-semibold">Будааны үйлдвэрлэл, шилжүүлэг</h2>
    <p className="text-sm text-muted-foreground">Технологийн картын өдрийн нийт хэрэгцээ. Өмнөх үлдэгдлийг хассан агшаах нормыг 2.25-д хувааж хуурай будааг тооцно. Шилжүүлгийг бодит агшаасан жингээр бүртгэнэ.</p>
    {!ready && <p role="alert" className="rounded-lg border border-amber-500 p-3 text-sm">Будааны 4 төрлийн холбоосыг өгөгдлийн санд хэрэгжүүлж дуусаагүй тул доорх дүнг эцсийн тооцоо гэж ашиглахгүй. Шилжүүлэх үйлдлийг түр хаасан.</p>}
    <div className="grid gap-4 lg:grid-cols-2">{rows.map((row, i) => {
      const physical = actual.find(a => a.material_id === row.material?.id)
      return <div key={row.code} className="space-y-3 rounded-lg border p-4">
      <h3 className="font-semibold">{Object.values(RICE_TYPES)[i]}</h3>
      {!row.material ? <p role="alert" className="text-sm text-amber-700">Бэлдэцийн холбоос идэвхжээгүй. Өгөгдлийн сангийн будааны засварыг хэрэгжүүлэх шаардлагатай.</p> : <>
        <div className="text-sm">
          <p>Нийт хэрэгцээ: <strong>{qty(row.grossKg)} кг</strong></p>
          <p>Өмнөх үлдэгдэл: {qty(row.leftoverKg)} кг</p>
          <p>Агшаах норм: <strong>{qty(row.cookKg)} кг</strong> · Хуурай: {qty(row.cookKg / 2.25)} кг</p>
        </div>
        {physical ? <div className="space-y-1 rounded-md bg-muted p-3 text-sm">
          <p>Эхний үлдэгдэл: {qty(Number(physical.opening_kg))} кг</p>
          <p>Бодитоор агшаасан: <strong>{qty(Number(physical.produced_kg))} кг</strong></p>
          <p>Буцаан авсан: {qty(Number(physical.returned_kg))} кг · Өгсөн: {qty(Number(physical.sent_kg))} кг · Хаягдал: {qty(Number(physical.waste_kg))} кг</p>
          <p>Халуун туслахад байгаа: <strong>{qty(Number(physical.available_kg))} кг</strong></p>
          <p>Нэмж агшаах норм: {qty(Math.max(row.required.hot + row.required.packaging - Number(physical.opening_kg) - Number(physical.produced_kg) + Number(physical.waste_kg), 0))} кг</p>
          {onProductionSaved && row.material && <RiceProductionEditor key={`${date}:${row.material.id}`} materialId={row.material.id} name={row.material.name} date={date} actor={actor} actual={physical} onSaved={onProductionSaved} />}
        </div> : <p role="alert" className="text-destructive">Бодит үлдэгдлийн мэдээлэл алга. Дахин ачаална уу.</p>}
        {(['hot', 'packaging'] as const).map(target => <div key={target} className="space-y-1 border-t pt-2 text-sm">
          <p className="font-medium">{target === 'hot' ? 'Халуун цех' : 'Савлагаа'}</p>
          <p>Хэрэгцээ {qty(row.required[target])} кг · Өгсөн {qty(row.sent[target])} кг · Хүлээн авсан {qty(row.received[target])} кг</p>
          <p>Өгөх үлдсэн: {qty(Math.max(row.required[target] - row.sent[target], 0))} кг</p>
          {row.sent[target] > row.required[target] && <p className="text-amber-700">Нормоос илүү өгсөн: {qty(row.sent[target] - row.required[target])} кг</p>}
          {onTransfer && ready && <Button size="sm" variant="outline" disabled={!physical || Number(physical.available_kg) <= 0} onClick={() => onTransfer(row, target)}>Бодит жингээр өгөх</Button>}
        </div>)}
      </>}
    </div>})}</div>
    <p className="text-xs text-muted-foreground">Бодит үлдэгдэл = эхний үлдэгдэл + агшаасан + баталгаажсан буцаалт − өгсөн − хаягдал. “Өгөх үлдсэн” нь нормын үлдсэн хэрэгцээ.</p>
  </section>
}
