// components/TradingViewChart.tsx
"use client";
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    TradingView?: {
      widget: new (config: Record<string, unknown>) => { remove?: () => void };
    };
  }
}

export const TV_SYMBOLS: { label: string; tv: string; yf: string }[] = [
  { label: "EUR/USD",     tv: "FX:EURUSD",          yf: "EURUSD=X"  },
  { label: "GBP/USD",    tv: "FX:GBPUSD",          yf: "GBPUSD=X"  },
  { label: "USD/JPY",    tv: "FX:USDJPY",          yf: "JPY=X"     },
  { label: "USD/CHF",    tv: "FX:USDCHF",          yf: "CHF=X"     },
  { label: "USD/CAD",    tv: "FX:USDCAD",          yf: "CAD=X"     },
  { label: "AUD/USD",    tv: "FX:AUDUSD",          yf: "AUDUSD=X"  },
  { label: "NZD/USD",    tv: "FX:NZDUSD",          yf: "NZDUSD=X"  },
  { label: "EUR/GBP",    tv: "FX:EURGBP",          yf: "EURGBP=X"  },
  { label: "EUR/JPY",    tv: "FX:EURJPY",          yf: "EURJPY=X"  },
  { label: "GBP/JPY",    tv: "FX:GBPJPY",          yf: "GBPJPY=X"  },
  { label: "XAU/USD",    tv: "OANDA:XAUUSD",       yf: "GC=F"      },
  { label: "XAG/USD",    tv: "OANDA:XAGUSD",       yf: "SI=F"      },
  { label: "WTI Oil",    tv: "NYMEX:CL1!",         yf: "CL=F"      },
  { label: "S&P 500",    tv: "FOREXCOM:SPXUSD",    yf: "^GSPC"     },
  { label: "Nasdaq 100", tv: "FOREXCOM:NSXUSD",    yf: "^NDX"      },
  { label: "BTC/USD",    tv: "BITSTAMP:BTCUSD",    yf: "BTC-USD"   },
];

// TF correspondance : notre label → code TradingView
export const TV_TF: Record<string, string> = {
  "1M": "1", "5M": "5", "15M": "15", "30M": "30",
  "1H": "60", "4H": "240", "D": "D", "W": "W", "M": "M",
};

// Singleton loader — charge tv.js une seule fois
let scriptLoaded  = false;
let scriptLoading = false;
const queue: (() => void)[] = [];
function loadTVScript(cb: () => void) {
  if (scriptLoaded) { cb(); return; }
  queue.push(cb);
  if (scriptLoading) return;
  scriptLoading = true;
  const s = document.createElement("script");
  s.src = "https://s3.tradingview.com/tv.js";
  s.async = true;
  s.onload = () => { scriptLoaded = true; queue.forEach(fn => fn()); queue.length = 0; };
  document.head.appendChild(s);
}

let _uid = 0;

interface Props {
  tvSymbol:  string;
  interval?: string;   // TV interval code: "1","5","15","30","60","D","W","M"
  height?:   number;
}

export default function TradingViewChart({ tvSymbol, interval = "D", height = 520 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const uid = useRef(`tv_chart_${++_uid}`);

  useEffect(() => {
    if (!ref.current) return;
    const id = uid.current;
    ref.current.id = id;

    loadTVScript(() => {
      if (!window.TradingView || !ref.current) return;
      ref.current.innerHTML = "";
      ref.current.id = id;
      new window.TradingView.widget({
        container_id:      id,
        autosize:          true,
        symbol:            tvSymbol,
        interval,
        timezone:          "Europe/Paris",
        theme:             "dark",
        style:             "1",
        locale:            "fr",
        toolbar_bg:        "#10101e",
        enable_publishing: false,
        allow_symbol_change: true,
        hide_side_toolbar: false,
        save_image:        false,
        hide_top_toolbar:  false,
        studies:           [],
        backgroundColor:   "#060610",
        gridColor:         "#1c1c38",
        withdateranges:    true,
      });
    });

    return () => { if (ref.current) ref.current.innerHTML = ""; };
  }, [tvSymbol, interval]);

  return (
    <div ref={ref} style={{ width: "100%", height, background: "#060610", borderRadius: 8, overflow: "hidden" }} />
  );
}
