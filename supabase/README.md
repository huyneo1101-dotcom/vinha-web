# Triển khai: đồng bộ đa thiết bị (Realtime) + Web Push (VAPID)

Code phía client (`index.html`, `sw.js`) đã sẵn sàng và tự chạy khi bạn mở app. Phần này liệt kê
các bước **phải làm thủ công trên Supabase Dashboard** (agent không có quyền truy cập trực tiếp
vào project Supabase từ sandbox này nên không tự chạy được các bước dưới).

## 1. Chạy schema.sql

Vào **Supabase Dashboard → SQL Editor**, dán và chạy toàn bộ nội dung `supabase/schema.sql`
(tạo bảng `vinha_push_subs`, `vinha_alert_state`, bật Realtime cho `vinha_state`/`vinha_household`).

## 2. Khoá VAPID

Public key đã được nhúng sẵn vào `index.html` (`VAPID_PUBLIC_KEY` = `BONm6u-WwmzfPNV0LcI_Sy0PZ9IgGshw0WsDxJtIFemD-TJ5WxssMOALR_B476JhWOmr006V5Gy86p3pbvsV3Ug`, an toàn khi lộ ra, không phải bí mật).

**`VAPID_PRIVATE_KEY` KHÔNG được ghi trong file này hay bất kỳ file nào trong repo** (repo là public/nằm trong git history vĩnh viễn nếu commit). Khoá private đã sinh cùng cặp với public key ở trên được gửi riêng cho bạn trong chat — copy từ đó dùng cho bước 4. Nếu bị mất, sinh lại **cả cặp mới** (không thể chỉ sinh lại private key riêng) bằng:

```bash
node -e '
const c=require("crypto");
const e=c.createECDH("prime256v1"); e.generateKeys();
const pub=e.getPublicKey(), priv=e.getPrivateKey();
const p=Buffer.concat([Buffer.alloc(Math.max(0,32-priv.length)),priv]);
const b64=b=>b.toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
console.log("PUBLIC:",b64(pub)); console.log("PRIVATE:",b64(p));
'
```

Nếu sinh cặp mới, phải cập nhật `VAPID_PUBLIC_KEY` trong `index.html` cho khớp với public key mới.

## 3. Deploy Edge Function

Cần cài [Supabase CLI](https://supabase.com/docs/guides/cli) trên máy bạn rồi đăng nhập + link project:

```bash
supabase login
supabase link --project-ref ltmlueqkajqmduoqghdf
supabase functions deploy check-budget-alerts
```

(Nếu không muốn dùng CLI: vào **Dashboard → Edge Functions → Create function**, đặt tên
`check-budget-alerts`, dán nội dung `supabase/functions/check-budget-alerts/index.ts`.)

## 4. Set secrets cho function

```bash
supabase secrets set VAPID_PUBLIC_KEY="BONm6u-WwmzfPNV0LcI_Sy0PZ9IgGshw0WsDxJtIFemD-TJ5WxssMOALR_B476JhWOmr006V5Gy86p3pbvsV3Ug"
supabase secrets set VAPID_PRIVATE_KEY="<dán private key được gửi riêng trong chat, KHÔNG lưu vào file nào trong repo>"
supabase secrets set VAPID_SUBJECT="mailto:huyneo1101@gmail.com"
```

(`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` được Supabase tự bơm sẵn vào mọi Edge Function, không cần set.)

## 5. Bật lịch chạy (cron) — gọi function 1 lần/ngày

Vào **Database → Extensions**, bật `pg_cron` và `pg_net` (nếu chưa bật). Sau đó chạy trong SQL Editor
(thay `<SERVICE_ROLE_KEY>` bằng Service Role Key thật, lấy ở **Project Settings → API**):

```sql
select cron.schedule(
  'vinha-budget-alerts',
  '0 13 * * *',  -- 13:00 UTC = 20:00 giờ Việt Nam, có thể đổi giờ tuỳ ý
  $$
  select net.http_post(
    url := 'https://ltmlueqkajqmduoqghdf.supabase.co/functions/v1/check-budget-alerts',
    headers := jsonb_build_object('Authorization','Bearer <SERVICE_ROLE_KEY>','Content-Type','application/json'),
    body := '{}'::jsonb
  );
  $$
);
```

## 6. Thử trên thiết bị thật

Mở app trên điện thoại/máy tính đã đăng nhập đồng bộ đám mây, bấm **"🔔 Bật thông báo ngân sách"**
trong tab Kế hoạch. Function sẽ tự chạy theo lịch ở bước 5; muốn thử ngay không cần chờ tới giờ,
có thể gọi thủ công:

```bash
curl -X POST https://ltmlueqkajqmduoqghdf.supabase.co/functions/v1/check-budget-alerts \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
```

**Lưu ý:** hàm gọi RPC `vinha_household_members` để lấy danh sách thành viên nhóm gia đình cần
gửi push, rồi đọc trường `user_id` (hoặc `id`) từ kết quả trả về. Vì agent không truy cập được
Supabase Dashboard thật để xem chính xác tên cột, nếu sổ chung không nhận được push, mở
`supabase/functions/check-budget-alerts/index.ts`, tìm dòng `m.user_id || m.id` và sửa cho khớp
tên cột thật của RPC `vinha_household_members`.
