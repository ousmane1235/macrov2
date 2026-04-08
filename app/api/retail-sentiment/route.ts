export const dynamic = "force-dynamic";

export interface RetailSentiment {
  pair: string;
  longPct: number;
  shortPct: number;
  source: string;
  contrarian: "Buy" | "Sell" | "Neutral";
  note: string;
}

function signal(longPct: number): "Buy" | "Sell" | "Neutral" {
  return longPct >= 65 ? "Sell" : longPct <= 35 ? "Buy" : "Neutral";
}

function makeEntry(pair: string, longPct: number, source: string): RetailSentiment {
  const shortPct = 100 - longPct;
  const contrarian = signal(longPct);
  return {
    pair, longPct, shortPct, source, contrarian,
    note: contrarian !== "Neutral"
      ? `${longPct}% ${longPct >= 65 ? "Long" : "Short"} → Signal ${contrarian}`
      : "Sentiment équilibré",
  };
}

// ─── MyFXBook session cache (module-level, server-side) ──────────────────────
let mfxSession: { id: string; expiry: number } | null = null;

async function getMfxSession(): Promise<string | null> {
  if (mfxSession && Date.now() < mfxSession.expiry) return mfxSession.id;

  const email    = process.env.MYFXBOOK_EMAIL;
  const password = process.env.MYFXBOOK_PASSWORD;
  if (!email || !password) return null;

  try {
    const res = await fetch(
      `https://www.myfxbook.com/api/login.json?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`,
      { cache: "no-store" }
    );
    const data = await res.json();
    if (data.error || !data.session) return null;
    mfxSession = { id: data.session, expiry: Date.now() + 50 * 60 * 1000 }; // 50 min
    return mfxSession.id;
  } catch {
    return null;
  }
}

// Converts "EURUSD" → "EUR/USD", "XAUUSD" → "XAU/USD", etc.
const PAIR_MAP: Record<string, string> = {
  EURUSD: "EUR/USD", GBPUSD: "GBP/USD", USDJPY: "USD/JPY", USDCHF: "USD/CHF",
  USDCAD: "USD/CAD", AUDUSD: "AUD/USD", NZDUSD: "NZD/USD",
  EURGBP: "EUR/GBP", EURJPY: "EUR/JPY", EURCHF: "EUR/CHF", EURCAD: "EUR/CAD",
  EURAUD: "EUR/AUD", EURNZD: "EUR/NZD",
  GBPJPY: "GBP/JPY", GBPCHF: "GBP/CHF", GBPCAD: "GBP/CAD",
  GBPAUD: "GBP/AUD", GBPNZD: "GBP/NZD",
  AUDJPY: "AUD/JPY", AUDCAD: "AUD/CAD", AUDNZD: "AUD/NZD",
  NZDJPY: "NZD/JPY", CADJPY: "CAD/JPY", CHFJPY: "CHF/JPY",
  XAUUSD: "XAU/USD", XAGUSD: "XAG/USD",
};
function formatPair(key: string): string {
  return PAIR_MAP[key.toUpperCase()] ?? key.replace(/([A-Z]{3})([A-Z]{3})/, "$1/$2");
}

// ─── 1. MyFXBook Community Outlook ───────────────────────────────────────────
async function fetchMyfxbook(): Promise<RetailSentiment[]> {
  const session = await getMfxSession();
  if (!session) return [];

  try {
    const res = await fetch(
      `https://www.myfxbook.com/api/get-community-outlook.json?session=${session}`,
      { cache: "no-store" }
    );
    const data = await res.json();
    if (data.error || !data.symbols) {
      mfxSession = null; // force re-login next time
      return [];
    }

    const results: RetailSentiment[] = [];
    const symbols = data.symbols;

    // MyFXBook returns an array: [{name, longPercentage, shortPercentage, ...}]
    if (Array.isArray(symbols)) {
      for (const item of symbols as Record<string, number & string>[]) {
        const name = String(item.name ?? "");
        if (!name) continue;
        const longPct = Math.round(Number(item.longPercentage ?? (100 - (item.shortPercentage ?? 50))));
        if (longPct >= 0 && longPct <= 100) {
          results.push(makeEntry(formatPair(name), longPct, "MyFXBook"));
        }
      }
    } else {
      // Object format fallback: {EURUSD: {longPercentage, shortPercentage}}
      for (const [key, val] of Object.entries(symbols) as [string, Record<string, number>][]) {
        const longPct = Math.round(val?.longPercentage ?? (100 - (val?.shortPercentage ?? 50)));
        if (longPct >= 0 && longPct <= 100) {
          results.push(makeEntry(formatPair(key), longPct, "MyFXBook"));
        }
      }
    }
    return results;
  } catch {
    mfxSession = null;
    return [];
  }
}

