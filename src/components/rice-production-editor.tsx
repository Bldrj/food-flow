'use client'
import * as React from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RiceActualState } from '@/lib/rice-flow'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

export function RiceProductionEditor({ materialId, name, date, actor, actual, onSaved }: {
  materialId: string; name: string; date: string; actor: string
  actual: RiceActualState; onSaved: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [qty, setQty] = React.useState('')
  const [expected, setExpected] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const pending = React.useRef(false)
  const [error, setError] = React.useState<string | null>(null)
  async function save() {
    if (pending.current) return
    const value = Number(qty)
    if (!qty.trim() || !Number.isFinite(value) || value < 0) { setError('Нийт агшаасан кг-ыг 0 буюу түүнээс их тоогоор оруулна уу.'); return }
    pending.current = true; setSaving(true); setError(null)
    try {
      const { error } = await createClient().rpc('set_rice_production', {
        p_date: date, p_material: materialId, p_qty: value, p_expected_updated_at: expected, p_actor: actor,
      })
      if (error) { setError(error.message); return }
      setOpen(false); onSaved()
    } catch { setError('Хадгалалтын хариу ирсэнгүй. Ижил нийт кг-аар дахин хадгалахад давхар нэмэгдэхгүй.') }
    finally { pending.current = false; setSaving(false) }
  }
  return <>
    <Button size="sm" onClick={() => { setQty(String(actual.produced_kg)); setExpected(actual.production_updated_at); setError(null); setOpen(true) }}>Агшаасан кг бүртгэх</Button>
    <Dialog open={open} onOpenChange={value => { if (!saving) setOpen(value) }}>
      <DialogContent><DialogHeader><DialogTitle>{name} — бодит үйлдвэрлэл</DialogTitle>
        <DialogDescription>{date} өдрийн бүх агшаалгын нийлбэр жинг оруулна. Өмнөх бүртгэл дээр нэмэхгүй, нийт дүнг шинэчилнэ.</DialogDescription></DialogHeader>
        <Label htmlFor={`rice-produced-${materialId}`}>Өнөөдрийн нийт агшаасан будаа (кг)</Label>
        <Input id={`rice-produced-${materialId}`} type="number" min="0" step="0.001" value={qty} onChange={e => setQty(e.target.value)} disabled={saving} />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Болих</Button><Button onClick={save} disabled={saving}>{saving ? 'Хадгалж байна…' : 'Нийт кг хадгалах'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>
}
