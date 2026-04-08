// app/api/telegram/route.ts — Envoi de signal via Telegram Bot API (server-side)
export const dynamic = "force-dynamic";
import { type NextRequest } from "next/server";

interface TelegramPayload {
  botToken:  string;   // ex: "7123456789:AAGxxxxxx..."
  chatId:    string;   // ex: "@moncanal" ou "-1001234567890"
  symbol:    string;
  tf:        string;
  type:      "buy" | "sell";
  score:     string;   // "B4", "S3.6"…
  sensitivity: number;
  strategy:  string;
  entry:     string;
  tp1:       string;
  tp2:       string;
  tp3:       string;
  sl:        string;
  trend:     string;
  volume:    string;
  momentum:  string;
  volatility:string;
  barsSince: number;
}

function buildMessage(p: TelegramPayload): string {
  const isBuy = p.type === "buy";
  const emoji = isBuy ? "🟢" : "🔴";
  const dir   = isBuy ? "BUY" : "SELL";
  const arrow = isBuy ? "📈" : "📉";

  return [
    `${emoji} <b>SIGNAL ${dir} — ${p.score}</b>`,
    `💱 <b>${p.symbol}</b> · ${p.tf}`,
    `📊 Stratégie : <b>${p.strategy}</b> | Sensibilité : <b>${p.sensitivity}</b>`,
    ``,
    `━━━━━━━━━━━━━━━━━━`,
    `📍 Entry  : <code>${p.entry}</code>`,
    `🎯 TP 1   : <code>${p.tp1}</code>`,
    `🎯 TP 2   : <code>${p.tp2}</code>`,
    `🎯 TP 3   : <code>${p.tp3}</code>`,
    `🛑 Stop   : <code>${p.sl}</code>`,
    `━━━━━━━━━━━━━━━━━━`,
    `${arrow} Trend : <b>${p.trend}</b>`,
    `📦 Volume : <b>${p.volume}</b>`,
    `⚡ Momentum : <b>${p.momentum}</b>`,
    `🌡 Volatilité : <b>${p.volatility}</b>`,
    p.barsSince > 0
      ? `⏱ Signal il y a <b>${p.barsSince}</b> bougie${p.barsSince > 1 ? "s" : ""}`
      : `⏱ Signal sur la <b>bougie actuelle</b>`,
    ``,
    `🔒 <i>ELTE SMART · Privé · macrometrics local</i>`,
  ].join("\n");
}

export async function POST(req: NextRequest) {
  let body: TelegramPayload;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { botToken, chatId } = body;
  if (!botToken || !chatId) {
    return Response.json({ error: "botToken et chatId sont requis" }, { status: 400 });
  }

  const text = buildMessage(body);
  const url  = `https://api.telegram.org/bot${botToken}/sendMessage`;

  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      return Response.json(
        { error: json.description ?? "Erreur Telegram", code: json.error_code },
        { status: 400 },
      );
    }
    return Response.json({ ok: true, messageId: json.result?.message_id });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
