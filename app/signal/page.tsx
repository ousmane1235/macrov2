"use client";
import { useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { TV_SYMBOLS } from "@/components/TradingViewChart";
import { SIGNAL_TFS } from "@/components/SignalChart";
import type { Signal, ElteParams } from "@/lib/elte-compute";
import type { DashMetrics } from "@/components/ElteSmartDashboard";
import type { TelegramSignalData } from "@/components/TelegramPanel";

// ─── LAZY LOADS ───────────────────────────────────────────────────────────────
const SignalChart = dynamic(() => import("@/components/SignalChart"), {
  ssr: false,
  loading: () => <div className="skeleton" style={{ flex:1, height:640, borderRadius:12 }} />,
});

const ElteSmartDashboard = dynamic(() => import("@/components/ElteSmartDashboard"), {
  ssr: false,
  loading: () => (
    <div style={{ width:250, flexShrink:0, height:640, background:"#0d0d1a", border:"1px solid #1c1c38", borderRadius:10 }} />
  ),
});

const TelegramPanel = dynamic(() => import("@/components/TelegramPanel"), { ssr: false });

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function fmtPrice(v: number, sym: string) {
  return sym.includes("JPY") ? v.toFixed(3) : v.toFixed(5);
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────
export default function SignalPage() {
  const [symIdx, setSymIdx] = useState(0);
  const [tfIdx,  setTfIdx]  = useState(4); // 1H par défaut

  // Dernier signal affiché dans le badge header
  const [lastScore, setLastScore] = useState<string | null>(null);
  const [lastType,  setLastType]  = useState<"buy" | "sell" | null>(null);

  // Données pour Telegram (assemblées depuis SignalChart + Dashboard)
  const [tgSignal, setTgSignal] = useState<TelegramSignalData | null>(null);
  const metricsRef = useRef<DashMetrics | null>(null);
  const sigDataRef = useRef<{ sig: Signal; params: ElteParams } | null>(null);

  const sym = TV_SYMBOLS[symIdx];
  const tf  = SIGNAL_TFS[tfIdx];

  const parisDate = new Date().toLocaleDateString("fr-FR", {
    timeZone: "Europe/Paris", weekday: "long", day: "numeric",
    month: "long", year: "numeric",
  });

  // Recompute le payload Telegram dès qu'on a les deux sources
  const rebuildTgSignal = useCallback((
    sig: Signal,
    params: ElteParams,
    metrics: DashMetrics,
    symbol: string,
    tfLabel: string,
  ) => {
    const risk  = Math.abs(sig.close - sig.st);
    const dir   = sig.type === "buy" ? 1 : -1;
    const entry = sig.close;
    const sensLabel = Number.isInteger(sig.sens)
      ? String(sig.sens)
      : sig.sens.toFixed(1).replace(/\.0$/, "");
    setTgSignal({
      symbol,
      tf:         tfLabel,
      type:       sig.type,
      score:      `${sig.type === "buy" ? "B" : "S"}${sensLabel}`,
      sensitivity: sig.sens,
      strategy:   params.strategy,
      entry:      fmtPrice(entry,                        symbol),
      tp1:        fmtPrice(entry + dir * params.multTP1 * risk, symbol),
      tp2:        fmtPrice(entry + dir * params.multTP2 * risk, symbol),
      tp3:        fmtPrice(entry + dir * params.multTP3 * risk, symbol),
      sl:         fmtPrice(entry - dir * risk,           symbol),
      trend:      metrics.trend,
      volume:     metrics.volume,
      momentum:   metrics.momentum,
      volatility: metrics.volatility,
      barsSince:  metrics.barsSince,
    });
  }, []);

  // ── Callback depuis SignalChart ────────────────────────────────────────────
  const handleResult = useCallback((
    sig: Signal | null,
    _barsSince: number,
    params: ElteParams,
  ) => {
    if (!sig) { setLastScore(null); setLastType(null); setTgSignal(null); return; }
    const sensLabel = Number.isInteger(sig.sens)
      ? sig.sens.toString()
      : sig.sens.toFixed(1).replace(/\.0$/, "");
    setLastScore(`${sig.type === "buy" ? "B" : "S"}${sensLabel}`);
    setLastType(sig.type);
    sigDataRef.current = { sig, params };
    if (metricsRef.current) {
      rebuildTgSignal(sig, params, metricsRef.current, sym.label, tf.label);
    }
  }, [sym.label, tf.label, rebuildTgSignal]);

  // ── Callback depuis ElteSmartDashboard ────────────────────────────────────
  const handleMetrics = useCallback((m: DashMetrics) => {
    metricsRef.current = m;
    if (sigDataRef.current) {
      rebuildTgSignal(sigDataRef.current.sig, sigDataRef.current.params, m, sym.label, tf.label);
    }
  }, [sym.label, tf.label, rebuildTgSignal]);

  return (
    <div style={{ maxWidth:1900, margin:"0 auto", padding:"18px 16px", display:"flex", flexDirection:"column", gap:12 }}>

      {/* ── En-tête ─────────────────────────────────────────────────────── */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
            <h1 style={{ fontSize:22, fontWeight:800, color:"#f1f5f9", letterSpacing:"-0.02em" }}>
              Signal · ELTE SMART
            </h1>
            {lastScore && (
              <span style={{
                fontSize:18, fontWeight:900, fontFamily:"monospace",
                color:      lastType === "buy" ? "#22c55e" : "#ef4444",
                background: lastType === "buy" ? "rgba(34,197,94,.12)" : "rgba(239,68,68,.12)",
                border:    `1px solid ${lastType === "buy" ? "rgba(34,197,94,.35)" : "rgba(239,68,68,.35)"}`,
                borderRadius:8, padding:"3px 14px", letterSpacing:1,
              }}>{lastScore}</span>
            )}
            {/* Telegram panel inline dans le header */}
            <TelegramPanel signal={tgSignal} />
          </div>
          <p style={{ fontSize:11, color:"#475569", marginTop:3 }}>
            🇫🇷 {parisDate} · Signaux affichés directement sur le graphique · Dashboard multi-TF
          </p>
        </div>
        <span style={{ fontSize:11, color:"#22c55e", background:"rgba(34,197,94,.08)", padding:"3px 10px", borderRadius:999, border:"1px solid rgba(34,197,94,.2)", fontWeight:700 }}>
          ● LIVE
        </span>
      </div>

      {/* ── Barre symboles ──────────────────────────────────────────────── */}
      <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
        {TV_SYMBOLS.map((s, i) => (
          <button key={s.tv} onClick={() => { setSymIdx(i); sigDataRef.current = null; metricsRef.current = null; setTgSignal(null); }} style={{
            fontSize:11, fontWeight:600, padding:"4px 11px", borderRadius:7, cursor:"pointer",
            background: symIdx === i ? "rgba(212,175,55,.12)" : "#10101e",
            border:    `1px solid ${symIdx === i ? "rgba(212,175,55,.3)" : "#1c1c38"}`,
            color:      symIdx === i ? "#f0c84a" : "#475569",
          }}>{s.label}</button>
        ))}
      </div>

      {/* ── Barre unité de temps ─────────────────────────────────────────── */}
      <div style={{ display:"flex", gap:3, alignItems:"center" }}>
        <span style={{ fontSize:11, color:"#334155", marginRight:6 }}>Unité de temps :</span>
        {SIGNAL_TFS.map((t, i) => (
          <button key={t.label} onClick={() => { setTfIdx(i); sigDataRef.current = null; metricsRef.current = null; setTgSignal(null); }} style={{
            fontSize:12, fontWeight:700, padding:"4px 11px", borderRadius:6, cursor:"pointer", minWidth:36,
            background: tfIdx === i ? "rgba(99,102,241,.15)" : "#10101e",
            border:    `1px solid ${tfIdx === i ? "rgba(99,102,241,.4)" : "#1c1c38"}`,
            color:      tfIdx === i ? "#818cf8" : "#475569",
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── Zone principale : Chart + Dashboard ─────────────────────────── */}
      <div style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
        <SignalChart
          key={`${sym.yf}-${tf.yfInterval}-${tf.yfRange}`}
          yfSymbol={sym.yf}
          label={sym.label}
          tfIdx={tfIdx}
          onResult={handleResult}
        />
        <ElteSmartDashboard
          key={`dash-${sym.yf}-${tf.yfInterval}`}
          yfSymbol={sym.yf}
          tfLabel={tf.label}
          yfInterval={tf.yfInterval}
          yfRange={tf.yfRange}
          onMetrics={handleMetrics}
        />
      </div>

      {/* ── Note ────────────────────────────────────────────────────────── */}
      <div style={{ padding:"10px 16px", background:"#10101e", border:"1px solid #1c1c38", borderRadius:10, fontSize:11, color:"#334155", display:"flex", gap:24, flexWrap:"wrap" }}>
        <span>📊 <strong style={{ color:"#475569" }}>Score B/S</strong> : lettre Buy/Sell + valeur de sensibilité auto au moment du signal (ex: B4 = Buy, sensibilité 4.0)</span>
        <span>📍 <strong style={{ color:"#475569" }}>Zones</strong> : Entry · TP1 · TP2 · TP3 · Stop Loss tracés sur le graphique</span>
        <span>📨 <strong style={{ color:"#475569" }}>Telegram</strong> : configurer bot token + canal ID pour envoyer les signaux automatiquement</span>
      </div>
    </div>
  );
}
