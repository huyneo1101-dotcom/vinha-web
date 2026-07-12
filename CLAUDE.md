# VíNhà — Quản lý tài chính gia đình (thu chi, ví, ngân sách, mục tiêu tiết kiệm)

App tĩnh: `index.html` (~3989 dòng, ~280KB, app React 18 + Babel Standalone qua CDN, KHÔNG build) + `landing.html` (~419 dòng, trang giới thiệu HTML thuần). PWA, có Supabase auth + đồng bộ. Deploy tĩnh (chưa có CI/CD trong repo — chưa có `.github/workflows/` hay `netlify.toml`; đang publish thủ công).

## Quy tắc làm việc với file này
- **KHÔNG đọc cả `index.html` (~280KB)** — grep định vị rồi Read cửa sổ nhỏ (xem skill `bigfile-nav`).
- `sw.js` đã có (CACHE `vinha-v1`): network-first cho trang chính, cache-first cho asset/CDN, không cache Supabase. Sửa nội dung đáng kể → **bump `CACHE`** để client nhận bản mới (xem `pwa-healthcheck`).
- Babel transpile trong trình duyệt: lỗi cú pháp = trắng màn hình câm. Kiểm tra Console sau khi sửa.
- Có 2 file HTML: đổi giao diện/logic app sửa `index.html`; đổi trang giới thiệu sửa `landing.html`.

## Dữ liệu (localStorage, tiền tố `vn.`)
Truy cập qua helper `store.get(k,default)` / `store.set(k,v)` (không dùng `localStorage` trực tiếp). `store.set` tự lên lịch đẩy lên Supabase.

| Khoá | Ý nghĩa | Kiểu |
|---|---|---|
| `vn.members` | Thành viên gia đình | mảng |
| `vn.wallets` | Ví/tài khoản | mảng |
| `vn.cats` | Danh mục thu/chi | mảng |
| `vn.tx` | Giao dịch | mảng |
| `vn.budgets` | Ngân sách | mảng |
| `vn.goals` | Mục tiêu tiết kiệm | mảng |
| `vn.bills` | Hoá đơn định kỳ | mảng |
| `vn.debts` | Nợ / cho vay | mảng |
| `vn.subscriptions` | Đăng ký (subscription) | mảng |
| `vn.theme` | Chế độ tối + tông màu | object |

- Khoá phụ: `vn.dataVersion`, `vn.syncVersion`, `vn.budgetNotifOn`, và các cờ migration `vn.migr_*`.
- Migration: làm theo pattern `vn.migr_*` sẵn có (khối quanh dòng ~808–860). Xem skill `local-store` khi đổi cấu trúc.
- Đồng bộ Supabase: **CÓ**. Object `CLOUD` (dòng ~767) gom mọi khoá `vn.*` (`gather`) rồi upsert vào bảng `vinha_household` (chế độ chia sẻ gia đình) hoặc `vinha_state` (cá nhân); ảnh hoá đơn lưu ở Storage bucket `vinha-receipts`.

## Bản đồ component chính
- `App` — dòng ~1370; 5 tab (bottom nav, dòng ~1549): `tx` Giao dịch · `home` Tổng quan · `analytics` Phân tích · `plan` Kế hoạch · `family` Gia đình.
- Màn hình lớn: `Home` (~1631), `Analytics` (~1942), `TxTab` (~3366), `Plan` (~2494), `Family` (~3754).
- Trong "Kế hoạch": `Budgets` (~3051), `Goals` (~3231), `Recurring` (~3384), `Bills` (~3444), `Subscriptions` (~3526), `Debts` (~3632).
- Cloud/chia sẻ: `CloudAuth` (~1153), `FamilyShare` (~1071), `PhoneSetup`/`PhoneInbox` (~1249/1359).

## Thư viện (đã pin version, qua cdn.jsdelivr.net)
- react@18.3.1, react-dom@18.3.1, @babel/standalone@7.25.6, @supabase/supabase-js@2.

## Deploy
- App tĩnh, không build. Chưa có workflow/Netlify config trong repo → hiện publish thủ công. Khi muốn nối CI/CD xem skill `deploy-static`.
- Sau khi sửa nội dung đáng kể và ĐÃ có `sw.js`: nhớ bump `CACHE` version trong `sw.js` (xem `pwa-healthcheck`).

## Skills dùng chung
Repo có `.claude/skills/` (11 skill từ plugin vibe-pwa-kit): bigfile-nav, data-backup, deploy-static, doc-single-file-app, local-store, lock-static-app, pwa-healthcheck, scaffold-vibe-pwa, supabase-sync, theme-pack, web-push.
