-- portion_weight-ийг products-оос хасах (2026-08-15).
-- Шалтгаан: гарцын жин нь жорын (ТК-ийн хувилбарын) шинж чанар — v2 дээр орц
-- өөрчлөгдвөл гарц дагаж өөрчлөгдөнө. Product түвшинд хадгалбал хувилбар солигдох
-- бүрд гараар давхар засах ёстой болж, хуучин захиалгын түүх (order_items →
-- tech_card_id) буруу жинтэй харагдана. Гарц нь tech_cards.portion_yield_g-д
-- хувилбар бүрээр хадгалагдана (ТК-ийн migration-д үүснэ).
-- Ажиллуулах: Supabase Dashboard > SQL Editor дээр хуулж Run дарна.

alter table public.products drop constraint if exists products_portion_weight_check;
alter table public.products drop column if exists portion_weight;
