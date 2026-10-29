# Rice percentage conversion — applied to production 2026-10-29

User selected white rice (`2-001`) loss_pct = -0.555556 (-55.5556%).

Code now reads dry grain quantities from station recipe components rather than dividing cooked demand by a constant. The Excel-reference panel shows cooked norms only, avoiding a second independent dry calculation. Material editing accepts percentages strictly greater than -100%, preserves four decimal percentage places, and stores eight fractional places.

`supabase/prod-rice-material-percentage.sql` is a transactional deployment script, applied and REST-readback verified. It:
- widens loss_pct precision and permits negative percentages;
- records white rice's cooked share in existing plain/pink/buckwheat rice recipes;
- derives stored dry ingredient amounts from group output × share × (1 + material.loss_pct);
- recalculates ingredients when material percentage or group output changes;
- exposes loss_applied in intermediate_recipes and avoids applying it again in warehouse demand;
- leaves black/buckwheat grain ingredients and non-rice ingredients unchanged.

The current kimbap-rice recipe has no ingredients. UI deliberately reports an unknown dry recipe rather than manufacturing a quantity. Direct rice ingredient rows retain normal material-percentage behavior. Cooked portions and recorded transfers/stock are unchanged.

Validation: `npx tsc --noEmit`, `git diff --check`, `node scripts/test-rice-production-summary.mjs`, and the PostgreSQL integration test passed. ESLint has only pre-existing errors (confirmed against HEAD).

Integration test prerequisites: install @electric-sql/pglite@0.3.14 outside the repository, set PGLITE_MODULE to its path, and supply RICE_SNAPSHOT as a read-only JSON export containing materials, tech_cards, tech_card_groups, tech_card_items, production_batches. The current session snapshot is /tmp/rice-live-snapshot.json. Run `node scripts/test-rice-material-percentage.mjs`. It tests precise percentage storage, Teftel dry ingredient, no double warehouse adjustment, changing percentages/output, unrelated ingredient preservation and invalid percentages.

Expected snapshot results: Teftel 190 g cooked → 84.444 g dry (six-decimal kg recipe storage). 2026-10-05 plain rice 379.11924 kg cooked → 168.496553171 kg dry, displayed 168.497 kg. Other rice blends also consume white rice, so the warehouse's total white rice is greater than plain rice alone.

Live application: compared daily_material_needs in SQL Editor, applied transaction successfully on utcrmifewzqdeybukmbz, verified REST readback: loss_pct=-0.555556; Teftel netto_qty=0.084444; plain rice dry=168.49655317136842 kg. Warehouse white rice issue_need=212.91423637136842 kg includes other blends and direct rice uses, so it is not the same as plain rice alone. UI deployment follows through GitHub main → Vercel.

Do not rerun the deployment SQL; its trigger/constraint creation intentionally stops duplicate application inside the transaction.

## All-grain extension (2026-10-29)

`supabase/prod-all-rice-percentage.sql` extends the applied migration. Recipe rows now explicitly distinguish `dry`, `cooked`, and `unconfirmed` input bases. Stored netto/brutto remain dry quantities. Cooked inputs retain a separate cooked amount, and every material's own percentage drives conversion exactly once. Explicit dry inputs bypass conversion. Known raw rice codes default to dry for new rows; the tech-card editor lets users choose a cooked basis. Copying cards preserves conversion metadata.

Black rice and buckwheat percentages remain 0%, as requested. Their current dry norms (2.581g and 8g) are preserved as equivalent cooked bases at 0%, rather than silently changing their mixing proportions. This is a bookkeeping migration, not a physical yield validation. A future percentage change refreshes these quantities once.

Oyakodon 350g is cooked: Master-v2's tab `16. Туна кимчижигэ` actually has the title Oyakodon, E22=350, C22=E22/2.25. It now consumes BLD-018, so its demand reaches shared rice production. Kimbap's missing white-rice component is restored, retaining its existing 70g cooked output; white rice is confirmed in both handroll source recipes. No seasoning norms are invented.

Two rows remain **unconfirmed**: Tagturitan and Kimchijjigae 90g. The available workbooks do not contain these recently added rice recipes. Tagturitan has no portion yield; Kimchijjigae has a 580g whole-meal yield but no separate rice yield, which cannot establish whether 90g is cooked or dry. Their quantities and prior calculations are preserved, with a visible warning and explicit basis selector. They require kitchen/source confirmation; do not describe every recipe as verified until resolved.

Validation: TypeScript and PostgreSQL integration tests pass, including a fresh production snapshot, percentage changes for non-white grain, unchanged dry inputs, cooked output changes, kimbap expansion, Oyakodon routing, and daily warehouse/recipe equality for confirmed rows. Run `CURRENT_RICE_SNAPSHOT=/path/to/current.json node scripts/test-all-rice-percentage.mjs` with the same base snapshot/runtime prerequisites above.
