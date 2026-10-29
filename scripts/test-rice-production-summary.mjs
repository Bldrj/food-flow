import fs from 'node:fs'
import assert from 'node:assert/strict'
import ts from 'typescript'
const source = fs.readFileSync('src/lib/rice-production-summary.ts', 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText
const { riceProductionSummary } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'))
const batch = (code, qty, id = code) => ({ id, total_qty: qty, product: { code, name: code } })
const codes = ['016','017','021','023','024','025','027','029','032','033','034','036','038']
for (const qty of [1, 100]) {
  const result = riceProductionSummary(codes.map(code => batch('PRD-' + code, qty)))
  const expected = { plain: (190 + 47.1204188481675 + 320 + 200 + 235 + 180 + 150 + 100 + 180) / 1000 * qty, kimbap: .318 * qty, pink: .18 * qty, buckwheat: .18 * qty }
  for (const row of result.groups) {
    assert(Math.abs(row.cookedKg - expected[row.type]) < 1e-9)
    assert.equal(row.dryKg, undefined) // dry demand is only sourced from live recipes
  }
  assert.equal(result.pending.length, 0)
  assert.equal(result.unknown.length, 0)
}
const repeat = riceProductionSummary([batch('PRD-016', 10, 'a'), batch('PRD-016', 10, 'a'), batch('PRD-016', 5, 'b')])
assert.equal(repeat.groups.find(g => g.type === 'pink').cookedKg, 2.7)
const unsure = riceProductionSummary([batch('PRD-028', 100), batch('NEW', 1), batch('PRD-020', 100)])
assert.equal(unsure.pending[0].cookedKg, 35)
assert.equal(unsure.unknown.length, 1)
assert(unsure.groups.every(g => g.cookedKg === 0))
assert(riceProductionSummary([]).groups.every(g => g.cookedKg === 0))
assert.equal(riceProductionSummary([batch('PRD-016', -1)]).unknown.length, 1)
console.log('PASS rice totals at 1/100 portions, yield, duplicate/split batches, pending/unknown recipes and empty state')
