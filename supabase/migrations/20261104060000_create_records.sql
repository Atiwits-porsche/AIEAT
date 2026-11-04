-- AIEAT: ตารางเก็บข้อมูลผู้ใช้
-- ใช้ได้ 2 แบบ: (1) GitHub integration ของ Supabase รัน migration นี้ให้อัตโนมัติเมื่อ push เข้า main
--               (2) คัดลอกไปวางใน Supabase → SQL Editor → New query → Run (รันซ้ำได้ ไม่เสียหาย)
-- ทุกข้อมูล (โปรไฟล์ น้ำหนัก อาหาร ผลวัด ออกกำลังกาย) เก็บในตารางเดียว แยกด้วย kind + key
-- Row Level Security: ผู้ใช้แต่ละคนอ่าน/เขียนได้เฉพาะแถวของตัวเอง

create table if not exists public.records (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text        not null,
  key        text        not null,
  data       jsonb,
  deleted    boolean     not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, key)
);

create index if not exists records_user_updated_idx on public.records (user_id, updated_at);

-- เวลาอัปเดตให้เซิร์ฟเวอร์เป็นคนกำหนด (ใช้ซิงก์ข้ามเครื่อง)
create or replace function public.records_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists records_touch on public.records;
create trigger records_touch
  before insert or update on public.records
  for each row execute function public.records_touch_updated_at();

alter table public.records enable row level security;

drop policy if exists "records: select own" on public.records;
drop policy if exists "records: insert own" on public.records;
drop policy if exists "records: update own" on public.records;
drop policy if exists "records: delete own" on public.records;

create policy "records: select own" on public.records
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "records: insert own" on public.records
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "records: update own" on public.records
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "records: delete own" on public.records
  for delete to authenticated using ((select auth.uid()) = user_id);

-- อนุญาตให้ผู้ใช้ที่ล็อกอินแล้วเข้าถึงตารางผ่าน API (ผู้ที่ไม่ได้ล็อกอินเข้าไม่ได้)
revoke all on public.records from anon;
grant select, insert, update, delete on public.records to authenticated;
