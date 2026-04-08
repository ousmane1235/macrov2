// components/TelegramPanel.tsx — Config Telegram + bouton envoi signal
"use client";
import { useState, useEffect, useCallback } from "react";

// ─── Types reçus depuis SignalPage ────────────────────────────────────────────
export interface TelegramSignalData {
  symbol:     string;
  tf:         string;
  type:       "buy" | "sell";
  score:      string;
  sensitivity: number;
  strategy:   string;
  entry:      string;
  tp1:        string;
  tp2:        string;
  tp3:        string;
  sl:         string;
  trend:      string;
  volume:     string;
  momentum:   string;
  volatility: string;
  barsSince:  number;
}

interface Props {
  signal: TelegramSignalData | null;
}

// ─── STORAGE KEY ──────────────────────────────────────────────────────────────
const LS_TOKEN   = "elte_tg_token";
const LS_CHAT_ID = "elte_tg_chatid";

// ─── CONFIG MODAL ─────────────────────────────────────────────────────────────
function ConfigModal({
  token, chatId, onSave, onClose,
}: { token: string; chatId: string; onSave: (t: string, c: string) => void; onClose: () => void }) {
  const [t, setT] = useState(token);
  const [c, setC] = useState(chatId);

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center",
      background:"rgba(0,0,0,0.75)", backdropFilter:"blur(4px)",
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background:"#10101e", border:"1px solid #1c1c38", borderRadius:14,
        width:"min(480px,95vw)", padding:28, display:"flex", flexDirection:"column", gap:20,
      }}>

        {/* En-tête */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <h2 style={{ fontSize:16, fontWeight:800, color:"#f1f5f9", margin:0 }}>⚙ Paramètres Telegram</h2>
            <p style={{ fontSize:11, color:"#475569", margin:"4px 0 0" }}>
              Les données sont stockées localement dans votre navigateur.
            </p>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#475569", cursor:"pointer", fontSize:18 }}>✕</button>
        </div>

        {/* Champ Bot Token */}
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          <label style={{ fontSize:12, fontWeight:700, color:"#94a3b8" }}>
            🤖 Bot Token
          </label>
          <input
            type="password"
            value={t}
            onChange={e => setT(e.target.value)}
            placeholder="7123456789:AAGxxxxxxxxxxxxxx..."
            spellCheck={false}
            style={{
              background:"#0d0d1a", border:"1px solid #1c1c38", borderRadius:8,
              color:"#e2e8f0", fontSize:13, padding:"9px 12px", outline:"none", fontFamily:"monospace",
            }}
          />
          <span style={{ fontSize:10, color:"#334155" }}>
            Obtenir via @BotFather → /newbot sur Telegram
          </span>
        </div>

        {/* Champ Chat ID */}
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          <label style={{ fontSize:12, fontWeight:700, color:"#94a3b8" }}>
            📣 Canal / Chat ID
          </label>
          <input
            type="text"
            value={c}
            onChange={e => setC(e.target.value)}
            placeholder="@moncanal ou -1001234567890"
            spellCheck={false}
            style={{
              background:"#0d0d1a", border:"1px solid #1c1c38", borderRadius:8,
              color:"#e2e8f0", fontSize:13, padding:"9px 12px", outline:"none", fontFamily:"monospace",
            }}
          />
          <span style={{ fontSize:10, color:"#334155" }}>
            Canal public : @nomducanal · Canal privé : ID numérique (ex: -1001234567890)
          </span>
        </div>

        {/* Guide rapide */}
        <div style={{
          background:"#0a0a18", border:"1px solid #111827", borderRadius:8, padding:"12px 14px",
          fontSize:11, color:"#475569", lineHeight:1.7,
        }}>
          <strong style={{ color:"#64748b" }}>Guide rapide :</strong><br />
          1. Ouvrir Telegram → chercher <strong>@BotFather</strong><br />
          2. Envoyer <code>/newbot</code> → copier le token<br />
          3. Ajouter le bot à ton canal comme <strong>Administrateur</strong><br />
          4. Canal privé : envoyer <code>https://api.telegram.org/botTOKEN/getUpdates</code> pour trouver l&apos;ID
        </div>

        {/* Boutons */}
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
          <button onClick={onClose} style={{
            background:"transparent", border:"1px solid #1c1c38", color:"#475569",
            borderRadius:8, padding:"8px 18px", cursor:"pointer", fontSize:13,
          }}>Annuler</button>
          <button onClick={() => { onSave(t.trim(), c.trim()); onClose(); }} style={{
            background:"rgba(37,99,235,.15)", border:"1px solid rgba(37,99,235,.4)", color:"#60a5fa",
            borderRadius:8, padding:"8px 18px", cursor:"pointer", fontSize:13, fontWeight:700,
          }}>💾 Enregistrer</button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function TelegramPanel({ signal }: Props) {
  const [token,       setToken]      = useState("");
  const [chatId,      setChatId]     = useState("");
  const [showConfig,  setShowConfig] = useState(false);
  const [sending,     setSending]    = useState(false);
  const [lastStatus,  setLastStatus] = useState<"ok"|"err"|null>(null);
  const [errMsg,      setErrMsg]     = useState("");

  // Charger depuis localStorage au montage
  useEffect(() => {
    try {
      setToken(localStorage.getItem(LS_TOKEN)   ?? "");
      setChatId(localStorage.getItem(LS_CHAT_ID) ?? "");
    } catch { /* SSR */ }
  }, []);

  const handleSave = useCallback((t: string, c: string) => {
    setToken(t);
    setChatId(c);
    try {
      localStorage.setItem(LS_TOKEN,   t);
      localStorage.setItem(LS_CHAT_ID, c);
    } catch { /* SSR */ }
  }, []);

  const handleSend = useCallback(async () => {
    if (!signal || !token || !chatId) return;
    setSending(true);
    setLastStatus(null);
    try {
      const res = await fetch("/api/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: token, chatId, ...signal }),
      });
      const json = await res.json();
      if (json.ok) {
        setLastStatus("ok");
        setTimeout(() => setLastStatus(null), 4000);
      } else {
        setLastStatus("err");
        setErrMsg(json.error ?? "Erreur inconnue");
      }
    } catch (e) {
      setLastStatus("err");
      setErrMsg(String(e));
    } finally {
      setSending(false);
    }
  }, [signal, token, chatId]);

  const isConfigured = token.length > 10 && chatId.length > 1;
  const isBuy = signal?.type === "buy";

  return (
    <>
      {/* ── Widget compact ───────────────────────────────────────────────── */}
      <div style={{
        display:"flex", alignItems:"center", gap:8, flexWrap:"wrap",
        background:"#0d0d1a", border:"1px solid #1c1c38", borderRadius:10,
        padding:"8px 12px",
      }}>

        {/* Indicateur de config */}
        <span style={{
          width:7, height:7, borderRadius:"50%", flexShrink:0,
          background: isConfigured ? "#22c55e" : "#ef4444",
          boxShadow:  isConfigured ? "0 0 6px #22c55e80" : "none",
          display:"inline-block",
        }} />

        <span style={{ fontSize:12, fontWeight:700, color:"#64748b" }}>
          📨 Telegram
        </span>

        {!isConfigured && (
          <span style={{ fontSize:10, color:"#334155" }}>Non configuré</span>
        )}
        {isConfigured && (
          <span style={{ fontSize:10, color:"#22c55e40", fontFamily:"monospace" }}>
            {chatId}
          </span>
        )}

        {/* Bouton Envoyer */}
        {signal && isConfigured && (
          <button onClick={handleSend} disabled={sending} style={{
            fontSize:11, fontWeight:700, padding:"4px 12px", borderRadius:6,
            cursor: sending ? "not-allowed" : "pointer",
            background: sending
              ? "rgba(99,102,241,.05)"
              : isBuy
              ? "rgba(34,197,94,.15)"
              : "rgba(239,68,68,.15)",
            border: `1px solid ${sending ? "#1c1c38" : isBuy ? "rgba(34,197,94,.4)" : "rgba(239,68,68,.4)"}`,
            color: sending ? "#334155" : isBuy ? "#22c55e" : "#ef4444",
            transition:"all .15s",
          }}>
            {sending ? "Envoi…" : `📤 Envoyer ${signal.score}`}
          </button>
        )}

        {/* Bouton configurer */}
        <button onClick={() => setShowConfig(true)} style={{
          fontSize:11, padding:"4px 10px", borderRadius:6, cursor:"pointer",
          background:"transparent", border:"1px solid #1c1c38", color:"#334155",
        }}>⚙</button>

        {/* Statut */}
        {lastStatus === "ok" && (
          <span style={{ fontSize:11, color:"#22c55e", fontWeight:700 }}>✓ Envoyé !</span>
        )}
        {lastStatus === "err" && (
          <span style={{ fontSize:11, color:"#ef4444", fontWeight:700 }} title={errMsg}>✗ Erreur</span>
        )}
      </div>

      {/* ── Modal config ─────────────────────────────────────────────────── */}
      {showConfig && (
        <ConfigModal
          token={token}
          chatId={chatId}
          onSave={handleSave}
          onClose={() => setShowConfig(false)}
        />
      )}
    </>
  );
}