// ─── 2. CFTC COT — Indices + Commodities (+ Forex fallback) ─────────────────
async function fetchCOT(forexFallback: boolean): Promise<RetailSentiment[]> {
  const instruments = [
    // Forex (used only as fallback if MyFXBook unavailable)
    ...(forexFallback ? [
      { pair: "EUR/USD",    market: "EURO FX - CHICAGO MERCANTILE EXCHANGE",               invert: false },
      { pair: "GBP/USD",    market: "BRITISH POUND - CHICAGO MERCANTILE EXCHANGE",         invert: false },
      { pair: "USD/JPY",    market: "JAPANESE YEN - CHICAGO MERCANTILE EXCHANGE",          invert: true  },
      { pair: "USD/CHF",    market: "SWISS FRANC - CHICAGO MERCANTILE EXCHANGE",           invert: true  },
      { pair: "USD/CAD",    market: "CANADIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE",       invert: true  },
      { pair: "AUD/USD",    market: "AUSTRALIAN DOLLAR - CHICAGO MERCANTILE EXCHANGE",     invert: false },
      { pair: "NZD/USD",    market: "NZ DOLLAR - CHICAGO MERCANTILE EXCHANGE",             invert: false },
    ] : []),
    // US Indices
    { pair: "S&P 500",    market: "MICRO E-MINI S&P 500 INDEX - CHICAGO MERCANTILE EXCHANGE",    invert: false },
    { pair: "Nasdaq 100", market: "MICRO E-MINI NASDAQ-100 INDEX - CHICAGO MERCANTILE EXCHANGE", invert: false },
    { pair: "Dow Jones",  market: "MINI-SIZED DOW JONES STOCKS - CHICAGO BOARD OF TRADE",        invert: false },
    // Commodities
    { pair: "XAU/USD",    market: "GOLD - COMMODITY EXCHANGE INC.",                              invert: false },
    { pair: "XAG/USD",    market: "SILVER - COMMODITY EXCHANGE INC.",                            invert: false },
    { pair: "WTI Oil",    market: "CRUDE OIL, LIGHT SWEET-WTI - ICE FUTURES EUROPE",            invert: false },
    { pair: "Nat. Gas",   market: "E-MINI NATURAL GAS - NEW YORK MERCANTILE EXCHANGE",           invert: false },
    { pair: "Copper",     market: "COPPER- #1 - COMMODITY EXCHANGE INC.",                        invert: false },
  ];

  const results = await Promise.allSettled(
    instruments.map(({ market }) =>
      fetch(
        [
          "https://publicreporting.cftc.gov/resource/jun7-fc8e.json",
          `?market_and_exchange_names=${encodeURIComponent(market)}`,
          "&$order=report_date_as_yyyy_mm_dd DESC",
          "&$limit=1",
        ].join(""),
        { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }
      ).then(r => r.json())
    )
  );

  return instruments.flatMap(({ pair, invert }, i) => {
    const r = results[i];
    if (r.status !== "fulfilled" || !r.value?.[0]) return [];
    const row = r.value[0];
    const ncLong  = parseInt(row["noncomm_positions_long_all"]  ?? "0");
    const ncShort = parseInt(row["noncomm_positions_short_all"] ?? "0");
    const total = ncLong + ncShort;
    if (total === 0) return [];
    let longPct = Math.round((ncLong / total) * 100);
    if (invert) longPct = 100 - longPct;
    return [makeEntry(pair, longPct, "COT Institutionnel")];
  });
}

// ─── 3. Binance Futures — Crypto (live) ──────────────────────────────────────
async function fetchBinanceCrypto(): Promise<RetailSentiment[]> {
  const symbols = [
    { symbol: "BTCUSDT",  pair: "BTC/USD" },
    { symbol: "ETHUSDT",  pair: "ETH/USD" },
    { symbol: "SOLUSDT",  pair: "SOL/USD" },
    { symbol: "XRPUSDT",  pair: "XRP/USD" },
    { symbol: "BNBUSDT",  pair: "BNB/USD" },
    { symbol: "DOGEUSDT", pair: "DOGE/USD" },
    { symbol: "ADAUSDT",  pair: "ADA/USD" },
  ];

  const results = await Promise.allSettled(
    symbols.map(({ symbol }) =>
      fetch(
        `https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=1h&limit=1`,
        { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }
      ).then(r => r.json())
    )
  );

  return symbols.flatMap(({ pair }, i) => {
    const r = results[i];
    if (r.status === "fulfilled" && Array.isArray(r.value) && r.value[0]) {
      const longPct = Math.round(parseFloat(r.value[0].longAccount) * 100);
      if (longPct >= 0 && longPct <= 100) return [makeEntry(pair, longPct, "Binance Futures")];
    }
    return [];
  });
}

export async function GET() {
  const [mfxResult, cryptoResult] = await Promise.allSettled([
    fetchMyfxbook(),
    fetchBinanceCrypto(),
  ]);

  const mfx    = mfxResult.status    === "fulfilled" ? mfxResult.value    : [];
  const crypto = cryptoResult.status === "fulfilled" ? cryptoResult.value : [];

  // If MyFXBook has forex data, use it; otherwise fetch COT as fallback for forex too
  const hasMfxForex = mfx.some(d =>
    ["EUR/USD","GBP/USD","USD/JPY","USD/CHF","USD/CAD","AUD/USD","NZD/USD"].includes(d.pair)
  );
  const cot = await fetchCOT(!hasMfxForex);

  // Merge: deduplicate by pair (priority: MyFXBook > Binance > COT)
  const seen = new Set<string>();
  const all: RetailSentiment[] = [];

  for (const item of [...mfx, ...crypto, ...cot]) {
    if (!seen.has(item.pair)) { seen.add(item.pair); all.push(item); }
  }

  return Response.json(all);
}
