-- VíNhà — schema bổ sung cho Web Push (VAPID) + đồng bộ đa thiết bị (Realtime).
-- Chạy trong Supabase Dashboard > SQL Editor. Không đụng tới các bảng/RPC đã có sẵn
-- (vinha_state, vinha_household, vinha_tokens, vinha_inbox, vinha_my_household(), ...).

-- Lưu push subscription (1 dòng / thiết bị đã bật thông báo đẩy)
create table if not exists vinha_push_subs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);
alter table vinha_push_subs enable row level security;
create policy "own push subs" on vinha_push_subs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Trạng thái throttle cảnh báo ngân sách (1 dòng / sổ riêng hoặc nhóm gia đình), chỉ Edge Function
-- (service role) đọc/ghi — không cấp policy cho client nên client không đọc/ghi được bảng này.
create table if not exists vinha_alert_state (
  scope_key text primary key,   -- user_id (sổ riêng) hoặc household id (sổ chung)
  ym text not null,
  last_alert_date date not null
);
alter table vinha_alert_state enable row level security;

-- Bật Realtime cho 2 bảng lưu blob dữ liệu, để các thiết bị khác nhận UPDATE ngay khi có thiết bị khác đồng bộ.
alter table vinha_state replica identity full;
alter table vinha_household replica identity full;
alter publication supabase_realtime add table vinha_state, vinha_household;
