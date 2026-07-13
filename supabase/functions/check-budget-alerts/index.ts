// VíNhà — Edge Function chạy theo lịch (cron), kiểm tra ngân sách vượt/gần chạm hạn mức
// cho MỌI sổ (riêng + nhóm gia đình) và gửi Web Push (VAPID) cho các thiết bị đã đăng ký.
// Không gọi trực tiếp từ client — chỉ gọi qua cron (xem supabase/README.md).
//
// Secrets cần set trước khi deploy (supabase secrets set ...):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (vd: mailto:ban@vidu.com)
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY được Supabase tự bơm sẵn, không cần set.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function nowVN() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, ym: `${get("year")}-${get("month")}` };
}

function fmtVND(n: number) {
  return Math.round(n || 0).toLocaleString("vi-VN") + "đ";
}

// Khớp công thức budgetSpent phía client (index.html) — chi tiêu tháng hiện tại theo danh mục + phạm vi (cả nhà hoặc 1 thành viên).
function computeOvers(blob: any, ym: string) {
  const budgets = blob["vn.budgets"] || [];
  const txs = blob["vn.tx"] || [];
  const wallets = blob["vn.wallets"] || [];
  const cats = blob["vn.cats"] || [];
  const walletMember: Record<string, string> = {};
  for (const w of wallets) walletMember[w.id] = w.memberId;
  const spentOf = (b: any) =>
    txs.filter((t: any) =>
      t.type === "expense" &&
      String(t.date || "").slice(0, 7) === ym &&
      t.categoryId === b.categoryId &&
      (b.scope === "family" || walletMember[t.walletId] === b.scope)
    ).reduce((s: number, t: any) => s + (t.amount || 0), 0);
  return budgets.map((b: any) => {
    const sp = spentOf(b);
    const pct = b.amount > 0 ? sp / b.amount : 0;
    const cat = cats.find((c: any) => c.id === b.categoryId) || {};
    return { name: cat.name || "Danh mục", sp, pct, amount: b.amount };
  }).filter((x: any) => x.pct >= 0.8).sort((a: any, b: any) => b.pct - a.pct);
}

async function sendToUser(userId: string, title: string, body: string) {
  const { data: subs } = await sb.from("vinha_push_subs").select("*").eq("user_id", userId);
  for (const s of subs || []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title, body, tag: "vn-budget" }),
      );
    } catch (e: any) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        await sb.from("vinha_push_subs").delete().eq("id", s.id);
      } else {
        console.warn("push to", userId, "failed:", e.message || e);
      }
    }
  }
}

async function processScope(scopeKey: string, blob: any, userIds: string[], today: string, ym: string) {
  if (!blob) return;
  const { data: st } = await sb.from("vinha_alert_state").select("last_alert_date").eq("scope_key", scopeKey).maybeSingle();
  if (st && st.last_alert_date === today) return; // đã kiểm tra/báo hôm nay rồi
  await sb.from("vinha_alert_state").upsert({ scope_key: scopeKey, ym, last_alert_date: today });

  const overs = computeOvers(blob, ym);
  if (!overs.length) return;
  const worst = overs[0];
  const title = worst.pct > 1 ? "⚠️ Ngân sách đã vượt hạn mức" : "🔔 Ngân sách sắp chạm hạn mức";
  const body = overs.length === 1
    ? `${worst.name}: ${fmtVND(worst.sp)} / ${fmtVND(worst.amount)}` +
      (worst.pct > 1 ? ` · vượt ${fmtVND(worst.sp - worst.amount)}` : ` · ${Math.round(worst.pct * 100)}%`)
    : `${overs.length} danh mục đang ở mức cảnh báo · nặng nhất: ${worst.name} ${Math.round(worst.pct * 100)}%`;
  for (const uid of userIds) await sendToUser(uid, title, body);
}

Deno.serve(async (_req) => {
  const { date: today, ym } = nowVN();

  const { data: stateRows } = await sb.from("vinha_state").select("user_id,data");
  for (const row of stateRows || []) {
    try { await processScope(row.user_id, row.data, [row.user_id], today, ym); }
    catch (e) { console.warn("vinha_state scope", row.user_id, e); }
  }

  const { data: hhRows } = await sb.from("vinha_household").select("id,data");
  for (const row of hhRows || []) {
    try {
      // NOTE: tên cột user id trong kết quả RPC chưa được xác nhận trực tiếp trên project thật
      // (agent không truy cập được Supabase Dashboard) — nếu push không tới người trong nhóm,
      // kiểm tra lại tên cột thực tế trả về bởi vinha_household_members và sửa dòng dưới.
      const { data: members } = await sb.rpc("vinha_household_members", { p_household: row.id });
      const userIds = (members || []).map((m: any) => m.user_id || m.id).filter(Boolean);
      await processScope(row.id, row.data, userIds, today, ym);
    } catch (e) { console.warn("vinha_household scope", row.id, e); }
  }

  return new Response("ok");
});
