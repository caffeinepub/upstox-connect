import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Toaster } from "@/components/ui/sonner";
import {
  Tabs as SettingsTabs,
  TabsContent as SettingsTabsContent,
  TabsList as SettingsTabsList,
  TabsTrigger as SettingsTabsTrigger,
} from "@/components/ui/tabs";
import {
  Activity,
  AlertTriangle,
  BarChart2,
  BookOpen,
  BriefcaseBusiness,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  Layers,
  LineChart,
  Loader2,
  LogOut,
  Menu,
  Moon,
  Pencil,
  Plus,
  RefreshCw,
  Settings,
  Shield,
  Sun,
  TrendingDown,
  TrendingUp,
  User,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

// ─── Black-Scholes Functions ──────────────────────────────────────────────────
function normCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const t = 1.0 / (1.0 + p * Math.abs(x));
  const y =
    1.0 -
    ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp((-x * x) / 2);
  return 0.5 * (1.0 + sign * y);
}

function normPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function blackScholes(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  type: "CE" | "PE",
) {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) {
    return {
      price: 0,
      delta: type === "CE" ? 0.5 : -0.5,
      gamma: 0,
      theta: 0,
      vega: 0,
    };
  }
  const d1 =
    (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  const sqrtT = Math.sqrt(T);
  const nd1 = normCDF(d1);
  const nd2 = normCDF(d2);
  const nnd1 = normCDF(-d1);
  const nnd2 = normCDF(-d2);
  const price =
    type === "CE"
      ? S * nd1 - K * Math.exp(-r * T) * nd2
      : K * Math.exp(-r * T) * nnd2 - S * nnd1;
  const delta = type === "CE" ? nd1 : nd1 - 1;
  const gamma = normPDF(d1) / (S * sigma * sqrtT);
  const theta =
    type === "CE"
      ? (-(S * normPDF(d1) * sigma) / (2 * sqrtT) -
          r * K * Math.exp(-r * T) * nd2) /
        365
      : (-(S * normPDF(d1) * sigma) / (2 * sqrtT) +
          r * K * Math.exp(-r * T) * nnd2) /
        365;
  const vega = (S * normPDF(d1) * sqrtT) / 100;
  return { price, delta, gamma, theta, vega };
}

function impliedVolatility(
  marketPrice: number,
  S: number,
  K: number,
  T: number,
  r: number,
  type: "CE" | "PE",
): number {
  if (marketPrice <= 0 || T <= 0) return 0.2;
  let sigma = 0.25;
  for (let i = 0; i < 100; i++) {
    const { price, vega } = blackScholes(S, K, T, r, sigma, type);
    const diff = price - marketPrice;
    if (Math.abs(diff) < 0.001) break;
    const vegaActual = vega * 100;
    if (Math.abs(vegaActual) < 1e-8) break;
    sigma = sigma - diff / vegaActual;
    if (sigma < 0.001) sigma = 0.001;
    if (sigma > 5) sigma = 5;
  }
  return sigma;
}

// ─── Theme ────────────────────────────────────────────────────────────────────
function useTheme() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    return (localStorage.getItem("upstox_theme") as "dark" | "light") ?? "dark";
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light") {
      root.classList.add("light");
    } else {
      root.classList.remove("light");
    }
    localStorage.setItem("upstox_theme", theme);
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));
  return { theme, toggle };
}

// ─── localStorage helpers ────────────────────────────────────────────────────
const LS = {
  get: (k: string) => localStorage.getItem(k) ?? "",
  set: (k: string, v: string) => localStorage.setItem(k, v),
  del: (k: string) => localStorage.removeItem(k),
};

const KEYS = {
  apiKey: "upstox_api_key",
  apiSecret: "upstox_api_secret",
  redirectUri: "upstox_redirect_uri",
  token: "upstox_access_token",
};

// ─── Index Lot Sizes ─────────────────────────────────────────────────────────
const INDEX_LOT_SIZES: Record<string, number> = {
  "NSE_INDEX|Nifty 50": 65,
  "NSE_INDEX|Nifty Bank": 30,
  "NSE_INDEX|FINNIFTY": 65,
  "NSE_INDEX|MIDCPNIFTY": 120,
  "BSE_INDEX|SENSEX": 20,
};

function getLotSize(instrumentKey: string): number {
  if (INDEX_LOT_SIZES[instrumentKey]) return INDEX_LOT_SIZES[instrumentKey];
  const key = instrumentKey.toUpperCase();
  if (key.includes("NIFTY BANK") || key.includes("BANKNIFTY")) return 30;
  if (key.includes("FINNIFTY")) return 65;
  if (key.includes("MIDCPNIFTY") || key.includes("MIDCAP")) return 120;
  if (key.includes("SENSEX")) return 20;
  if (key.includes("NIFTY")) return 65;
  return 1;
}

// ─── Types ────────────────────────────────────────────────────────────────────
type WsStatus = "disconnected" | "connecting" | "connected" | "error";

interface TickData {
  key: string;
  ltp: number;
  bid: number;
  ask: number;
  volume: number;
  change: number;
  ts: number;
}

interface Profile {
  name: string;
  email: string;
  broker: string;
  userId: string;
}

interface Funds {
  available: number;
  used: number;
  total: number;
}

interface Order {
  order_id: string;
  tradingsymbol: string;
  instrument_token: string;
  transaction_type: string;
  order_type: string;
  quantity: number;
  price: number;
  trigger_price: number;
  status: string;
  product: string;
  validity: string;
  exchange: string;
  average_price: number;
  placed_by: string;
}

interface Position {
  tradingsymbol: string;
  exchange: string;
  instrument_token: string;
  product: string;
  quantity: number;
  buy_quantity: number;
  sell_quantity: number;
  buy_price: number;
  sell_price: number;
  buy_value: number;
  sell_value: number;
  last_price: number;
  pnl: number;
  unrealised: number;
  realised: number;
  average_price: number;
  close_price: number;
}

interface Holding {
  instrument_token?: string;
  tradingsymbol: string;
  exchange: string;
  isin: string;
  quantity: number;
  authorised_quantity: number;
  t1_quantity: number;
  average_price: number;
  last_price: number;
  close_price: number;
  pnl: number;
  day_change: number;
  day_change_percentage: number;
}

interface OptionData {
  strike_price: number;
  lot_size?: number;
  call_options?: {
    instrument_key?: string;
    market_data?: { ltp?: number; oi?: number; volume?: number; iv?: number };
  };
  put_options?: {
    instrument_key?: string;
    market_data?: { ltp?: number; oi?: number; volume?: number; iv?: number };
  };
}

type Screen = "setup" | "dashboard" | "exchanging";

// ─── Utility: call Upstox REST ────────────────────────────────────────────────
async function upstoxFetch<T>(
  path: string,
  token: string,
  options?: { method?: string; body?: any },
): Promise<{ data: T | null; error: string | null }> {
  try {
    const fetchOptions: RequestInit = {
      method: options?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(options?.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
    };
    const res = await fetch(`https://api.upstox.com${path}`, fetchOptions);
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson?.errors?.[0]?.message ?? `HTTP ${res.status}`);
    }
    const json = await res.json();
    return { data: json.data ?? json, error: null };
  } catch (e: any) {
    return { data: null, error: e.message ?? "Network error" };
  }
}

// ─── Index WebSocket Hook ─────────────────────────────────────────────────────
const INDEX_KEYS = [
  "NSE_INDEX|Nifty 50",
  "BSE_INDEX|SENSEX",
  "NSE_INDEX|Nifty Bank",
  "NSE_INDEX|India VIX",
];

const INDEX_LABELS: Record<string, string> = {
  "NSE_INDEX|Nifty 50": "NIFTY",
  "BSE_INDEX|SENSEX": "SENSEX",
  "NSE_INDEX|Nifty Bank": "BANKNIFTY",
  "NSE_INDEX|India VIX": "VIX",
};

const TICKS_CACHE_KEY = "upstox_index_ticks_cache";

function useIndexWebSocket(token: string) {
  const [ticks, setTicks] = useState<Record<string, TickData>>(() => {
    try {
      const cached = localStorage.getItem(TICKS_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        // Ensure ts is set on all cached ticks
        const now = Date.now();
        for (const key of Object.keys(parsed)) {
          if (!parsed[key].ts) parsed[key].ts = now;
        }
        return parsed;
      }
      return {};
    } catch {
      return {};
    }
  });
  const [wsStatus, setWsStatus] = useState<WsStatus>("disconnected");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(() => {
    try {
      const cached = localStorage.getItem(TICKS_CACHE_KEY);
      if (cached) return new Date();
    } catch {}
    return null;
  });
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Periodic re-render for "last updated" display freshness
  useEffect(() => {
    const id = setInterval(() => {
      setLastUpdated((prev) => (prev ? new Date(prev.getTime()) : prev));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const processTick = useCallback((raw: any) => {
    if (!raw?.feeds) return;
    setTicks((prev) => {
      const next = { ...prev };
      for (const [key, feed] of Object.entries<any>(raw.feeds)) {
        const ff =
          (feed as any)?.ff?.marketFF ?? (feed as any)?.ff?.indexFF ?? {};
        const ltpData = ff.ltpc ?? {};
        const ltp = ltpData.ltp ?? ltpData.close_price ?? next[key]?.ltp ?? 0;
        if (ltp > 0) {
          next[key] = {
            key,
            ltp,
            bid: 0,
            ask: 0,
            volume: ff.marketLevel?.bidAskQuote?.[0]?.bidQ ?? 0,
            change: ltpData.cp ?? next[key]?.change ?? 0,
            ts: Date.now(),
          };
        }
      }
      try {
        localStorage.setItem(TICKS_CACHE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
    setLastUpdated(new Date());
  }, []);

  const connect = useCallback(() => {
    if (!token) return;
    if (wsRef.current) wsRef.current.close();
    setWsStatus("connecting");
    const ws = new WebSocket(
      `wss://api.upstox.com/v2/feed/market-data-feed?token=${encodeURIComponent(token)}`,
    );
    ws.onopen = () => {
      setWsStatus("connected");
      ws.send(
        JSON.stringify({
          guid: "index-bar-guid",
          method: "sub",
          data: { instrumentKeys: INDEX_KEYS, mode: "ltpc" },
        }),
      );
    };
    ws.onmessage = (event) => {
      if (event.data instanceof Blob) {
        event.data.arrayBuffer().then((buf) => {
          const text = new TextDecoder().decode(buf);
          try {
            processTick(JSON.parse(text));
          } catch {}
        });
        return;
      }
      if (event.data instanceof ArrayBuffer) {
        const text = new TextDecoder().decode(event.data);
        try {
          processTick(JSON.parse(text));
        } catch {}
        return;
      }
      try {
        processTick(JSON.parse(event.data));
      } catch {}
    };
    ws.onerror = () => setWsStatus("error");
    ws.onclose = () => {
      setWsStatus("disconnected");
      retryRef.current = setTimeout(() => connect(), 5000);
    };
    wsRef.current = ws;
  }, [token, processTick]);

  useEffect(() => {
    if (token) connect();
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [token, connect]);

  // REST polling fallback every 1s when WS is not connected
  useEffect(() => {
    if (!token) return;
    const poll = async () => {
      try {
        const keys = INDEX_KEYS.join(",");
        const res = await fetch(
          `https://api.upstox.com/v2/market-quote/ltp?instrument_key=${encodeURIComponent(keys)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
          },
        );
        if (!res.ok) return;
        const json = await res.json();
        if (json?.data) {
          setTicks((prev) => {
            const next = { ...prev };
            const now = Date.now();
            for (const [rawKey, val] of Object.entries<any>(json.data)) {
              const key = rawKey.replace(":", "|");
              const ltp = val?.last_price ?? 0;
              if (ltp > 0) {
                const prevLtp = prev[key]?.ltp ?? 0;
                next[key] = {
                  key,
                  ltp,
                  change: ltp - prevLtp,
                  bid: 0,
                  ask: 0,
                  volume: 0,
                  ts: now,
                };
              }
            }
            return next;
          });
          setLastUpdated(new Date());
        }
      } catch {}
    };
    poll();
    const id = setInterval(poll, 1000);
    return () => clearInterval(id);
  }, [token]);

  return { ticks, wsStatus, lastUpdated };
}

// ─── Shared UI primitives ─────────────────────────────────────────────────────
function PnlText({
  value,
  className = "",
}: { value: number; className?: string }) {
  const pos = value >= 0;
  return (
    <span
      className={`font-mono-data font-bold ${
        pos ? "text-gain" : "text-loss"
      } ${className}`}
    >
      {pos ? "+" : ""}
      {value.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
    </span>
  );
}

function PnlPct({
  value,
  className = "",
}: { value: number; className?: string }) {
  const pos = value >= 0;
  return (
    <span
      className={`font-mono-data ${
        pos ? "text-gain" : "text-loss"
      } ${className}`}
    >
      {pos ? "+" : ""}
      {value.toFixed(2)}%
    </span>
  );
}

// ─── Index Chip in Header ─────────────────────────────────────────────────────
function IndexChip({
  label,
  tick,
  loading,
  wsStatus,
  onContextMenu,
}: {
  label: string;
  tick?: TickData;
  loading: boolean;
  wsStatus: WsStatus;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const pos = (tick?.change ?? 0) >= 0;
  const isStale = wsStatus !== "connected" && !!tick;
  const isVix = label === "VIX";
  const vixColor =
    isVix && tick
      ? tick.ltp < 15
        ? "text-gain"
        : tick.ltp < 20
          ? "text-amber-400"
          : "text-loss"
      : "";

  const getTimeAgo = (ts: number) => {
    const secs = Math.floor((Date.now() - ts) / 1000);
    if (secs < 60) return `${secs}s ago`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    return new Date(ts).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div
      className="flex flex-col items-start gap-0.5 px-3 py-1.5 rounded border border-border bg-secondary/60 cursor-context-menu select-none"
      onContextMenu={onContextMenu}
      title="Right-click for options"
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-bold text-muted-foreground tracking-widest uppercase">
          {label}
        </span>
        {tick ? (
          <>
            <span
              className={`font-mono-data text-sm font-bold tabular-nums ${isVix ? vixColor : isStale ? "text-foreground/60" : "text-foreground"}`}
            >
              {tick.ltp.toLocaleString("en-IN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded ${
                pos
                  ? "bg-green-950 text-gain border border-green-800/40"
                  : "bg-red-950 text-loss border border-red-800/40"
              } ${isStale ? "opacity-60" : ""}`}
            >
              {pos ? "+" : ""}
              {tick.change.toFixed(2)}%
            </span>
            {isStale && <span className="text-[8px] text-amber-400/70">●</span>}
          </>
        ) : (
          <span className="text-[10px] text-muted-foreground font-mono-data">
            {loading ? "…" : "—"}
          </span>
        )}
      </div>
      {tick && (
        <span className="text-[9px] text-muted-foreground/50 font-mono-data leading-none">
          {getTimeAgo(tick.ts)}
        </span>
      )}
    </div>
  );
}

// ─── Trade Settings ───────────────────────────────────────────────────────────
const TRADE_SETTINGS_KEY = "upstox_trade_settings";
const ACCOUNTS_KEY = "upstox_accounts";

interface TradeSettings {
  slPct: number;
  trailingGap: number;
  tgt1RR: number;
  tgt2RR: number;
}

interface AccountEntry {
  id: string;
  name: string;
  apiKey: string;
  apiSecret: string;
  redirectUri: string;
  token: string;
}

interface GeneratedSignal {
  id: string;
  timestamp: number;
  date: string;
  instrument: string;
  strike: number;
  action: "BUY CALL" | "BUY PUT";
  expiry: string;
  entryPrice: number;
  sl: number;
  tgt1: number;
  tgt2: number;
  ceInstrumentKey?: string;
  peInstrumentKey?: string;
  status: "ACTIVE" | "TARGET1_HIT" | "TARGET2_HIT" | "SL_HIT" | "EXPIRED";
}

const DEFAULT_TRADE_SETTINGS: TradeSettings = {
  slPct: 25,
  trailingGap: 5,
  tgt1RR: 2,
  tgt2RR: 3,
};

function loadTradeSettings(): TradeSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(TRADE_SETTINGS_KEY) ?? "{}");
    return { ...DEFAULT_TRADE_SETTINGS, ...stored };
  } catch {
    return DEFAULT_TRADE_SETTINGS;
  }
}

function loadAccounts(): AccountEntry[] {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

// ─── Settings Modal ───────────────────────────────────────────────────────────

function SettingsModal({
  open,
  onClose,
  tradeSettings,
  onTradeSettingsSave,
}: {
  open: boolean;
  onClose: () => void;
  tradeSettings: TradeSettings;
  onTradeSettingsSave: (s: TradeSettings) => void;
}) {
  const [sl, setSl] = useState(String(tradeSettings.slPct));
  const [tg, setTg] = useState(String(tradeSettings.trailingGap));
  const [t1, setT1] = useState(String(tradeSettings.tgt1RR));
  const [t2, setT2] = useState(String(tradeSettings.tgt2RR));
  const [accounts, setAccounts] = useState<AccountEntry[]>(loadAccounts);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newAcc, setNewAcc] = useState<Omit<AccountEntry, "id">>({
    name: "",
    apiKey: "",
    apiSecret: "",
    redirectUri: "",
    token: "",
  });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const currentApiKey = localStorage.getItem("upstox_api_key") ?? "";

  const saveTradeSettings = () => {
    const s: TradeSettings = {
      slPct: Math.min(99, Math.max(1, Number(sl) || 25)),
      trailingGap: Math.min(50, Math.max(0.5, Number(tg) || 5)),
      tgt1RR: Math.min(20, Math.max(1, Number(t1) || 2)),
      tgt2RR: Math.min(20, Math.max(1, Number(t2) || 3)),
    };
    localStorage.setItem(TRADE_SETTINGS_KEY, JSON.stringify(s));
    onTradeSettingsSave(s);
    toast.success("Trade settings saved");
  };

  const saveAccounts = (list: AccountEntry[]) => {
    setAccounts(list);
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
  };

  const addAccount = () => {
    if (!newAcc.name || !newAcc.apiKey) {
      toast.error("Name and API Key are required");
      return;
    }
    const entry: AccountEntry = { ...newAcc, id: Date.now().toString() };
    saveAccounts([...accounts, entry]);
    setNewAcc({
      name: "",
      apiKey: "",
      apiSecret: "",
      redirectUri: "",
      token: "",
    });
    setShowAddForm(false);
    toast.success("Account added");
  };

  const switchAccount = (acc: AccountEntry) => {
    localStorage.setItem("upstox_api_key", acc.apiKey);
    localStorage.setItem("upstox_api_secret", acc.apiSecret);
    localStorage.setItem("upstox_redirect_uri", acc.redirectUri);
    localStorage.setItem("upstox_token", acc.token);
    toast.success(`Switched to ${acc.name}`);
    setTimeout(() => window.location.reload(), 600);
  };

  const deleteAccount = (id: string) => {
    saveAccounts(accounts.filter((a) => a.id !== id));
    setDeleteConfirm(null);
    toast.success("Account removed");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        data-ocid="settings.dialog"
        className="max-w-md w-full"
        style={{
          background: "oklch(var(--card))",
          border: "1px solid oklch(var(--border))",
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-sm font-bold text-foreground flex items-center gap-2">
            <Settings className="w-4 h-4 text-primary" />
            Settings
          </DialogTitle>
        </DialogHeader>
        <SettingsTabs defaultValue="trade">
          <SettingsTabsList className="w-full mb-3 bg-secondary">
            <SettingsTabsTrigger
              data-ocid="settings.trade_settings.tab"
              value="trade"
              className="flex-1 text-xs"
            >
              Trade Settings
            </SettingsTabsTrigger>
            <SettingsTabsTrigger
              data-ocid="settings.accounts.tab"
              value="accounts"
              className="flex-1 text-xs"
            >
              Accounts
            </SettingsTabsTrigger>
          </SettingsTabsList>

          <SettingsTabsContent value="trade" className="space-y-3 mt-0">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Stop Loss %
                </Label>
                <Input
                  data-ocid="settings.sl_pct.input"
                  type="number"
                  min={1}
                  max={99}
                  step={0.5}
                  value={sl}
                  onChange={(e) => setSl(e.target.value)}
                  className="h-8 mt-1 bg-secondary border-border font-mono-data text-xs"
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Trailing SL Gap %
                </Label>
                <Input
                  data-ocid="settings.trailing_gap.input"
                  type="number"
                  min={0.5}
                  max={50}
                  step={0.5}
                  value={tg}
                  onChange={(e) => setTg(e.target.value)}
                  className="h-8 mt-1 bg-secondary border-border font-mono-data text-xs"
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  TGT1 R:R
                </Label>
                <Input
                  data-ocid="settings.tgt1_rr.input"
                  type="number"
                  min={1}
                  max={20}
                  step={0.5}
                  value={t1}
                  onChange={(e) => setT1(e.target.value)}
                  className="h-8 mt-1 bg-secondary border-border font-mono-data text-xs"
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  TGT2 R:R
                </Label>
                <Input
                  data-ocid="settings.tgt2_rr.input"
                  type="number"
                  min={1}
                  max={20}
                  step={0.5}
                  value={t2}
                  onChange={(e) => setT2(e.target.value)}
                  className="h-8 mt-1 bg-secondary border-border font-mono-data text-xs"
                />
              </div>
            </div>
            <div className="pt-1 flex justify-between items-center">
              <p className="text-[10px] text-muted-foreground">
                SL: {sl}% · Trailing: {tg}% · TGT1: 1:{t1}R · TGT2: 1:{t2}R
              </p>
              <Button
                data-ocid="settings.save.button"
                size="sm"
                onClick={saveTradeSettings}
                className="h-7 text-xs"
              >
                Save
              </Button>
            </div>
          </SettingsTabsContent>

          <SettingsTabsContent value="accounts" className="mt-0">
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {accounts.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No saved accounts
                </p>
              )}
              {accounts.map((acc, i) => (
                <div
                  key={acc.id}
                  data-ocid={`settings.accounts.item.${i + 1}`}
                  className="flex items-center gap-2 p-2 rounded border border-border"
                  style={{ background: "oklch(var(--secondary))" }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">
                      {acc.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-mono truncate">
                      {acc.apiKey.slice(0, 8)}••••
                    </p>
                  </div>
                  {acc.apiKey === currentApiKey && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/30">
                      ACTIVE
                    </span>
                  )}
                  {deleteConfirm === acc.id ? (
                    <div className="flex gap-1">
                      <button
                        data-ocid={`settings.account.delete.button.${i + 1}`}
                        type="button"
                        onClick={() => deleteAccount(acc.id)}
                        className="text-[10px] px-2 py-1 rounded bg-red-900/60 text-red-300 border border-red-700/40 hover:bg-red-900"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirm(null)}
                        className="text-[10px] px-2 py-1 rounded bg-secondary text-muted-foreground border border-border"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-1">
                      <button
                        data-ocid={`settings.account.switch.button.${i + 1}`}
                        type="button"
                        onClick={() => switchAccount(acc)}
                        className="text-[10px] px-2 py-1 rounded bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30"
                      >
                        Switch
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirm(acc.id)}
                        className="text-[10px] px-2 py-1 rounded bg-secondary text-muted-foreground border border-border hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {showAddForm ? (
              <div className="mt-3 space-y-2 border-t border-border pt-3">
                <p className="text-xs font-semibold text-foreground">
                  Add Account
                </p>
                {[
                  {
                    key: "name",
                    label: "Account Name",
                    placeholder: "Main Account",
                  },
                  {
                    key: "apiKey",
                    label: "API Key",
                    placeholder: "your-api-key",
                  },
                  {
                    key: "apiSecret",
                    label: "API Secret",
                    placeholder: "your-api-secret",
                  },
                  {
                    key: "redirectUri",
                    label: "Redirect URI",
                    placeholder: "https://...",
                  },
                  {
                    key: "token",
                    label: "Access Token (optional)",
                    placeholder: "",
                  },
                ].map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      {label}
                    </Label>
                    <Input
                      type={
                        key === "apiSecret" || key === "token"
                          ? "password"
                          : "text"
                      }
                      placeholder={placeholder}
                      value={(newAcc as any)[key]}
                      onChange={(e) =>
                        setNewAcc((prev) => ({
                          ...prev,
                          [key]: e.target.value,
                        }))
                      }
                      className="h-7 mt-0.5 bg-secondary border-border text-xs font-mono"
                    />
                  </div>
                ))}
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={addAccount}
                    className="h-7 text-xs flex-1"
                  >
                    Save Account
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowAddForm(false)}
                    className="h-7 text-xs"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                data-ocid="settings.add_account.button"
                size="sm"
                variant="outline"
                onClick={() => setShowAddForm(true)}
                className="w-full mt-3 h-7 text-xs border-dashed"
              >
                <Plus className="w-3 h-3 mr-1" /> Add Account
              </Button>
            )}
          </SettingsTabsContent>
        </SettingsTabs>
      </DialogContent>
    </Dialog>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────
function AppHeader({
  onDisconnect,
  onMenuToggle,
  indexTicks,
  wsStatus,
  onIndexContextMenu,
  theme,
  onThemeToggle,
  lastUpdated,
  onSettingsOpen,
}: {
  token?: string;
  onDisconnect: () => void;
  onMenuToggle?: () => void;
  indexTicks: Record<string, TickData>;
  wsStatus: WsStatus;
  onIndexContextMenu: (key: string, label: string, e: React.MouseEvent) => void;
  theme?: "dark" | "light";
  onThemeToggle?: () => void;
  lastUpdated?: Date | null;
  onSettingsOpen?: () => void;
}) {
  return (
    <header
      data-ocid="header.section"
      className="sticky top-0 z-40 flex flex-col border-b border-border bg-background"
    >
      <div className="h-11 flex items-center px-3">
        {/* Left: Logo */}
        <div className="flex items-center gap-2 flex-none">
          {onMenuToggle && (
            <button
              type="button"
              onClick={onMenuToggle}
              className="lg:hidden w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground"
            >
              <Menu className="w-4 h-4" />
            </button>
          )}
          <Zap className="w-3.5 h-3.5 text-primary" />
          <span className="font-display font-bold text-xs tracking-wider text-foreground uppercase hidden sm:block">
            Upstox Connect
          </span>
        </div>

        {/* Center: Index chips */}
        <div className="flex-1 flex items-center justify-center gap-2 overflow-x-auto hide-scrollbar px-2">
          {INDEX_KEYS.map((key) => (
            <IndexChip
              key={key}
              label={INDEX_LABELS[key]}
              tick={indexTicks[key]}
              loading={wsStatus === "connecting"}
              wsStatus={wsStatus}
              onContextMenu={(e) => {
                e.preventDefault();
                onIndexContextMenu(key, INDEX_LABELS[key], e);
              }}
            />
          ))}
        </div>

        {/* Right: status + disconnect */}
        <div className="flex items-center gap-2 flex-none">
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              wsStatus === "connected"
                ? "bg-green-500 animate-pulse-dot"
                : wsStatus === "connecting"
                  ? "bg-yellow-400 animate-pulse"
                  : "bg-muted-foreground"
            }`}
          />
          <button
            data-ocid="dashboard.disconnect.button"
            type="button"
            onClick={onDisconnect}
            className="h-7 px-2 flex items-center gap-1 rounded border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors text-[10px] font-semibold"
          >
            <LogOut className="w-3 h-3" />
            <span className="hidden sm:inline">Disconnect</span>
          </button>
          {onThemeToggle && (
            <button
              data-ocid="header.theme_toggle"
              type="button"
              onClick={onThemeToggle}
              title={
                theme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
              className="h-7 w-7 flex items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            >
              {theme === "dark" ? (
                <Sun className="w-3.5 h-3.5" />
              ) : (
                <Moon className="w-3.5 h-3.5" />
              )}
            </button>
          )}
          {onSettingsOpen && (
            <button
              data-ocid="header.settings_button"
              type="button"
              onClick={onSettingsOpen}
              title="Settings"
              className="h-7 w-7 flex items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      {/* Last Updated bar */}
      <div
        className="px-3 py-0.5 flex items-center gap-2 border-t border-border/40"
        style={{ background: "oklch(var(--card))" }}
      >
        <span className="text-[10px] text-muted-foreground">
          Last Updated:{" "}
          <span className="font-mono-data text-foreground/80">
            {lastUpdated ? lastUpdated.toLocaleTimeString("en-IN") : "—"}
          </span>
        </span>
        <span className="text-[10px] text-muted-foreground/40">•</span>
        <span className="text-[10px] text-muted-foreground">
          Auto-refresh: <span className="text-green-400 font-semibold">ON</span>
        </span>
      </div>
    </header>
  );
}

// ─── Watchlist Sidebar ────────────────────────────────────────────────────────
const WATCHLIST_ITEMS = [
  { symbol: "RELIANCE", exchange: "NSE", key: "NSE_EQ|INE002A01018" },
  { symbol: "TCS", exchange: "NSE", key: "NSE_EQ|INE467B01029" },
  { symbol: "HDFCBANK", exchange: "NSE", key: "NSE_EQ|INE040A01034" },
  { symbol: "INFY", exchange: "NSE", key: "NSE_EQ|INE009A01021" },
  { symbol: "ICICIBANK", exchange: "NSE", key: "NSE_EQ|INE090A01021" },
  { symbol: "SBIN", exchange: "NSE", key: "NSE_EQ|INE062A01020" },
  { symbol: "BAJFINANCE", exchange: "NSE", key: "NSE_EQ|INE296A01024" },
  { symbol: "NIFTY 50", exchange: "NSE IDX", key: "NSE_INDEX|Nifty 50" },
  { symbol: "BANK NIFTY", exchange: "NSE IDX", key: "NSE_INDEX|Nifty Bank" },
  { symbol: "SENSEX", exchange: "BSE IDX", key: "BSE_INDEX|SENSEX" },
];

function WatchlistPanel({
  ticks,
  onClose,
}: { ticks: Record<string, TickData>; onClose?: () => void }) {
  return (
    <aside
      data-ocid="watchlist.panel"
      className="w-60 flex-none border-r border-border flex flex-col h-full"
      style={{ background: "oklch(var(--card))" }}
    >
      <div
        className="flex items-center justify-between px-3 py-2 border-b border-border"
        style={{ background: "oklch(var(--background))" }}
      >
        <span className="text-[10px] font-bold text-muted-foreground tracking-widest uppercase">
          Watchlist
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground"
          >
            <Plus className="w-3 h-3" />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground lg:hidden"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto hide-scrollbar">
        {WATCHLIST_ITEMS.map((item) => {
          const tick = ticks[item.key];
          const pos = (tick?.change ?? 0) >= 0;
          return (
            <div
              key={item.key}
              className="flex items-center justify-between px-3 py-2 border-b border-border/50 hover:bg-secondary/60 transition-colors cursor-pointer"
            >
              <div className="min-w-0">
                <p className="text-xs font-bold text-foreground truncate">
                  {item.symbol}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {item.exchange}
                </p>
              </div>
              <div className="text-right flex-none ml-2">
                <p className="font-mono-data text-xs font-bold text-foreground">
                  {tick
                    ? tick.ltp.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    : "—"}
                </p>
                {tick && (
                  <p
                    className={`text-[10px] font-mono-data font-bold ${pos ? "text-gain" : "text-loss"}`}
                  >
                    {pos ? "+" : ""}
                    {tick.change.toFixed(2)}%
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

// ─── Tab Nav ──────────────────────────────────────────────────────────────────
const TABS = [
  { value: "overview", label: "Overview", icon: User },
  { value: "funds", label: "Funds", icon: Wallet },
  { value: "orders", label: "Orders", icon: BookOpen },
  { value: "positions", label: "Positions", icon: Layers },
  { value: "holdings", label: "Holdings", icon: BriefcaseBusiness },
  { value: "options", label: "Options", icon: LineChart },
  { value: "market", label: "Live", icon: Activity },
  { value: "risk", label: "Risk", icon: Shield },
] as const;

type TabValue = (typeof TABS)[number]["value"];

function TabNav({
  active,
  onChange,
}: { active: TabValue; onChange: (v: TabValue) => void }) {
  return (
    <div
      className="flex-shrink-0 flex overflow-x-auto lg:overflow-x-visible hide-scrollbar border-b border-border relative z-50"
      style={{ background: "oklch(var(--background))" }}
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = active === tab.value;
        return (
          <button
            key={tab.value}
            data-ocid={`tab.${tab.value}`}
            type="button"
            onClick={() => onChange(tab.value)}
            className={`flex-none flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${
              isActive
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground/70"
            }`}
          >
            <Icon className="w-3 h-3" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Orders Tab ───────────────────────────────────────────────────────────────
// ─── Orders Tab ───────────────────────────────────────────────────────────────
function OrdersTab({
  token,
  prefill,
  onPrefillConsumed,
  onBack,
}: {
  token: string;
  prefill?: {
    instrumentKey?: string;
    txType?: "BUY" | "SELL";
    price?: string;
    quantity?: string;
    lotSize?: number;
  } | null;
  onPrefillConsumed?: () => void;
  onBack?: () => void;
}) {
  // ── Sub-tab state ──
  const [orderSubTab, setOrderSubTab] = useState<"regular" | "gtt">("regular");

  // ── Regular Order state ──
  const [instrumentKey, setInstrumentKey] = useState("NSE_EQ|INE848E01016");
  const [txType, setTxType] = useState<"BUY" | "SELL">("BUY");
  const [orderType, setOrderType] = useState("MARKET");
  const [product, setProduct] = useState("D");
  const [qtyMode, setQtyMode] = useState<"QTY" | "LOTS">("LOTS");
  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState("");
  const [triggerPrice, setTriggerPrice] = useState("");
  const [validity, setValidity] = useState("DAY");
  const [placing, setPlacing] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [showGttForm, setShowGttForm] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState<{
    orderId: string;
    type: "regular" | "gtt";
  } | null>(null);
  const [orderFormDepth, setOrderFormDepth] = useState<{
    bids: Array<{ price: number; quantity: number }>;
    asks: Array<{ price: number; quantity: number }>;
  } | null>(null);
  const [orderFormDepthLoading, setOrderFormDepthLoading] = useState(false);
  const [requiredMargin, setRequiredMargin] = useState<number | null>(null);
  const [isEstimatedMargin, setIsEstimatedMargin] = useState(false);
  const [availableMargin, setAvailableMargin] = useState<number | null>(null);
  const [marginLoading, setMarginLoading] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [orderStatusFilter, setOrderStatusFilter] = useState<
    "ALL" | "PENDING" | "SUCCESS" | "CANCELLED"
  >("ALL");

  // ── GTT state ──
  const [gttOrders, setGttOrders] = useState<any[]>([]);
  const [gttLoading, setGttLoading] = useState(false);
  const [gttStatusFilter, setGttStatusFilter] = useState<
    "ALL" | "OPEN" | "TRIGGERED" | "CANCELLED"
  >("ALL");
  const [gttType, setGttType] = useState<"SINGLE" | "MULTIPLE">("MULTIPLE");
  const [gttInstrumentToken, setGttInstrumentToken] = useState("");
  const [gttTxType, setGttTxType] = useState<"BUY" | "SELL">("BUY");
  const [gttProduct, setGttProduct] = useState("D");
  const [gttQty, setGttQty] = useState("1");
  const [gttQtyMode, setGttQtyMode] = useState<"LOTS" | "QTY">("LOTS");
  const [gttLotSize, setGttLotSize] = useState<string>("");
  const [gttDepth, setGttDepth] = useState<{
    bids: MarketDepthEntry[];
    asks: MarketDepthEntry[];
  } | null>(null);
  const [gttDepthLoading, setGttDepthLoading] = useState(false);
  const [gttEntryPrice, setGttEntryPrice] = useState("");
  const [gttEntryTriggerType, setGttEntryTriggerType] = useState<
    "ABOVE" | "BELOW"
  >("ABOVE");
  const [gttTargetPrice, setGttTargetPrice] = useState("");
  const [gttSlPrice, setGttSlPrice] = useState("");
  const [gttTrailingGap, setGttTrailingGap] = useState("");
  const [gttEditId, setGttEditId] = useState<string | null>(null);
  const [gttPlacing, setGttPlacing] = useState(false);
  const [gttRowDepthOpen, setGttRowDepthOpen] = useState<Set<string>>(
    new Set(),
  );
  const [gttRowDepthData, setGttRowDepthData] = useState<
    Record<
      string,
      { bids: MarketDepthEntry[]; asks: MarketDepthEntry[] } | null
    >
  >({});
  const [prefillLotSize, setPrefillLotSize] = useState<number | null>(null);
  const [prefillPrice, setPrefillPrice] = useState("");
  const [editableLotSize, setEditableLotSize] = useState<string>("");

  // ── Regular order fetching ──
  const fetchOrders = useCallback(async () => {
    setLoadingOrders(true);
    const res = await upstoxFetch<Order[]>("/v2/order/retrieve-all", token);
    if (res.data) setOrders(Array.isArray(res.data) ? res.data : []);
    else if (res.error) toast.error(`Orders: ${res.error}`);
    setLoadingOrders(false);
  }, [token]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // ── Market depth for order form ──
  useEffect(() => {
    if (!token || !instrumentKey) return;
    let cancelled = false;
    const parseDepth = (quote: any) => {
      if (!quote?.depth) return null;
      return {
        bids: (quote.depth.buy || [])
          .slice(0, 5)
          .map((b: any) => ({ price: b.price, quantity: b.quantity })),
        asks: (quote.depth.sell || [])
          .slice(0, 5)
          .map((a: any) => ({ price: a.price, quantity: a.quantity })),
      };
    };
    const fetchDepth = async () => {
      try {
        const encoded = encodeURIComponent(instrumentKey);
        const res = await fetch(
          `https://api.upstox.com/v2/market-quote/depth?instrument_key=${encoded}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
          },
        );
        const data = await res.json();
        if (!cancelled && data?.data) {
          const quote =
            data.data[instrumentKey] ||
            data.data[decodeURIComponent(instrumentKey)] ||
            (Object.values(data.data)[0] as any);
          const depth = parseDepth(quote);
          if (depth) {
            setOrderFormDepth(depth);
            setOrderFormDepthLoading(false);
            return;
          }
        }
        const res2 = await fetch(
          `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encoded}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/json",
            },
          },
        );
        const data2 = await res2.json();
        if (!cancelled && data2?.data) {
          const quote2 =
            data2.data[instrumentKey] ||
            data2.data[decodeURIComponent(instrumentKey)] ||
            (Object.values(data2.data)[0] as any);
          const depth2 = parseDepth(quote2);
          if (depth2) {
            setOrderFormDepth(depth2);
            setOrderFormDepthLoading(false);
            return;
          }
        }
        if (!cancelled) setOrderFormDepthLoading(false);
      } catch {
        if (!cancelled) setOrderFormDepthLoading(false);
      }
    };
    setOrderFormDepthLoading(true);
    fetchDepth();
    const interval = setInterval(fetchDepth, 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token, instrumentKey]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: prefill is intentional one-shot
  useEffect(() => {
    if (prefill) {
      // @ts-ignore
      const isGttMode = !!(prefill as any).gttMode;
      if (isGttMode) {
        // Switch to GTT sub-tab and prefill GTT form
        setOrderSubTab("gtt");
        setShowGttForm(true);
        if (prefill.instrumentKey) setGttInstrumentToken(prefill.instrumentKey);
        if (prefill.txType) setGttTxType(prefill.txType as "BUY" | "SELL");
        if (prefill.price) setGttEntryPrice(prefill.price);
        if (prefill.quantity) setGttQty(prefill.quantity);
        if (prefill.lotSize) setGttLotSize(String(prefill.lotSize));
      } else {
        setShowOrderForm(true);
        if (prefill.instrumentKey) {
          setInstrumentKey(prefill.instrumentKey);
          // Also sync to GTT instrument token so switching tabs carries the key
          setGttInstrumentToken(prefill.instrumentKey);
        }
        if (prefill.txType) setTxType(prefill.txType);
        if (prefill.price) {
          setPrice(prefill.price);
          setPrefillPrice(prefill.price);
          setOrderType("LIMIT");
        }
        if (prefill.quantity) setQuantity(prefill.quantity);
        if (prefill.lotSize) {
          setPrefillLotSize(prefill.lotSize);
          setEditableLotSize(String(prefill.lotSize));
        } else {
          setPrefillLotSize(null);
          setEditableLotSize("");
        }
      }
      onPrefillConsumed?.();
    }
  }, [prefill]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional reset
  useEffect(() => {
    if (qtyMode === "LOTS") setQuantity("1");
  }, [instrumentKey, qtyMode]);

  useEffect(() => {
    if (!token) return;
    upstoxFetch<any>("/v2/user/get-funds-and-margin", token).then((res) => {
      if (res.data) {
        const d = res.data?.equity ?? res.data;
        setAvailableMargin(d.available_margin ?? d.available_balance ?? 0);
      }
    });
  }, [token]);

  useEffect(() => {
    if (!token || !instrumentKey || !quantity) return;
    const actualQty =
      qtyMode === "LOTS"
        ? Number.parseInt(quantity || "1") * getLotSize(instrumentKey)
        : Number.parseInt(quantity || "0");
    if (!actualQty) return;
    const timer = setTimeout(async () => {
      setMarginLoading(true);
      try {
        const res = await upstoxFetch<any>("/v2/order/margin", token, {
          method: "POST",
          body: [
            {
              instrument_key: instrumentKey,
              transaction_type: txType,
              quantity: actualQty,
              price: Number.parseFloat(price) || 0,
              product,
              order_type: orderType,
            },
          ],
        });
        if (res.data?.required_margin !== undefined)
          setRequiredMargin(res.data.required_margin);
        else if (
          Array.isArray(res.data) &&
          res.data[0]?.required_margin !== undefined
        ) {
          setRequiredMargin(res.data[0].required_margin);
          setIsEstimatedMargin(false);
        } else {
          const ltpFallback =
            Number.parseFloat(price) || Number.parseFloat(prefillPrice) || 0;
          const actualQtyFallback =
            qtyMode === "LOTS"
              ? Number.parseInt(quantity || "1") * getLotSize(instrumentKey)
              : Number.parseInt(quantity || "0");
          if (ltpFallback > 0 && actualQtyFallback > 0) {
            setRequiredMargin(actualQtyFallback * ltpFallback);
            setIsEstimatedMargin(true);
          }
        }
      } catch {
        const ltpFallback =
          Number.parseFloat(price) || Number.parseFloat(prefillPrice) || 0;
        const actualQtyFallback =
          qtyMode === "LOTS"
            ? Number.parseInt(quantity || "1") * getLotSize(instrumentKey)
            : Number.parseInt(quantity || "0");
        if (ltpFallback > 0 && actualQtyFallback > 0) {
          setRequiredMargin(actualQtyFallback * ltpFallback);
          setIsEstimatedMargin(true);
        }
      }
      setMarginLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [
    token,
    instrumentKey,
    txType,
    orderType,
    product,
    quantity,
    price,
    prefillPrice,
    qtyMode,
  ]);

  // ── GTT fetching ──
  const fetchGTTOrders = useCallback(async () => {
    try {
      setGttLoading(true);
      const res = await fetch("https://api.upstox.com/v3/order/gtt", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });
      const json = await res.json();
      setGttOrders(json?.data || []);
    } catch {
      // silently ignore
    } finally {
      setGttLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (orderSubTab !== "gtt") return;
    fetchGTTOrders();
  }, [orderSubTab, fetchGTTOrders]);

  // ── Place / modify regular order (v2 API) ──
  const placeOrder = async () => {
    if (!instrumentKey.trim() || !quantity) {
      toast.error("Instrument key and quantity are required");
      return;
    }
    setPlacing(true);
    // Fetch real lot_size from Upstox market quotes API (authoritative source)
    const parsedEditableLotSize = Number.parseInt(editableLotSize || "0");
    let lotSize =
      parsedEditableLotSize > 0
        ? parsedEditableLotSize
        : (prefillLotSize ?? getLotSize(instrumentKey));
    try {
      const qRes = await fetch(
        `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encodeURIComponent(instrumentKey.trim())}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        },
      );
      if (qRes.ok) {
        const qJson = await qRes.json();
        const contractData = qJson?.data?.[instrumentKey.trim()];
        if (contractData?.lot_size && Number(contractData.lot_size) > 0) {
          lotSize = Number(contractData.lot_size);
        }
      }
    } catch (_) {
      /* use fallback lotSize */
    }
    const lotsEntered = Number.parseInt(quantity || "1");
    const rawQty =
      qtyMode === "LOTS"
        ? lotsEntered * lotSize
        : Number.parseInt(quantity, 10);
    // Ensure quantity is a multiple of lot size
    const actualQty = Math.round(rawQty / lotSize) * lotSize;
    if (actualQty <= 0) {
      toast.error(`Quantity must be at least 1 lot (${lotSize} units)`);
      setPlacing(false);
      return;
    }
    if (rawQty !== actualQty) {
      toast.info(
        `Quantity rounded to ${actualQty} (multiple of lot size ${lotSize})`,
      );
    }
    const parsedPrice = Number.parseFloat(price) || 0;
    const parsedTrigger = Number.parseFloat(triggerPrice) || 0;

    if ((orderType === "SL" || orderType === "SL-M") && parsedTrigger <= 0) {
      toast.error("Trigger price is required for SL/SL-M orders");
      setPlacing(false);
      return;
    }

    try {
      if (editingOrderId) {
        const modifyBody: any = {
          order_id: editingOrderId,
          quantity: actualQty,
          validity,
          price: orderType === "MARKET" ? 0 : parsedPrice,
          order_type: orderType,
          disclosed_quantity: 0,
          trigger_price:
            orderType === "SL" || orderType === "SL-M" ? parsedTrigger : 0,
        };
        const res = await fetch("https://api.upstox.com/v2/order/modify", {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(modifyBody),
        });
        const json = await res.json();
        if (res.ok) {
          toast.success(`Order modified: ${editingOrderId}`);
          setEditingOrderId(null);
          fetchOrders();
        } else {
          toast.error(
            `Modify failed: ${
              json?.errors?.[0]?.message ||
              json?.message ||
              `HTTP ${res.status}`
            }`,
          );
        }
      } else {
        toast.info(
          `Placing: ${instrumentKey} | qty: ${actualQty} | lotSize: ${lotSize} | edit: ${editableLotSize || "auto"}`,
          { duration: 3000 },
        );
        const body: any = {
          instrument_key: instrumentKey.trim(),
          instrument_token: instrumentKey.trim(),
          transaction_type: txType,
          order_type: orderType,
          product,
          quantity: actualQty,
          price: orderType === "MARKET" ? 0 : parsedPrice,
          trigger_price:
            orderType === "SL" || orderType === "SL-M" ? parsedTrigger : 0,
          disclosed_quantity: 0,
          validity,
          is_amo: false,
        };
        const res = await fetch("https://api.upstox.com/v2/order/place", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (res.ok) {
          toast.success(`Order placed! ID: ${json?.data?.order_id ?? "—"}`);
          setShowOrderForm(false);
          fetchOrders();
        } else {
          const errMsg = `HTTP ${res.status}: ${JSON.stringify(json)}`;
          toast.error(`Order failed: ${errMsg}`, { duration: 8000 });
        }
      }
    } catch (e: any) {
      toast.error(`Order error: ${e.message ?? "Network error"}`);
    }
    setPlacing(false);
  };

  const cancelRegularOrder = async (orderId: string) => {
    try {
      const res = await fetch(
        `https://api.upstox.com/v2/order/cancel?order_id=${orderId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        },
      );
      const json = await res.json();
      if (res.ok) {
        toast.success(`Order cancelled: ${orderId}`);
        fetchOrders();
      } else {
        toast.error(
          `Cancel failed: ${
            json?.errors?.[0]?.message || json?.message || `HTTP ${res.status}`
          }`,
        );
      }
    } catch (e: any) {
      toast.error(`Cancel error: ${e.message}`);
    }
  };

  const startEditOrder = (order: Order) => {
    setEditingOrderId(order.order_id);
    if (order.instrument_token) setInstrumentKey(order.instrument_token);
    setTxType(order.transaction_type as "BUY" | "SELL");
    setOrderType(order.order_type || "MARKET");
    setProduct(order.product || "D");
    setQtyMode("QTY");
    setQuantity(String(order.quantity || 1));
    setPrice(String(order.price || ""));
    setTriggerPrice(String(order.trigger_price || ""));
    setOrderSubTab("regular");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ── GTT operations ──
  const resetGttForm = () => {
    setGttInstrumentToken("");
    setGttEntryPrice("");
    setGttTargetPrice("");
    setGttSlPrice("");
    setGttTrailingGap("");
    setGttQty("1");
    setGttQtyMode("LOTS");
    setGttLotSize("");
    setGttDepth(null);
    setGttEditId(null);
    setShowGttForm(false);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: interval-based depth fetch
  useEffect(() => {
    if (!gttInstrumentToken.trim() || orderSubTab !== "gtt") return;
    if (!token) return;

    let cancelled = false;
    const fetchGttDepth = async () => {
      try {
        setGttDepthLoading(true);
        const encoded = encodeURIComponent(gttInstrumentToken);
        const res = await fetch(
          `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encoded}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          },
        );
        if (!res.ok) return;
        const d = await res.json();
        const key = Object.keys(d?.data ?? {})[0];
        const depthData = d?.data?.[key]?.depth;
        if (depthData && !cancelled) {
          const bids = (depthData.buy || []).slice(0, 5).map((b: any) => ({
            price: b.price,
            quantity: b.quantity,
            orders: b.orders,
          }));
          const asks = (depthData.sell || []).slice(0, 5).map((a: any) => ({
            price: a.price,
            quantity: a.quantity,
            orders: a.orders,
          }));
          setGttDepth({ bids, asks });
        }
      } catch {
      } finally {
        if (!cancelled) setGttDepthLoading(false);
      }
    };
    fetchGttDepth();
    const id = setInterval(fetchGttDepth, 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [gttInstrumentToken, orderSubTab, token]);

  const submitGTTOrder = async () => {
    if (!gttInstrumentToken.trim() || !gttEntryPrice) {
      toast.error("Instrument token and entry price are required");
      return;
    }
    const effectiveLotSize =
      Number.parseInt(gttLotSize || "0") > 0
        ? Number.parseInt(gttLotSize)
        : getLotSize(gttInstrumentToken);
    const rawQty =
      gttQtyMode === "LOTS"
        ? Number.parseInt(gttQty || "1") * effectiveLotSize
        : Number.parseInt(gttQty || String(effectiveLotSize));
    const actualQty = Math.round(rawQty / effectiveLotSize) * effectiveLotSize;
    setGttPlacing(true);
    const rules: any[] = [];
    rules.push({
      strategy: "ENTRY",
      trigger_type: gttEntryTriggerType,
      trigger_price: Number.parseFloat(gttEntryPrice),
    });
    if (gttType === "MULTIPLE") {
      if (!gttTargetPrice || !gttSlPrice) {
        toast.error("Target and SL price required for MULTIPLE type");
        setGttPlacing(false);
        return;
      }
      rules.push({
        strategy: "TARGET",
        trigger_type: "IMMEDIATE",
        trigger_price: Number.parseFloat(gttTargetPrice),
      });
      const slRule: any = {
        strategy: "STOPLOSS",
        trigger_type: "IMMEDIATE",
        trigger_price: Number.parseFloat(gttSlPrice),
      };
      if (gttTrailingGap)
        slRule.trailing_gap = Number.parseFloat(gttTrailingGap);
      rules.push(slRule);
    }
    try {
      if (gttEditId) {
        const res = await fetch("https://api.upstox.com/v3/order/gtt/modify", {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            type: gttType,
            quantity: actualQty,
            rules,
            gtt_order_id: gttEditId,
          }),
        });
        const json = await res.json();
        if (res.ok) {
          toast.success(`GTT updated: ${gttEditId}`);
          resetGttForm();
        } else {
          toast.error(
            `GTT modify failed: ${
              json?.errors?.[0]?.message ||
              json?.errors?.[0]?.reason ||
              json?.message ||
              json?.error ||
              `HTTP ${res.status}: ${JSON.stringify(json).slice(0, 200)}`
            }`,
          );
        }
      } else {
        const res = await fetch("https://api.upstox.com/v3/order/gtt/place", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            type: gttType,
            quantity: actualQty,
            product: gttProduct,
            rules,
            instrument_token: gttInstrumentToken,
            transaction_type: gttTxType,
          }),
        });
        const json = await res.json();
        if (res.ok) {
          toast.success(`GTT placed! ID: ${json?.data?.gtt_order_id ?? "—"}`);
          resetGttForm();
          setShowOrderForm(false);
        } else {
          toast.error(
            `GTT failed: ${
              json?.errors?.[0]?.message ||
              json?.errors?.[0]?.reason ||
              json?.message ||
              json?.error ||
              `HTTP ${res.status}: ${JSON.stringify(json).slice(0, 200)}`
            }`,
          );
        }
      }
      fetchGTTOrders();
    } catch (e: any) {
      toast.error(`GTT error: ${e.message ?? "Network error"}`);
    }
    setGttPlacing(false);
  };

  const cancelGTTOrder = async (gttOrderId: string) => {
    try {
      const res = await fetch("https://api.upstox.com/v3/order/gtt/cancel", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ gtt_order_id: gttOrderId }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success(`GTT cancelled: ${gttOrderId}`);
        fetchGTTOrders();
      } else {
        toast.error(
          `GTT cancel failed: ${
            json?.errors?.[0]?.message || json?.message || `HTTP ${res.status}`
          }`,
        );
      }
    } catch (e: any) {
      toast.error(`GTT cancel error: ${e.message}`);
    }
  };

  const fetchGttRowDepth = async (
    gttOrderId: string,
    instrumentToken: string,
  ) => {
    if (!token || !instrumentToken) return;
    try {
      const encoded = encodeURIComponent(instrumentToken);
      const res = await fetch(
        `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encoded}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );
      if (!res.ok) return;
      const d = await res.json();
      const key = Object.keys(d?.data ?? {})[0];
      const depthData = d?.data?.[key]?.depth;
      if (depthData) {
        const bids = (depthData.buy || []).slice(0, 5).map((b: any) => ({
          price: b.price,
          quantity: b.quantity,
          orders: b.orders,
        }));
        const asks = (depthData.sell || []).slice(0, 5).map((a: any) => ({
          price: a.price,
          quantity: a.quantity,
          orders: a.orders,
        }));
        setGttRowDepthData((prev) => ({
          ...prev,
          [gttOrderId]: { bids, asks },
        }));
      }
    } catch {
      /* ignore */
    }
  };

  const toggleGttRowDepth = (gttOrderId: string, instrumentToken: string) => {
    setGttRowDepthOpen((prev) => {
      const next = new Set(prev);
      if (next.has(gttOrderId)) {
        next.delete(gttOrderId);
      } else {
        next.add(gttOrderId);
        fetchGttRowDepth(gttOrderId, instrumentToken);
      }
      return next;
    });
  };

  const startEditGTT = (gtt: any) => {
    setGttEditId(gtt.gtt_order_id || gtt.id);
    setGttType(gtt.type || "SINGLE");
    setGttInstrumentToken(gtt.instrument_token || "");
    setGttTxType(gtt.transaction_type || "BUY");
    setGttProduct(gtt.product || "D");
    setGttQty(String(gtt.quantity || 1));
    const entryRule = (gtt.rules || []).find(
      (r: any) => r.strategy === "ENTRY",
    );
    if (entryRule) {
      setGttEntryPrice(String(entryRule.trigger_price || ""));
      setGttEntryTriggerType(entryRule.trigger_type || "ABOVE");
    }
    const tgtRule = (gtt.rules || []).find((r: any) => r.strategy === "TARGET");
    if (tgtRule) setGttTargetPrice(String(tgtRule.trigger_price || ""));
    const slRule = (gtt.rules || []).find(
      (r: any) => r.strategy === "STOPLOSS",
    );
    if (slRule) {
      setGttSlPrice(String(slRule.trigger_price || ""));
      setGttTrailingGap(String(slRule.trailing_gap || ""));
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const statusBadge = (s: string) => {
    if (s === "COMPLETE") return "bg-green-950 text-gain border-green-800/40";
    if (s === "REJECTED") return "bg-red-950 text-loss border-red-800/40";
    if (s === "OPEN" || s === "PENDING")
      return "bg-amber-950 text-amber-400 border-amber-800/40";
    return "bg-secondary text-muted-foreground border-border";
  };

  const isPendingOrder = (o: Order) =>
    [
      "open",
      "pending",
      "trigger pending",
      "after market order req received",
      "modify pending",
      "cancel pending",
    ].some((s) => o.status.toLowerCase().includes(s));

  return (
    <>
      <div className="space-y-0">
        {/* Back to Options */}
        {prefill && onBack && (
          <div className="px-4 pt-3 pb-1">
            <button
              data-ocid="orders.back_button"
              type="button"
              onClick={onBack}
              className="flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
            >
              ← Back to Options
            </button>
          </div>
        )}

        {/* Sub-tab pills */}
        <div className="flex gap-2 px-4 pt-3 pb-2 border-b border-border">
          <button
            data-ocid="orders.regular_tab"
            type="button"
            onClick={() => setOrderSubTab("regular")}
            className={`px-3 py-1.5 rounded text-[11px] font-bold transition-colors ${
              orderSubTab === "regular"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            Regular Orders
          </button>
          <button
            data-ocid="orders.gtt_tab"
            type="button"
            onClick={() => {
              setOrderSubTab("gtt");
              // Sync regular order instrument key into GTT instrument token
              setGttInstrumentToken((prev) => prev || instrumentKey);
            }}
            className={`px-3 py-1.5 rounded text-[11px] font-bold transition-colors ${
              orderSubTab === "gtt"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            GTT Orders
          </button>
        </div>

        {orderSubTab === "regular" && (
          <>
            {/* Order Form */}
            {showOrderForm && (
              <>
                <div className="p-4 border-b border-border">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-bold text-muted-foreground tracking-widest uppercase">
                      {editingOrderId
                        ? `Modify Order · ${editingOrderId.slice(0, 16)}...`
                        : "Place Order"}
                    </p>
                    {editingOrderId && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingOrderId(null);
                          setShowOrderForm(false);
                          setPrice("");
                          setTriggerPrice("");
                        }}
                        className="text-[10px] text-muted-foreground hover:text-foreground underline"
                      >
                        Cancel Edit
                      </button>
                    )}
                  </div>

                  {/* BUY / SELL toggle */}
                  <div className="flex gap-0 mb-3 rounded overflow-hidden border border-border">
                    <button
                      data-ocid="orders.buy_toggle"
                      type="button"
                      onClick={() => setTxType("BUY")}
                      className={`flex-1 py-2 text-xs font-bold transition-colors ${
                        txType === "BUY"
                          ? "bg-blue-600 text-white"
                          : "bg-secondary text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      BUY
                    </button>
                    <button
                      data-ocid="orders.sell_toggle"
                      type="button"
                      onClick={() => setTxType("SELL")}
                      className={`flex-1 py-2 text-xs font-bold transition-colors ${
                        txType === "SELL"
                          ? "bg-red-600 text-white"
                          : "bg-secondary text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      SELL
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <div>
                      <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        Instrument Key
                      </Label>
                      <Input
                        data-ocid="orders.instrument_input"
                        placeholder="NSE_EQ|INE848E01016"
                        value={instrumentKey}
                        onChange={(e) => setInstrumentKey(e.target.value)}
                        className="h-8 mt-1 bg-secondary border-border font-mono text-xs"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                            Qty
                          </Label>
                          <div className="flex rounded overflow-hidden border border-border text-[9px]">
                            <button
                              data-ocid="orders.qty_mode_lots"
                              type="button"
                              onClick={() => {
                                setQtyMode("LOTS");
                                setQuantity("1");
                              }}
                              className={`px-2 py-0.5 font-bold transition-colors ${
                                qtyMode === "LOTS"
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-secondary text-muted-foreground"
                              }`}
                            >
                              LOTS
                            </button>
                            <button
                              data-ocid="orders.qty_mode_qty"
                              type="button"
                              onClick={() => {
                                setQtyMode("QTY");
                                setQuantity(
                                  String(
                                    prefillLotSize ?? getLotSize(instrumentKey),
                                  ),
                                );
                              }}
                              className={`px-2 py-0.5 font-bold transition-colors ${
                                qtyMode === "QTY"
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-secondary text-muted-foreground"
                              }`}
                            >
                              QTY
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            data-ocid="orders.qty_decrease_button"
                            type="button"
                            onClick={() => {
                              const step =
                                qtyMode === "LOTS"
                                  ? 1
                                  : getLotSize(instrumentKey);
                              setQuantity(
                                String(
                                  Math.max(
                                    qtyMode === "LOTS" ? 1 : 0,
                                    Number.parseInt(quantity || "1") - step,
                                  ),
                                ),
                              );
                            }}
                            className="h-8 w-8 bg-secondary border border-border rounded text-xs font-bold hover:bg-muted flex items-center justify-center"
                          >
                            −
                          </button>
                          <input
                            data-ocid="orders.qty_input"
                            type="number"
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                            className="h-8 flex-1 bg-secondary border border-border text-foreground text-xs rounded px-2 text-center font-mono min-w-0"
                            placeholder={qtyMode === "LOTS" ? "1" : "0"}
                          />
                          <button
                            data-ocid="orders.qty_increase_button"
                            type="button"
                            onClick={() => {
                              const step =
                                qtyMode === "LOTS"
                                  ? 1
                                  : getLotSize(instrumentKey);
                              setQuantity(
                                String(Number.parseInt(quantity || "0") + step),
                              );
                            }}
                            className="h-8 w-8 bg-secondary border border-border rounded text-xs font-bold hover:bg-muted flex items-center justify-center"
                          >
                            +
                          </button>
                        </div>
                        {(() => {
                          const effectiveLotSize =
                            Number.parseInt(editableLotSize || "0") > 0
                              ? Number.parseInt(editableLotSize)
                              : (prefillLotSize ?? getLotSize(instrumentKey));
                          const actualQtyPreview =
                            qtyMode === "LOTS"
                              ? Number.parseInt(quantity || "1") *
                                effectiveLotSize
                              : Number.parseInt(quantity || "0");
                          return (
                            <div className="flex items-center gap-1 mt-1">
                              <span className="text-[9px] text-muted-foreground">
                                Lot Size:
                              </span>
                              <input
                                data-ocid="orders.lot_size_input"
                                type="number"
                                value={
                                  editableLotSize !== ""
                                    ? editableLotSize
                                    : String(effectiveLotSize)
                                }
                                onChange={(e) =>
                                  setEditableLotSize(e.target.value)
                                }
                                className="w-14 h-5 bg-secondary border border-amber-500 text-foreground text-[9px] rounded px-1 text-center font-mono"
                                title="Edit lot size if order fails with quantity error"
                              />
                              <span className="text-[9px] text-muted-foreground">
                                {qtyMode === "LOTS" ? (
                                  <> = {actualQtyPreview} units</>
                                ) : (
                                  <>lots OK</>
                                )}
                              </span>
                            </div>
                          );
                        })()}
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                          Price
                        </Label>
                        <Input
                          data-ocid="orders.price_input"
                          type="number"
                          placeholder="0.00"
                          value={price}
                          onChange={(e) => setPrice(e.target.value)}
                          disabled={orderType === "MARKET"}
                          className="h-8 mt-1 bg-secondary border-border font-mono-data text-xs disabled:opacity-40"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                          Type
                        </Label>
                        <select
                          data-ocid="orders.type_select"
                          value={orderType}
                          onChange={(e) => setOrderType(e.target.value)}
                          className="w-full h-8 mt-1 bg-secondary border border-border text-foreground text-xs rounded px-2 font-mono"
                        >
                          <option value="MARKET">MKT</option>
                          <option value="LIMIT">LMT</option>
                          <option value="SL">SL</option>
                          <option value="SL-M">SL-M</option>
                        </select>
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                          Product
                        </Label>
                        <select
                          data-ocid="orders.product_select"
                          value={product}
                          onChange={(e) => setProduct(e.target.value)}
                          className="w-full h-8 mt-1 bg-secondary border border-border text-foreground text-xs rounded px-2 font-mono"
                        >
                          <option value="D">D - NRML/CNC</option>
                          <option value="I">I - MIS (Intraday)</option>
                        </select>
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                          Validity
                        </Label>
                        <select
                          value={validity}
                          onChange={(e) => setValidity(e.target.value)}
                          className="w-full h-8 mt-1 bg-secondary border border-border text-foreground text-xs rounded px-2 font-mono"
                        >
                          <option value="DAY">DAY</option>
                          <option value="IOC">IOC</option>
                        </select>
                      </div>
                    </div>

                    {(orderType === "SL" || orderType === "SL-M") && (
                      <div>
                        <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                          Trigger Price
                        </Label>
                        <Input
                          type="number"
                          placeholder="0.00"
                          value={triggerPrice}
                          onChange={(e) => setTriggerPrice(e.target.value)}
                          className="h-8 mt-1 bg-secondary border-border font-mono-data text-xs"
                        />
                      </div>
                    )}

                    <button
                      data-ocid="orders.submit_button"
                      type="button"
                      onClick={placeOrder}
                      disabled={placing}
                      className={`w-full h-9 rounded text-xs font-bold transition-colors flex items-center justify-center gap-1.5 ${
                        txType === "BUY"
                          ? "bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                          : "bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
                      }`}
                    >
                      {placing && <Loader2 className="w-3 h-3 animate-spin" />}
                      {editingOrderId ? "Modify" : txType} {orderType}
                    </button>
                  </div>
                </div>

                {/* Market Depth in Order Form */}
                <div className="mx-4 mb-3 border border-border rounded">
                  <div className="flex items-center justify-between px-2 py-1 border-b border-border bg-secondary/50">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Market Depth
                    </span>
                    {orderFormDepthLoading && (
                      <span className="text-[9px] text-muted-foreground">
                        Loading...
                      </span>
                    )}
                  </div>
                  {!orderFormDepthLoading && !orderFormDepth && (
                    <div className="px-3 py-2 text-[10px] text-muted-foreground italic">
                      Depth unavailable (CORS/API)
                    </div>
                  )}
                  <div className="grid grid-cols-2 divide-x divide-border">
                    <div>
                      <div className="grid grid-cols-2 px-2 py-0.5 border-b border-border">
                        <span className="text-[9px] text-muted-foreground">
                          BID QTY
                        </span>
                        <span className="text-[9px] text-muted-foreground text-right">
                          BID
                        </span>
                      </div>
                      {(orderFormDepth?.bids || Array(5).fill(null)).map(
                        (b, i) => (
                          <div
                            key={b ? `bid-p-${b.price}` : `bid-e-${i}`}
                            className="grid grid-cols-2 px-2 py-0.5"
                          >
                            <span className="text-[10px] text-green-500 font-mono">
                              {b ? b.quantity : "—"}
                            </span>
                            <span className="text-[10px] text-green-500 font-mono text-right">
                              {b ? b.price.toFixed(2) : "—"}
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                    <div>
                      <div className="grid grid-cols-2 px-2 py-0.5 border-b border-border">
                        <span className="text-[9px] text-muted-foreground">
                          ASK
                        </span>
                        <span className="text-[9px] text-muted-foreground text-right">
                          ASK QTY
                        </span>
                      </div>
                      {(orderFormDepth?.asks || Array(5).fill(null)).map(
                        (a, i) => (
                          <div
                            key={a ? `ask-p-${a.price}` : `ask-e-${i}`}
                            className="grid grid-cols-2 px-2 py-0.5"
                          >
                            <span className="text-[10px] text-red-500 font-mono">
                              {a ? a.price.toFixed(2) : "—"}
                            </span>
                            <span className="text-[10px] text-red-500 font-mono text-right">
                              {a ? a.quantity : "—"}
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                  {orderFormDepth && (
                    <div className="px-2 py-1 border-t border-border">
                      {(() => {
                        const totalBid = orderFormDepth.bids.reduce(
                          (s, b) => s + b.quantity,
                          0,
                        );
                        const totalAsk = orderFormDepth.asks.reduce(
                          (s, a) => s + a.quantity,
                          0,
                        );
                        const total = totalBid + totalAsk || 1;
                        const bidPct = Math.round((totalBid / total) * 100);
                        return (
                          <div>
                            <div className="flex justify-between text-[9px] mb-0.5">
                              <span className="text-green-500">
                                Buy {bidPct}%
                              </span>
                              <span className="text-red-500">
                                Sell {100 - bidPct}%
                              </span>
                            </div>
                            <div className="h-1 rounded-full bg-red-500 overflow-hidden">
                              <div
                                className="h-full bg-green-500 rounded-full"
                                style={{ width: `${bidPct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* Margin Info */}
                <div
                  data-ocid="orders.margin_panel"
                  className="mx-4 mb-3 border border-border rounded"
                >
                  <div className="px-2 py-1 border-b border-border bg-secondary/50">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Margin
                    </span>
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-border">
                    <div className="px-3 py-2">
                      <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">
                        {isEstimatedMargin ? "Est. Margin" : "Req. Margin"}
                      </div>
                      <div
                        data-ocid="orders.required_margin"
                        className="text-xs font-mono font-bold text-amber-400"
                      >
                        {marginLoading
                          ? "..."
                          : requiredMargin !== null
                            ? `₹${requiredMargin.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : "—"}
                      </div>
                    </div>
                    <div className="px-3 py-2">
                      <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">
                        Available
                      </div>
                      <div
                        data-ocid="orders.available_margin"
                        className={`text-xs font-mono font-bold ${
                          availableMargin !== null &&
                          requiredMargin !== null &&
                          availableMargin < requiredMargin
                            ? "text-red-500"
                            : "text-green-500"
                        }`}
                      >
                        {availableMargin !== null
                          ? `₹${availableMargin.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : "—"}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Order Book */}
            <div className="p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold text-muted-foreground tracking-widest uppercase">
                  Order Book
                </p>
                <div className="flex items-center gap-2">
                  {!showOrderForm && (
                    <button
                      type="button"
                      data-ocid="orders.new_order_button"
                      onClick={() => setShowOrderForm(true)}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                    >
                      <Plus className="w-3 h-3" /> New Order
                    </button>
                  )}
                  {showOrderForm && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowOrderForm(false);
                        setEditingOrderId(null);
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="w-3 h-3" /> Hide Form
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={fetchOrders}
                    className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground"
                  >
                    <RefreshCw
                      className={`w-3 h-3 ${loadingOrders ? "animate-spin" : ""}`}
                    />
                  </button>
                </div>
              </div>

              {/* Filter tabs */}
              <div className="flex gap-1 mb-2 overflow-x-auto hide-scrollbar">
                {(["ALL", "PENDING", "SUCCESS", "CANCELLED"] as const).map(
                  (f) => (
                    <button
                      key={f}
                      type="button"
                      data-ocid={`orders.filter.${f.toLowerCase()}.tab`}
                      onClick={() => setOrderStatusFilter(f)}
                      className={`flex-none px-2.5 py-1 rounded text-[10px] font-bold whitespace-nowrap transition-colors ${
                        orderStatusFilter === f
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {f === "SUCCESS" ? "FILLED" : f}
                    </button>
                  ),
                )}
              </div>

              {loadingOrders ? (
                <div className="space-y-1.5">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-8 rounded bg-secondary animate-pulse"
                    />
                  ))}
                </div>
              ) : orders.length === 0 ? (
                <div
                  data-ocid="orders.empty_state"
                  className="py-8 text-center"
                >
                  <p className="text-xs text-muted-foreground">No orders</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table
                    className="w-full text-xs border-collapse min-w-[480px]"
                    data-ocid="orders.table"
                  >
                    <thead>
                      <tr className="border-b border-border">
                        <th className="py-1.5 px-2 text-left text-[10px] text-muted-foreground font-semibold tracking-wider">
                          SYMBOL
                        </th>
                        <th className="py-1.5 px-2 text-right text-[10px] text-muted-foreground font-semibold tracking-wider">
                          QTY
                        </th>
                        <th className="py-1.5 px-2 text-right text-[10px] text-muted-foreground font-semibold tracking-wider">
                          PRICE
                        </th>
                        <th className="py-1.5 px-2 text-center text-[10px] text-muted-foreground font-semibold tracking-wider">
                          TYPE
                        </th>
                        <th className="py-1.5 px-2 text-center text-[10px] text-muted-foreground font-semibold tracking-wider">
                          STATUS
                        </th>
                        <th className="py-1.5 px-2 text-center text-[10px] text-muted-foreground font-semibold tracking-wider">
                          ACT
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders
                        .filter((o) => {
                          if (orderStatusFilter === "ALL") return true;
                          if (orderStatusFilter === "PENDING")
                            return isPendingOrder(o);
                          if (orderStatusFilter === "SUCCESS")
                            return ["complete", "traded", "filled"].some((s) =>
                              o.status.toLowerCase().includes(s),
                            );
                          if (orderStatusFilter === "CANCELLED")
                            return ["cancelled", "rejected"].some((s) =>
                              o.status.toLowerCase().includes(s),
                            );
                          return true;
                        })
                        .map((order, i) => (
                          <tr
                            key={order.order_id}
                            data-ocid={`orders.row.${i + 1}`}
                            className="border-b border-border/50 hover:bg-secondary/40 transition-colors"
                          >
                            <td className="py-1.5 px-2">
                              <p className="font-mono font-bold text-foreground text-xs">
                                {order.tradingsymbol}
                              </p>
                              <p
                                className={`text-[10px] font-bold ${
                                  order.transaction_type === "BUY"
                                    ? "text-blue-400"
                                    : "text-loss"
                                }`}
                              >
                                {order.transaction_type}
                              </p>
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono-data text-foreground">
                              {order.quantity}
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono-data text-foreground">
                              ₹
                              {(
                                order.price ||
                                order.average_price ||
                                0
                              ).toFixed(2)}
                            </td>
                            <td className="py-1.5 px-2 text-center">
                              <span className="text-[10px] font-mono text-muted-foreground">
                                {order.order_type}
                              </span>
                            </td>
                            <td className="py-1.5 px-2 text-center">
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${statusBadge(order.status)}`}
                              >
                                {order.status}
                              </span>
                            </td>
                            <td className="py-1.5 px-2 text-center">
                              {isPendingOrder(order) && (
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    data-ocid={`orders.edit_button.${i + 1}`}
                                    onClick={() => startEditOrder(order)}
                                    title="Edit order"
                                    className="w-5 h-5 flex items-center justify-center rounded bg-secondary hover:bg-amber-900/40 text-amber-400 transition-colors"
                                  >
                                    <Pencil className="w-2.5 h-2.5" />
                                  </button>
                                  <button
                                    type="button"
                                    data-ocid={`orders.cancel_button.${i + 1}`}
                                    onClick={() =>
                                      setCancelConfirm({
                                        orderId: order.order_id,
                                        type: "regular",
                                      })
                                    }
                                    title="Cancel order"
                                    className="w-5 h-5 flex items-center justify-center rounded bg-secondary hover:bg-red-900/40 text-red-400 transition-colors"
                                  >
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {orderSubTab === "gtt" && (
          <>
            {/* GTT Order Form — Bracket Order Design */}
            {(showGttForm || gttEditId) && (
              <div className="border-b border-border">
                {/* Colored header bar */}
                <div
                  className={`px-4 py-2.5 flex items-center justify-between ${gttTxType === "BUY" ? "bg-blue-600" : "bg-red-600"}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-white font-black text-sm">
                      {gttTxType === "BUY" ? "▲ BUY GTT" : "▼ SELL GTT"}
                    </span>
                    <span className="text-white/70 text-[10px] font-bold">
                      — {gttType}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      data-ocid="gtt.buy_button"
                      type="button"
                      onClick={() => setGttTxType("BUY")}
                      className={`px-3 py-1 rounded text-[10px] font-bold transition-colors ${gttTxType === "BUY" ? "bg-white text-blue-700" : "bg-blue-500/40 text-white hover:bg-blue-500/60"}`}
                    >
                      BUY
                    </button>
                    <button
                      data-ocid="gtt.sell_button"
                      type="button"
                      onClick={() => setGttTxType("SELL")}
                      className={`px-3 py-1 rounded text-[10px] font-bold transition-colors ${gttTxType === "SELL" ? "bg-white text-red-700" : "bg-red-500/40 text-white hover:bg-red-500/60"}`}
                    >
                      SELL
                    </button>
                    {gttEditId && (
                      <button
                        data-ocid="gtt.cancel_edit_button"
                        type="button"
                        onClick={resetGttForm}
                        className="ml-1 px-2 py-1 rounded text-[10px] bg-white/20 text-white hover:bg-white/30"
                      >
                        ✕ Cancel Edit
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-3 space-y-3">
                  {/* Instrument + Qty row */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        Instrument Token
                      </Label>
                      <Input
                        data-ocid="gtt.instrument_input"
                        placeholder="NSE_FO|43919"
                        value={gttInstrumentToken}
                        onChange={(e) => setGttInstrumentToken(e.target.value)}
                        className="h-8 mt-1 bg-secondary border-border font-mono text-xs"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                          Qty
                        </Label>
                        <div className="flex rounded overflow-hidden border border-border text-[9px]">
                          <button
                            data-ocid="gtt.qty_mode_lots"
                            type="button"
                            onClick={() => {
                              setGttQtyMode("LOTS");
                              setGttQty("1");
                            }}
                            className={`px-2 py-0.5 font-bold transition-colors ${gttQtyMode === "LOTS" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
                          >
                            LOTS
                          </button>
                          <button
                            data-ocid="gtt.qty_mode_qty"
                            type="button"
                            onClick={() => {
                              setGttQtyMode("QTY");
                              setGttQty(String(getLotSize(gttInstrumentToken)));
                            }}
                            className={`px-2 py-0.5 font-bold transition-colors ${gttQtyMode === "QTY" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
                          >
                            QTY
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          data-ocid="gtt.qty_decrease_button"
                          type="button"
                          onClick={() => {
                            const step =
                              gttQtyMode === "LOTS"
                                ? 1
                                : getLotSize(gttInstrumentToken);
                            setGttQty(
                              String(
                                Math.max(
                                  gttQtyMode === "LOTS" ? 1 : 0,
                                  Number.parseInt(gttQty || "1") - step,
                                ),
                              ),
                            );
                          }}
                          className="h-8 w-8 bg-secondary border border-border rounded text-xs font-bold hover:bg-muted flex items-center justify-center"
                        >
                          −
                        </button>
                        <input
                          data-ocid="gtt.qty_input"
                          type="number"
                          value={gttQty}
                          onChange={(e) => setGttQty(e.target.value)}
                          className="h-8 flex-1 bg-secondary border border-border text-foreground text-xs rounded px-2 text-center font-mono min-w-0"
                          placeholder={gttQtyMode === "LOTS" ? "1" : "0"}
                        />
                        <button
                          data-ocid="gtt.qty_increase_button"
                          type="button"
                          onClick={() => {
                            const step =
                              gttQtyMode === "LOTS"
                                ? 1
                                : getLotSize(gttInstrumentToken);
                            setGttQty(
                              String(Number.parseInt(gttQty || "0") + step),
                            );
                          }}
                          className="h-8 w-8 bg-secondary border border-border rounded text-xs font-bold hover:bg-muted flex items-center justify-center"
                        >
                          +
                        </button>
                      </div>
                      {(() => {
                        const ls =
                          Number.parseInt(gttLotSize || "0") > 0
                            ? Number.parseInt(gttLotSize)
                            : getLotSize(gttInstrumentToken);
                        const aq =
                          gttQtyMode === "LOTS"
                            ? Number.parseInt(gttQty || "1") * ls
                            : Number.parseInt(gttQty || String(ls));
                        return (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {gttQtyMode === "LOTS"
                              ? `= ${aq} qty (lot: ${ls})`
                              : `= ${Math.floor(aq / ls)} lots (lot: ${ls})`}
                          </p>
                        );
                      })()}
                      <div className="mt-1">
                        <Label className="text-[10px] text-amber-400 uppercase tracking-wider">
                          Lot Override
                        </Label>
                        <input
                          type="number"
                          value={gttLotSize}
                          onChange={(e) => setGttLotSize(e.target.value)}
                          placeholder={String(getLotSize(gttInstrumentToken))}
                          className="w-full h-7 mt-0.5 bg-secondary border border-amber-500/50 text-foreground text-xs rounded px-2 font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Product + GTT Type row */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        Product
                      </Label>
                      <select
                        value={gttProduct}
                        onChange={(e) => setGttProduct(e.target.value)}
                        className="w-full h-8 mt-1 bg-secondary border border-border text-foreground text-xs rounded px-2"
                      >
                        <option value="D">D (NRML/CNC)</option>
                        <option value="I">I (MIS)</option>
                      </select>
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        Type
                      </Label>
                      <div className="flex mt-1 rounded overflow-hidden border border-border">
                        <button
                          data-ocid="gtt.type_single_toggle"
                          type="button"
                          onClick={() => setGttType("SINGLE")}
                          className={`flex-1 py-1.5 text-xs font-bold transition-colors ${gttType === "SINGLE" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
                        >
                          SINGLE
                        </button>
                        <button
                          data-ocid="gtt.type_multiple_toggle"
                          type="button"
                          onClick={() => setGttType("MULTIPLE")}
                          className={`flex-1 py-1.5 text-xs font-bold transition-colors ${gttType === "MULTIPLE" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
                        >
                          MULTIPLE
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Bracket Order Visual */}
                  <div className="space-y-1">
                    {/* TARGET — only for MULTIPLE */}
                    {gttType === "MULTIPLE" && (
                      <div className="rounded-lg border border-green-700/50 bg-green-950/40 p-3">
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className="text-green-400 font-black text-xs">
                            ▲ TARGET
                          </span>
                          <span className="text-green-600/70 text-[9px]">
                            Exit with profit
                          </span>
                        </div>
                        <Input
                          type="number"
                          placeholder="Target price"
                          value={gttTargetPrice}
                          onChange={(e) => setGttTargetPrice(e.target.value)}
                          className="h-8 bg-green-950/60 border-green-700/60 font-mono text-xs text-green-200 placeholder:text-green-800"
                        />
                      </div>
                    )}

                    {/* Connector line */}
                    {gttType === "MULTIPLE" && (
                      <div className="flex justify-center">
                        <div className="w-px h-3 bg-border" />
                      </div>
                    )}

                    {/* ENTRY — always shown */}
                    <div
                      className={`rounded-lg border p-3 ${gttTxType === "BUY" ? "border-blue-600/60 bg-blue-950/40" : "border-red-600/60 bg-red-950/30"}`}
                    >
                      <div className="flex items-center gap-1.5 mb-2">
                        <span
                          className={`font-black text-xs ${gttTxType === "BUY" ? "text-blue-400" : "text-red-400"}`}
                        >
                          {gttTxType === "BUY" ? "▲" : "▼"} ENTRY TRIGGER
                        </span>
                        <span className="text-muted-foreground text-[9px]">
                          When price goes
                        </span>
                        {/* ABOVE / BELOW toggle inline */}
                        <div className="flex rounded overflow-hidden border border-border ml-auto">
                          <button
                            type="button"
                            onClick={() => setGttEntryTriggerType("ABOVE")}
                            className={`px-2 text-[9px] font-bold transition-colors ${gttEntryTriggerType === "ABOVE" ? "bg-blue-600 text-white" : "bg-secondary text-muted-foreground"}`}
                          >
                            ↑ ABOVE
                          </button>
                          <button
                            type="button"
                            onClick={() => setGttEntryTriggerType("BELOW")}
                            className={`px-2 text-[9px] font-bold transition-colors ${gttEntryTriggerType === "BELOW" ? "bg-amber-600 text-white" : "bg-secondary text-muted-foreground"}`}
                          >
                            ↓ BELOW
                          </button>
                        </div>
                      </div>
                      <Input
                        type="number"
                        placeholder="Entry trigger price"
                        value={gttEntryPrice}
                        onChange={(e) => setGttEntryPrice(e.target.value)}
                        className={`h-9 font-mono text-sm font-bold ${gttTxType === "BUY" ? "bg-blue-950/60 border-blue-700/60 text-blue-200 placeholder:text-blue-800" : "bg-red-950/60 border-red-700/60 text-red-200 placeholder:text-red-800"}`}
                      />
                    </div>

                    {/* Connector line */}
                    {gttType === "MULTIPLE" && (
                      <div className="flex justify-center">
                        <div className="w-px h-3 bg-border" />
                      </div>
                    )}

                    {/* STOPLOSS — only for MULTIPLE */}
                    {gttType === "MULTIPLE" && (
                      <div className="rounded-lg border border-red-700/50 bg-red-950/40 p-3">
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className="text-red-400 font-black text-xs">
                            ▼ STOPLOSS
                          </span>
                          <span className="text-red-600/70 text-[9px]">
                            Exit to limit loss
                          </span>
                        </div>
                        <Input
                          type="number"
                          placeholder="Stop-loss price"
                          value={gttSlPrice}
                          onChange={(e) => setGttSlPrice(e.target.value)}
                          className="h-8 mb-2 bg-red-950/60 border-red-700/60 font-mono text-xs text-red-200 placeholder:text-red-800"
                        />
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-red-400/80 font-semibold whitespace-nowrap">
                            Trailing Gap
                          </span>
                          <Input
                            type="number"
                            placeholder="e.g. 0.1 (optional)"
                            value={gttTrailingGap}
                            onChange={(e) => setGttTrailingGap(e.target.value)}
                            className="h-7 flex-1 bg-red-950/60 border-red-700/60 font-mono text-xs text-red-200 placeholder:text-red-800"
                          />
                        </div>
                        <p className="text-[9px] text-red-600/70 mt-1">
                          Leave blank for fixed SL. Set trailing gap to
                          auto-trail.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Submit button */}
                  <button
                    data-ocid="gtt.submit_button"
                    type="button"
                    onClick={submitGTTOrder}
                    disabled={gttPlacing}
                    className={`w-full h-10 rounded-lg text-sm font-black transition-colors flex items-center justify-center gap-2 ${
                      gttTxType === "BUY"
                        ? "bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
                        : "bg-red-600 hover:bg-red-500 text-white disabled:opacity-50"
                    }`}
                  >
                    {gttPlacing && <Loader2 className="w-4 h-4 animate-spin" />}
                    {gttTxType === "BUY" ? "▲" : "▼"}{" "}
                    {gttEditId ? "Update GTT Order" : "Place GTT Order"}
                  </button>

                  {/* Market Depth — always visible */}
                  <div className="border border-border rounded-lg overflow-hidden">
                    <div className="px-3 py-2 bg-secondary/50 border-b border-border">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        Market Depth
                      </span>
                    </div>
                    {gttInstrumentToken.trim() ? (
                      gttDepthLoading && !gttDepth ? (
                        <div className="h-20 animate-pulse bg-secondary m-2 rounded" />
                      ) : gttDepth ? (
                        <div className="p-2">
                          <DepthRows depth={gttDepth} />
                        </div>
                      ) : (
                        <p className="text-[10px] text-muted-foreground text-center py-4">
                          No depth data available
                        </p>
                      )
                    ) : (
                      <p className="text-[10px] text-muted-foreground text-center py-4">
                        Enter instrument token to load market depth
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
            {/* GTT Order Book */}
            <div className="p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold text-muted-foreground tracking-widest uppercase">
                  GTT Order Book
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    data-ocid="gtt.open_modal_button"
                    type="button"
                    onClick={() => setShowGttForm((v) => !v)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold transition-colors ${
                      showGttForm
                        ? "bg-secondary text-muted-foreground hover:text-foreground"
                        : "bg-primary text-primary-foreground hover:bg-primary/90"
                    }`}
                  >
                    {showGttForm ? (
                      <>
                        <ChevronUp className="w-3 h-3" /> Hide Form
                      </>
                    ) : (
                      <>
                        <Plus className="w-3 h-3" /> New GTT Order
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={fetchGTTOrders}
                    className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground"
                  >
                    <RefreshCw
                      className={`w-3 h-3 ${gttLoading ? "animate-spin" : ""}`}
                    />
                  </button>
                </div>
              </div>

              {/* GTT Filter tabs */}
              <div className="flex gap-1 mb-2 overflow-x-auto hide-scrollbar">
                {(["ALL", "OPEN", "TRIGGERED", "CANCELLED"] as const).map(
                  (f) => (
                    <button
                      key={f}
                      type="button"
                      data-ocid={`gtt.filter.${f.toLowerCase()}.tab`}
                      onClick={() => setGttStatusFilter(f)}
                      className={`flex-none px-2.5 py-1 rounded text-[10px] font-bold whitespace-nowrap transition-colors ${
                        gttStatusFilter === f
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {f}
                    </button>
                  ),
                )}
              </div>

              {gttLoading && gttOrders.length === 0 ? (
                <div className="space-y-1.5">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-8 rounded bg-secondary animate-pulse"
                    />
                  ))}
                </div>
              ) : gttOrders.length === 0 ? (
                <div data-ocid="gtt.empty_state" className="py-8 text-center">
                  <p className="text-xs text-muted-foreground">No GTT orders</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Use the form above to place a GTT order
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table
                    className="w-full text-xs border-collapse min-w-[520px]"
                    data-ocid="gtt.table"
                  >
                    <thead>
                      <tr className="border-b border-border">
                        <th className="py-1.5 px-2 text-left text-[10px] text-muted-foreground font-semibold tracking-wider">
                          SYMBOL
                        </th>
                        <th className="py-1.5 px-2 text-center text-[10px] text-muted-foreground font-semibold tracking-wider">
                          B/S
                        </th>
                        <th className="py-1.5 px-2 text-right text-[10px] text-muted-foreground font-semibold tracking-wider">
                          QTY
                        </th>
                        <th className="py-1.5 px-2 text-center text-[10px] text-muted-foreground font-semibold tracking-wider">
                          ENTRY
                        </th>
                        <th className="py-1.5 px-2 text-center text-[10px] text-muted-foreground font-semibold tracking-wider">
                          TGT
                        </th>
                        <th className="py-1.5 px-2 text-center text-[10px] text-muted-foreground font-semibold tracking-wider">
                          SL
                        </th>
                        <th className="py-1.5 px-2 text-center text-[10px] text-muted-foreground font-semibold tracking-wider">
                          STATUS
                        </th>
                        <th className="py-1.5 px-2 text-center text-[10px] text-muted-foreground font-semibold tracking-wider">
                          ACT
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {gttOrders
                        .filter((gtt) => {
                          const s = (gtt.status || "").toUpperCase();
                          if (gttStatusFilter === "ALL") return true;
                          if (gttStatusFilter === "OPEN")
                            return ["OPEN", "ACTIVE", "PENDING"].includes(s);
                          if (gttStatusFilter === "TRIGGERED")
                            return ["TRIGGERED", "COMPLETE", "FILLED"].includes(
                              s,
                            );
                          if (gttStatusFilter === "CANCELLED")
                            return s === "CANCELLED";
                          return true;
                        })
                        .map((gtt, i) => {
                          const entryRule = (gtt.rules || []).find(
                            (r: any) => r.strategy === "ENTRY",
                          );
                          const tgtRule = (gtt.rules || []).find(
                            (r: any) => r.strategy === "TARGET",
                          );
                          const slRule = (gtt.rules || []).find(
                            (r: any) => r.strategy === "STOPLOSS",
                          );
                          const symbol =
                            (gtt.instrument_token || gtt.tradingsymbol || "—")
                              .split("|")
                              .pop() || "—";
                          return (
                            <React.Fragment
                              key={gtt.gtt_order_id || gtt.id || String(i)}
                            >
                              <tr
                                data-ocid={`gtt.row.${i + 1}`}
                                className="border-b border-border/50 hover:bg-secondary/40 transition-colors"
                              >
                                <td className="py-1.5 px-2">
                                  <p className="font-mono font-bold text-foreground text-xs">
                                    {symbol}
                                  </p>
                                </td>
                                <td className="py-1.5 px-2 text-center">
                                  <span
                                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                      gtt.transaction_type === "BUY"
                                        ? "bg-blue-950 text-blue-400 border border-blue-800/40"
                                        : "bg-red-950 text-red-400 border border-red-800/40"
                                    }`}
                                  >
                                    {gtt.transaction_type === "BUY" ? "B" : "S"}
                                  </span>
                                </td>
                                <td className="py-1.5 px-2 text-right font-mono text-foreground">
                                  {gtt.quantity}
                                </td>
                                <td className="py-1.5 px-2 text-center">
                                  {entryRule ? (
                                    <span className="text-[9px] px-1 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800/40 font-mono">
                                      E:{entryRule.trigger_price}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">
                                      —
                                    </span>
                                  )}
                                </td>
                                <td className="py-1.5 px-2 text-center">
                                  {tgtRule ? (
                                    <span className="text-[9px] px-1 py-0.5 rounded bg-green-950 text-green-400 border border-green-800/40 font-mono">
                                      T:{tgtRule.trigger_price}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">
                                      —
                                    </span>
                                  )}
                                </td>
                                <td className="py-1.5 px-2 text-center">
                                  {slRule ? (
                                    <span className="text-[9px] px-1 py-0.5 rounded bg-red-950 text-red-400 border border-red-800/40 font-mono">
                                      SL:{slRule.trigger_price}
                                      {slRule.trailing_gap
                                        ? `(T${slRule.trailing_gap})`
                                        : ""}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">
                                      —
                                    </span>
                                  )}
                                </td>
                                <td className="py-1.5 px-2 text-center">
                                  <span
                                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${statusBadge((gtt.status || "").toUpperCase())}`}
                                  >
                                    {gtt.status || "ACTIVE"}
                                  </span>
                                </td>
                                <td className="py-1.5 px-2 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      type="button"
                                      data-ocid={`gtt.edit_button.${i + 1}`}
                                      onClick={() => startEditGTT(gtt)}
                                      title="Edit GTT"
                                      className="w-5 h-5 flex items-center justify-center rounded bg-secondary hover:bg-amber-900/40 text-amber-400 transition-colors"
                                    >
                                      <Pencil className="w-2.5 h-2.5" />
                                    </button>
                                    <button
                                      type="button"
                                      data-ocid={`gtt.cancel_button.${i + 1}`}
                                      onClick={() =>
                                        setCancelConfirm({
                                          orderId: gtt.gtt_order_id || gtt.id,
                                          type: "gtt",
                                        })
                                      }
                                      title="Cancel GTT"
                                      className="w-5 h-5 flex items-center justify-center rounded bg-secondary hover:bg-red-900/40 text-red-400 transition-colors"
                                    >
                                      <X className="w-2.5 h-2.5" />
                                    </button>
                                    <button
                                      type="button"
                                      data-ocid={`gtt.depth_button.${i + 1}`}
                                      onClick={() =>
                                        toggleGttRowDepth(
                                          gtt.gtt_order_id ||
                                            gtt.id ||
                                            String(i),
                                          gtt.instrument_token || "",
                                        )
                                      }
                                      title="Market Depth"
                                      className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${gttRowDepthOpen.has(gtt.gtt_order_id || gtt.id || String(i)) ? "bg-blue-900/40 text-blue-400" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
                                    >
                                      <BarChart2 className="w-2.5 h-2.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              {gttRowDepthOpen.has(
                                gtt.gtt_order_id || gtt.id || String(i),
                              ) && (
                                <tr
                                  data-ocid={`gtt.depth.panel.${i + 1}`}
                                  className="border-b border-border/30 bg-secondary/20"
                                >
                                  <td colSpan={8} className="px-3 py-2">
                                    <div className="flex items-center justify-between mb-1.5">
                                      <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
                                        Market Depth —{" "}
                                        {(gtt.instrument_token || "—")
                                          .split("|")
                                          .pop()}
                                      </p>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          fetchGttRowDepth(
                                            gtt.gtt_order_id ||
                                              gtt.id ||
                                              String(i),
                                            gtt.instrument_token || "",
                                          )
                                        }
                                        className="text-[9px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                                        title="Refresh depth"
                                      >
                                        <RefreshCw className="w-2.5 h-2.5" />{" "}
                                        Refresh
                                      </button>
                                    </div>
                                    {gttRowDepthData[
                                      gtt.gtt_order_id || gtt.id || String(i)
                                    ] ? (
                                      <DepthRows
                                        depth={
                                          gttRowDepthData[
                                            gtt.gtt_order_id ||
                                              gtt.id ||
                                              String(i)
                                          ]!
                                        }
                                      />
                                    ) : (
                                      <p className="text-[10px] text-muted-foreground text-center py-2">
                                        Loading depth…
                                      </p>
                                    )}
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
      <AlertDialog
        open={!!cancelConfirm}
        onOpenChange={(open) => {
          if (!open) setCancelConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Order?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel order{" "}
              <span className="font-semibold text-foreground">
                {cancelConfirm?.orderId}
              </span>
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              data-ocid="cancel_order.cancel_button"
              onClick={() => setCancelConfirm(null)}
            >
              No, Keep
            </AlertDialogCancel>
            <AlertDialogAction
              data-ocid="cancel_order.confirm_button"
              className="bg-red-600 hover:bg-red-500 text-white"
              onClick={() => {
                if (!cancelConfirm) return;
                if (cancelConfirm.type === "regular") {
                  cancelRegularOrder(cancelConfirm.orderId);
                } else {
                  cancelGTTOrder(cancelConfirm.orderId);
                }
                setCancelConfirm(null);
              }}
            >
              Yes, Cancel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Positions Tab ─────────────────────────────────────────────────────────────
function PositionsTab({
  token,
  onSquareOff,
}: {
  token: string;
  onSquareOff?: (pos: Position, mode: "sell" | "gtt") => void;
}) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [riskSettings, setRiskSettings] = useState<
    Record<string, { sl: string; tsl: string }>
  >(() => {
    try {
      return JSON.parse(localStorage.getItem(RISK_SETTINGS_KEY) ?? "{}");
    } catch {
      return {};
    }
  });
  const saveRowSettings = (symbol: string, sl: string, tsl: string) => {
    const next = { ...riskSettings, [symbol]: { sl, tsl } };
    setRiskSettings(next);
    localStorage.setItem(RISK_SETTINGS_KEY, JSON.stringify(next));
  };

  const fixAvgPrice = (pos: Position): Position => {
    if (pos.average_price && pos.average_price !== 0) return pos;
    if (pos.quantity > 0 && pos.buy_quantity > 0)
      return { ...pos, average_price: pos.buy_value / pos.buy_quantity };
    if (pos.quantity < 0 && pos.sell_quantity > 0)
      return { ...pos, average_price: pos.sell_value / pos.sell_quantity };
    if (pos.buy_quantity > 0)
      return { ...pos, average_price: pos.buy_value / pos.buy_quantity };
    return pos;
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: fixAvgPrice is stable
  const fetchPositions = useCallback(async () => {
    setLoading(true);
    const res = await upstoxFetch<Position[]>(
      "/v2/portfolio/short-term-positions",
      token,
    );
    if (res.data)
      setPositions((Array.isArray(res.data) ? res.data : []).map(fixAvgPrice));
    else if (res.error) toast.error(`Positions: ${res.error}`);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    fetchPositions();
    const id = setInterval(fetchPositions, 1000);
    return () => clearInterval(id);
  }, [fetchPositions]);

  const totalPnl = positions.reduce((sum, p) => sum + (p.pnl ?? 0), 0);

  return (
    <div>
      {/* Summary bar */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b border-border"
        style={{ background: "oklch(var(--card))" }}
      >
        <div className="flex items-center gap-4">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Day P&L
            </p>
            <PnlText value={totalPnl} className="text-base" />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Positions
            </p>
            <p className="font-mono-data text-sm font-bold text-foreground">
              {positions.length}
            </p>
          </div>
        </div>
        <button
          data-ocid="positions.refresh.button"
          type="button"
          onClick={fetchPositions}
          className="w-7 h-7 flex items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      {loading ? (
        <div data-ocid="positions.loading_state" className="p-4 space-y-1.5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 rounded bg-secondary animate-pulse" />
          ))}
        </div>
      ) : positions.length === 0 ? (
        <div data-ocid="positions.empty_state" className="py-12 text-center">
          <Layers className="w-7 h-7 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">No open positions</p>
        </div>
      ) : (
        <div className="overflow-x-auto" data-ocid="positions.table">
          <table className="w-full text-xs border-collapse min-w-[600px]">
            <thead>
              <tr
                className="border-b border-border"
                style={{ background: "oklch(var(--card))" }}
              >
                <th className="py-2 px-3 text-left text-[10px] text-muted-foreground font-semibold tracking-wider">
                  SYMBOL
                </th>
                <th className="py-2 px-3 text-right text-[10px] text-muted-foreground font-semibold tracking-wider">
                  NET QTY
                </th>
                <th className="py-2 px-3 text-right text-[10px] text-muted-foreground font-semibold tracking-wider">
                  AVG
                </th>
                <th className="py-2 px-3 text-right text-[10px] text-muted-foreground font-semibold tracking-wider">
                  LTP
                </th>
                <th className="py-2 px-3 text-right text-[10px] text-muted-foreground font-semibold tracking-wider">
                  P&L
                </th>
                <th className="py-2 px-3 text-right text-[10px] text-muted-foreground font-semibold tracking-wider">
                  P&L %
                </th>
              </tr>
            </thead>
            {positions.map((pos, i) => {
              const pnlPct =
                pos.average_price > 0
                  ? (pos.pnl / (pos.average_price * Math.abs(pos.quantity))) *
                    100
                  : 0;
              const posSettings = riskSettings[pos.tradingsymbol] ?? {
                sl: "",
                tsl: "",
              };
              return (
                <tbody key={`${pos.tradingsymbol}-${i}`}>
                  <tr
                    data-ocid={`positions.row.${i + 1}`}
                    className="border-b border-border/50 hover:bg-secondary/40 transition-colors cursor-pointer"
                    onClick={() =>
                      setExpandedRow(
                        expandedRow === pos.tradingsymbol
                          ? null
                          : pos.tradingsymbol,
                      )
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter")
                        setExpandedRow(
                          expandedRow === pos.tradingsymbol
                            ? null
                            : pos.tradingsymbol,
                        );
                    }}
                  >
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-2 h-2 rounded-full flex-none ${pnlPct >= 0 ? "bg-green-500" : pnlPct >= -5 ? "bg-amber-400" : "bg-red-500"}`}
                        />
                        <div>
                          <p className="font-mono font-bold text-foreground">
                            {pos.tradingsymbol}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {pos.exchange} · {pos.product}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right font-mono-data font-bold text-foreground">
                      {pos.quantity}
                    </td>
                    <td className="py-2 px-3 text-right font-mono-data text-foreground">
                      ₹{pos.average_price.toFixed(2)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono-data text-foreground">
                      ₹{pos.last_price.toFixed(2)}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <PnlText value={pos.pnl} />
                    </td>
                    <td className="py-2 px-3 text-right">
                      <PnlPct value={pnlPct} />
                    </td>
                  </tr>
                  {expandedRow === pos.tradingsymbol && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-3 border-b border-border/50"
                        style={{ background: "oklch(var(--card))" }}
                      >
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                              Stop Loss ₹
                            </Label>
                            <Input
                              data-ocid={`positions.sl_input.${i + 1}`}
                              type="number"
                              placeholder="0.00"
                              value={posSettings.sl}
                              onChange={(e) =>
                                saveRowSettings(
                                  pos.tradingsymbol,
                                  e.target.value,
                                  posSettings.tsl,
                                )
                              }
                              className="h-7 mt-1 bg-secondary border-border font-mono-data text-xs"
                              onClick={(ev) => ev.stopPropagation()}
                            />
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                              Trail SL %
                            </Label>
                            <Input
                              data-ocid={`positions.tsl_input.${i + 1}`}
                              type="number"
                              placeholder="0.0"
                              value={posSettings.tsl}
                              onChange={(e) =>
                                saveRowSettings(
                                  pos.tradingsymbol,
                                  posSettings.sl,
                                  e.target.value,
                                )
                              }
                              className="h-7 mt-1 bg-secondary border-border font-mono-data text-xs"
                              onClick={(ev) => ev.stopPropagation()}
                            />
                          </div>
                        </div>
                        {pos.quantity !== 0 && (
                          <div
                            className="flex gap-2 mt-3"
                            onClick={(ev) => ev.stopPropagation()}
                            onKeyDown={(ev) => ev.stopPropagation()}
                          >
                            <button
                              type="button"
                              data-ocid={`positions.squareoff.${i + 1}`}
                              onClick={() => onSquareOff?.(pos, "sell")}
                              className="flex-1 h-8 rounded text-[11px] font-bold bg-red-600 hover:bg-red-500 text-white transition-colors"
                            >
                              Square Off (SELL)
                            </button>
                            <button
                              type="button"
                              data-ocid={`positions.gtt_squareoff.${i + 1}`}
                              onClick={() => onSquareOff?.(pos, "gtt")}
                              className="flex-1 h-8 rounded text-[11px] font-bold bg-amber-600 hover:bg-amber-500 text-white transition-colors"
                            >
                              GTT Square Off
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              );
            })}
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Holdings Tab ──────────────────────────────────────────────────────────────
function HoldingsTab({
  token,
  onSquareOff,
}: {
  token: string;
  onSquareOff?: (h: Holding, mode: "sell" | "gtt") => void;
}) {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchHoldings = useCallback(async () => {
    setLoading(true);
    const res = await upstoxFetch<Holding[]>(
      "/v2/portfolio/long-term-holdings",
      token,
    );
    if (res.data) setHoldings(Array.isArray(res.data) ? res.data : []);
    else if (res.error) toast.error(`Holdings: ${res.error}`);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    fetchHoldings();
    const id = setInterval(fetchHoldings, 1000);
    return () => clearInterval(id);
  }, [fetchHoldings]);

  const totalInvested = holdings.reduce(
    (s, h) => s + h.average_price * h.quantity,
    0,
  );
  const totalCurrent = holdings.reduce(
    (s, h) => s + h.last_price * h.quantity,
    0,
  );
  const totalPnl = totalCurrent - totalInvested;
  const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

  return (
    <div>
      {/* Portfolio summary bar */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b border-border"
        style={{ background: "oklch(var(--card))" }}
      >
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Invested
            </p>
            <p className="font-mono-data text-sm font-bold text-foreground">
              ₹
              {totalInvested.toLocaleString("en-IN", {
                maximumFractionDigits: 0,
              })}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              Current
            </p>
            <p className="font-mono-data text-sm font-bold text-foreground">
              ₹
              {totalCurrent.toLocaleString("en-IN", {
                maximumFractionDigits: 0,
              })}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              P&L
            </p>
            <PnlText value={totalPnl} className="text-sm" />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
              P&L %
            </p>
            <PnlPct value={totalPnlPct} className="text-sm font-bold" />
          </div>
        </div>
        <button
          data-ocid="holdings.refresh.button"
          type="button"
          onClick={fetchHoldings}
          className="w-7 h-7 flex items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      {loading ? (
        <div data-ocid="holdings.loading_state" className="p-4 space-y-1.5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 rounded bg-secondary animate-pulse" />
          ))}
        </div>
      ) : holdings.length === 0 ? (
        <div data-ocid="holdings.empty_state" className="py-12 text-center">
          <BriefcaseBusiness className="w-7 h-7 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">No holdings found</p>
        </div>
      ) : (
        <div className="overflow-x-auto" data-ocid="holdings.table">
          <table className="w-full text-xs border-collapse min-w-[700px]">
            <thead>
              <tr
                className="border-b border-border"
                style={{ background: "oklch(var(--card))" }}
              >
                <th className="py-2 px-3 text-left text-[10px] text-muted-foreground font-semibold tracking-wider">
                  SYMBOL
                </th>
                <th className="py-2 px-3 text-right text-[10px] text-muted-foreground font-semibold tracking-wider">
                  QTY
                </th>
                <th className="py-2 px-3 text-right text-[10px] text-muted-foreground font-semibold tracking-wider">
                  AVG COST
                </th>
                <th className="py-2 px-3 text-right text-[10px] text-muted-foreground font-semibold tracking-wider">
                  LTP
                </th>
                <th className="py-2 px-3 text-right text-[10px] text-muted-foreground font-semibold tracking-wider">
                  CUR VAL
                </th>
                <th className="py-2 px-3 text-right text-[10px] text-muted-foreground font-semibold tracking-wider">
                  P&L
                </th>
                <th className="py-2 px-3 text-right text-[10px] text-muted-foreground font-semibold tracking-wider">
                  P&L %
                </th>
              </tr>
            </thead>
            {holdings.map((h, i) => {
              const curVal = h.last_price * h.quantity;
              const inv = h.average_price * h.quantity;
              const pnl = curVal - inv;
              const pnlPct = inv > 0 ? (pnl / inv) * 100 : 0;
              const rowKey = h.isin ?? h.tradingsymbol;
              const isExpanded = expandedRow === rowKey;
              const _instrumentKey =
                h.instrument_token || `${h.exchange}_EQ|${h.tradingsymbol}`;
              return (
                <tbody key={rowKey}>
                  <tr
                    data-ocid={`holdings.row.${i + 1}`}
                    className="border-b border-border/50 hover:bg-secondary/40 transition-colors cursor-pointer"
                    onClick={() => setExpandedRow(isExpanded ? null : rowKey)}
                    onKeyDown={(e) =>
                      e.key === "Enter" &&
                      setExpandedRow(isExpanded ? null : rowKey)
                    }
                  >
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1">
                        <ChevronRight
                          className={`w-3 h-3 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
                        />
                        <div>
                          <p className="font-mono font-bold text-foreground">
                            {h.tradingsymbol}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {h.exchange}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right font-mono-data text-foreground">
                      {h.quantity}
                    </td>
                    <td className="py-2 px-3 text-right font-mono-data text-foreground">
                      ₹{h.average_price.toFixed(2)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono-data text-foreground">
                      ₹{h.last_price.toFixed(2)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono-data text-foreground">
                      ₹
                      {curVal.toLocaleString("en-IN", {
                        maximumFractionDigits: 0,
                      })}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <PnlText value={pnl} />
                    </td>
                    <td className="py-2 px-3 text-right">
                      <PnlPct value={pnlPct} />
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="border-b border-border/50 bg-secondary/20">
                      <td colSpan={7} className="py-2 px-4">
                        <div
                          className="flex gap-2"
                          onClick={(ev) => ev.stopPropagation()}
                          onKeyDown={(ev) => ev.stopPropagation()}
                        >
                          <button
                            type="button"
                            data-ocid={`holdings.squareoff.${i + 1}`}
                            onClick={() => onSquareOff?.(h, "sell")}
                            className="flex-1 h-8 rounded text-[11px] font-bold bg-red-600 hover:bg-red-500 text-white transition-colors"
                          >
                            Square Off (SELL)
                          </button>
                          <button
                            type="button"
                            data-ocid={`holdings.gtt_squareoff.${i + 1}`}
                            onClick={() => onSquareOff?.(h, "gtt")}
                            className="flex-1 h-8 rounded text-[11px] font-bold bg-amber-600 hover:bg-amber-500 text-white transition-colors"
                          >
                            GTT Square Off
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              );
            })}
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Risk Management Tab ─────────────────────────────────────────────────────
const RISK_SETTINGS_KEY = "upstox_risk_settings";

function RiskTab({ token }: { token: string }) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);
  const [riskSettings, setRiskSettings] = useState<
    Record<string, { sl: string; tsl: string }>
  >(() => {
    try {
      return JSON.parse(localStorage.getItem(RISK_SETTINGS_KEY) ?? "{}");
    } catch {
      return {};
    }
  });

  const fixAvgPriceLocal = (pos: Position): Position => {
    if (pos.average_price && pos.average_price !== 0) return pos;
    if (pos.quantity > 0 && pos.buy_quantity > 0)
      return { ...pos, average_price: pos.buy_value / pos.buy_quantity };
    if (pos.quantity < 0 && pos.sell_quantity > 0)
      return { ...pos, average_price: pos.sell_value / pos.sell_quantity };
    if (pos.buy_quantity > 0)
      return { ...pos, average_price: pos.buy_value / pos.buy_quantity };
    return pos;
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: fixAvgPriceLocal is stable
  const fetchPositions = useCallback(async () => {
    setLoading(true);
    const res = await upstoxFetch<Position[]>(
      "/v2/portfolio/short-term-positions",
      token,
    );
    if (res.data)
      setPositions(
        (Array.isArray(res.data) ? res.data : []).map(fixAvgPriceLocal),
      );
    else if (res.error) toast.error(`Risk Monitor: ${res.error}`);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  const saveSettings = (symbol: string, sl: string, tsl: string) => {
    const next = { ...riskSettings, [symbol]: { sl, tsl } };
    setRiskSettings(next);
    localStorage.setItem(RISK_SETTINGS_KEY, JSON.stringify(next));
  };

  const getRiskLevel = (pnlPct: number) => {
    if (pnlPct < -5)
      return {
        label: "HIGH",
        score: 75,
        cls: "bg-red-950 text-loss border-red-800/40",
      };
    if (pnlPct < 0)
      return {
        label: "MEDIUM",
        score: 40,
        cls: "bg-amber-950 text-amber-400 border-amber-800/40",
      };
    return {
      label: "LOW",
      score: 10,
      cls: "bg-green-950 text-gain border-green-800/40",
    };
  };

  const getStatusIndicator = (ltp: number, sl: number) => {
    if (sl <= 0) return null;
    if (ltp < sl)
      return {
        label: "BREACHED",
        cls: "text-loss animate-pulse",
        bg: "bg-red-950/50 border-red-800/40",
      };
    if (ltp < sl * 1.02)
      return {
        label: "WARNING",
        cls: "text-amber-400",
        bg: "bg-amber-950/50 border-amber-800/40",
      };
    return {
      label: "SAFE",
      cls: "text-gain",
      bg: "bg-green-950/50 border-green-800/40",
    };
  };

  const getAIRecommendation = (
    pnlPct: number,
    profit: number,
    hasTsl: boolean,
    slNum: number,
    ltp: number,
  ) => {
    if (pnlPct < -5)
      return "⚠ High loss detected. Exit or tighten SL immediately.";
    if (pnlPct > 5 && hasTsl)
      return "✓ Profitable. TSL active — trailing profits locked.";
    if (pnlPct > 5 && !hasTsl)
      return `💡 Set a Trailing SL to protect ₹${Math.abs(profit).toFixed(0)} profit.`;
    if (slNum > 0 && ltp < slNum * 1.02)
      return "⚠ Near SL zone. Monitor closely.";
    return "Position within normal range. Hold.";
  };

  return (
    <div className="space-y-0">
      {/* AI Risk Monitor Header */}
      <div
        className="p-4 border-b border-border"
        style={{ background: "oklch(var(--card))" }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <p className="text-xs font-bold text-foreground uppercase tracking-widest">
              AI Risk Monitor
            </p>
          </div>
          <button
            data-ocid="risk.refresh.button"
            type="button"
            onClick={fetchPositions}
            className="w-7 h-7 flex items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Position Cards */}
      <div className="p-3 space-y-3">
        {loading ? (
          <div data-ocid="risk.loading_state" className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-24 rounded bg-secondary animate-pulse"
              />
            ))}
          </div>
        ) : positions.length === 0 ? (
          <div data-ocid="risk.empty_state" className="py-12 text-center">
            <Shield className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">
              No open positions to monitor
            </p>
          </div>
        ) : (
          positions.map((pos, i) => {
            const pnlPct =
              pos.average_price > 0
                ? (pos.pnl / (pos.average_price * Math.abs(pos.quantity))) * 100
                : 0;
            const risk = getRiskLevel(pnlPct);
            const settings = riskSettings[pos.tradingsymbol] ?? {
              sl: "",
              tsl: "",
            };
            const slNum = Number.parseFloat(settings.sl) || 0;
            const hasTsl =
              !!settings.tsl && Number.parseFloat(settings.tsl) > 0;
            const status = getStatusIndicator(pos.last_price, slNum);
            const aiRec = getAIRecommendation(
              pnlPct,
              pos.pnl,
              hasTsl,
              slNum,
              pos.last_price,
            );

            return (
              <div
                key={`${pos.tradingsymbol}-${i}`}
                data-ocid={`risk.item.${i + 1}`}
                className="rounded border border-border overflow-hidden"
                style={{ background: "oklch(var(--card))" }}
              >
                {/* Card Header */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
                  <div className="flex items-center gap-2">
                    <p className="font-mono font-bold text-sm text-foreground">
                      {pos.tradingsymbol}
                    </p>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${risk.cls}`}
                    >
                      {risk.label}
                    </span>
                    {status && (
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${status.bg} ${status.cls}`}
                      >
                        {status.label}
                      </span>
                    )}
                  </div>
                  <PnlPct value={pnlPct} className="text-xs font-bold" />
                </div>

                {/* Stats Row */}
                <div className="grid grid-cols-4 gap-0 border-b border-border/50">
                  {[
                    { label: "QTY", val: String(pos.quantity) },
                    { label: "AVG", val: `₹${pos.average_price.toFixed(2)}` },
                    { label: "LTP", val: `₹${pos.last_price.toFixed(2)}` },
                    { label: "P&L", val: null, pnl: pos.pnl },
                  ].map((item) => (
                    <div key={item.label} className="px-3 py-2">
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wider">
                        {item.label}
                      </p>
                      {item.pnl !== undefined ? (
                        <PnlText value={item.pnl} className="text-xs" />
                      ) : (
                        <p className="font-mono-data text-xs font-bold text-foreground">
                          {item.val}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                {/* SL / TSL Inputs */}
                <div className="grid grid-cols-2 gap-2 px-3 py-2 border-b border-border/50">
                  <div>
                    <Label className="text-[9px] text-muted-foreground uppercase tracking-wider">
                      Stop Loss ₹
                    </Label>
                    <Input
                      data-ocid={`risk.sl_input.${i + 1}`}
                      type="number"
                      placeholder="0.00"
                      value={settings.sl}
                      onChange={(e) =>
                        saveSettings(
                          pos.tradingsymbol,
                          e.target.value,
                          settings.tsl,
                        )
                      }
                      className="h-7 mt-0.5 bg-secondary border-border font-mono-data text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-[9px] text-muted-foreground uppercase tracking-wider">
                      Trail SL %
                    </Label>
                    <Input
                      data-ocid={`risk.tsl_input.${i + 1}`}
                      type="number"
                      placeholder="0.0"
                      value={settings.tsl}
                      onChange={(e) =>
                        saveSettings(
                          pos.tradingsymbol,
                          settings.sl,
                          e.target.value,
                        )
                      }
                      className="h-7 mt-0.5 bg-secondary border-border font-mono-data text-xs"
                    />
                  </div>
                </div>

                {/* AI Recommendation */}
                <div className="px-3 py-2">
                  <p
                    className={`text-[10px] leading-relaxed ${
                      aiRec.startsWith("⚠")
                        ? "text-amber-400"
                        : aiRec.startsWith("✓")
                          ? "text-gain"
                          : aiRec.startsWith("💡")
                            ? "text-primary"
                            : "text-muted-foreground"
                    }`}
                  >
                    {aiRec}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Option Chain Tab ──────────────────────────────────────────────────────────
const OPTION_UNDERLYINGS = [
  { label: "NIFTY", key: "NSE_INDEX|Nifty 50" },
  { label: "BANKNIFTY", key: "NSE_INDEX|Nifty Bank" },
  { label: "SENSEX", key: "BSE_INDEX|SENSEX" },
] as const;

// ─── Trend Analysis Panel ─────────────────────────────────────────────────────
function TrendAnalysisPanel({
  chain,
  underlyingLtp,
  expiries,
  selectedExpiry,
  tradeSettings,
  greeksData,
  expanded = true,
  onToggleExpanded,
  onSignalReady,
}: {
  chain: OptionData[];
  underlyingLtp: number;
  expiries?: string[];
  selectedExpiry?: string;
  tradeSettings?: TradeSettings;
  greeksData?: Record<
    string,
    {
      delta?: number;
      gamma?: number;
      theta?: number;
      vega?: number;
      iv?: number;
    }
  >;
  expanded?: boolean;
  onToggleExpanded?: () => void;
  onSignalReady?: (
    signal: Omit<GeneratedSignal, "id" | "timestamp" | "date" | "status">,
  ) => void;
}) {
  const [reasoningOpen, setReasoningOpen] = useState(false);

  // ── OI totals ──────────────────────────────────────────────────────────────
  const totalCE_OI = chain.reduce(
    (s, r) => s + (r.call_options?.market_data?.oi ?? 0),
    0,
  );
  const totalPE_OI = chain.reduce(
    (s, r) => s + (r.put_options?.market_data?.oi ?? 0),
    0,
  );
  const PCR = totalCE_OI > 0 ? totalPE_OI / totalCE_OI : 0;

  // ── ATM strike ─────────────────────────────────────────────────────────────
  const atm = chain.reduce<OptionData | null>((best, row) => {
    if (!best) return row;
    return Math.abs(row.strike_price - underlyingLtp) <
      Math.abs(best.strike_price - underlyingLtp)
      ? row
      : best;
  }, null);
  const atmIdx = atm
    ? chain.findIndex((r) => r.strike_price === atm.strike_price)
    : -1;

  // ── Max OI strikes (resistance = CE max, support = PE max) ─────────────────
  const maxCeOiRow = chain.reduce(
    (best, r) =>
      (r.call_options?.market_data?.oi ?? 0) >
      (best.call_options?.market_data?.oi ?? 0)
        ? r
        : best,
    chain[0],
  );
  const maxPeOiRow = chain.reduce(
    (best, r) =>
      (r.put_options?.market_data?.oi ?? 0) >
      (best.put_options?.market_data?.oi ?? 0)
        ? r
        : best,
    chain[0],
  );

  // ── Max Pain calculation ───────────────────────────────────────────────────
  const maxPainStrike = (() => {
    let minPain = Number.POSITIVE_INFINITY;
    let mpStrike = chain[0]?.strike_price ?? 0;
    for (const row of chain) {
      const s = row.strike_price;
      let pain = 0;
      for (const r of chain) {
        const ceOI = r.call_options?.market_data?.oi ?? 0;
        const peOI = r.put_options?.market_data?.oi ?? 0;
        if (s > r.strike_price) pain += (s - r.strike_price) * ceOI;
        if (s < r.strike_price) pain += (r.strike_price - s) * peOI;
      }
      if (pain < minPain) {
        minPain = pain;
        mpStrike = s;
      }
    }
    return mpStrike;
  })();

  // ── OI momentum — strike with biggest combined OI buildup ─────────────────
  const oiMomentumRow = chain.reduce((best, r) => {
    const total =
      (r.call_options?.market_data?.oi ?? 0) +
      (r.put_options?.market_data?.oi ?? 0);
    const bestTotal =
      (best.call_options?.market_data?.oi ?? 0) +
      (best.put_options?.market_data?.oi ?? 0);
    return total > bestTotal ? r : best;
  }, chain[0]);

  // ── OI Concentration (top 3 by OI) ──────────────────────────────────────
  const top3CeOI = [...chain]
    .sort(
      (a, b) =>
        (b.call_options?.market_data?.oi ?? 0) -
        (a.call_options?.market_data?.oi ?? 0),
    )
    .slice(0, 3);
  const top3PeOI = [...chain]
    .sort(
      (a, b) =>
        (b.put_options?.market_data?.oi ?? 0) -
        (a.put_options?.market_data?.oi ?? 0),
    )
    .slice(0, 3);

  // ── Multi-signal trend determination ──────────────────────────────────────
  let bullSignals = 0;
  let bearSignals = 0;

  // Signal 1: PCR
  if (PCR > 1.2) bullSignals++;
  else if (PCR < 0.8) bearSignals++;

  // Signal 2: Max pain vs ATM
  if (atm && maxPainStrike < atm.strike_price) bullSignals++;
  else if (atm && maxPainStrike > atm.strike_price) bearSignals++;

  // Signal 3: CE resistance above ATM = bullish bias (market above support)
  if (atm && maxCeOiRow.strike_price > atm.strike_price) bullSignals++;
  else bearSignals++;

  // Signal 4: PE support below ATM = bullish
  if (atm && maxPeOiRow.strike_price < atm.strike_price) bullSignals++;
  else bearSignals++;

  // Signal 5: Greeks-based delta momentum
  if (greeksData && atm) {
    const atmCeKey5 = atm.call_options?.instrument_key;
    const atmCeDelta = atmCeKey5 ? (greeksData[atmCeKey5]?.delta ?? 0) : 0;
    if (atmCeDelta > 0.52) bullSignals++;
    else if (atmCeDelta < 0.48 && atmCeDelta !== 0) bearSignals++;
  }

  // Signal 6: OI buildup — if majority of top 3 CE OI strikes above ATM = bullish
  const ceAboveAtm = atm
    ? top3CeOI.filter((r) => r.strike_price > atm.strike_price).length
    : 0;
  const peBelowAtm = atm
    ? top3PeOI.filter((r) => r.strike_price < atm.strike_price).length
    : 0;
  if (ceAboveAtm >= 2 && peBelowAtm >= 2) bullSignals++;
  else if (ceAboveAtm <= 1 || peBelowAtm <= 1) bearSignals++;

  // Signal 7: IV skew
  if (greeksData && atm) {
    const ceKeyS7 = atm.call_options?.instrument_key;
    const peKeyS7 = atm.put_options?.instrument_key;
    const ceIV_s7 = ceKeyS7 ? (greeksData[ceKeyS7]?.iv ?? 0) : 0;
    const peIV_s7 = peKeyS7 ? (greeksData[peKeyS7]?.iv ?? 0) : 0;
    if (peIV_s7 - ceIV_s7 > 2) bearSignals++;
    else if (ceIV_s7 - peIV_s7 > 2) bullSignals++;
  }

  const trend =
    bullSignals >= 3 ? "BULLISH" : bearSignals >= 3 ? "BEARISH" : "NEUTRAL";

  // ── Confidence based on signal strength (8 total signals) ─────────────────
  const maxSig = Math.max(bullSignals, bearSignals);
  const confidence = maxSig >= 6 ? "HIGH" : maxSig >= 4 ? "MEDIUM" : "LOW";

  // ── Auto-select best strike ────────────────────────────────────────────────
  let recommendedStrike = atm?.strike_price ?? 0;
  let action: "BUY CALL" | "BUY PUT" | "NEUTRAL" = "NEUTRAL";

  if (trend === "BULLISH") {
    action = "BUY CALL";
    if (confidence === "HIGH" && atmIdx > 0) {
      // ITM: 1 step below ATM for higher-delta call
      recommendedStrike = chain[atmIdx - 1].strike_price;
    } else if (atmIdx >= 0) {
      // ATM call
      recommendedStrike = atm?.strike_price ?? 0;
    }
    // Greeks: find best delta strike near 0.45
    if (greeksData && atm) {
      let closestDelta = Math.abs(
        (greeksData[atm.call_options?.instrument_key ?? ""]?.delta ?? 0.5) -
          0.45,
      );
      for (const row of chain) {
        const key = row.call_options?.instrument_key;
        if (!key || !greeksData[key]) continue;
        const d = Math.abs((greeksData[key].delta ?? 0.5) - 0.45);
        if (d < closestDelta) {
          closestDelta = d;
          recommendedStrike = row.strike_price;
        }
      }
    }
  } else if (trend === "BEARISH") {
    action = "BUY PUT";
    if (confidence === "HIGH" && atmIdx >= 0 && atmIdx + 1 < chain.length) {
      // ITM: 1 step above ATM for higher-delta put
      recommendedStrike = chain[atmIdx + 1].strike_price;
    } else if (atmIdx >= 0) {
      recommendedStrike = atm?.strike_price ?? 0;
    }
  }

  // ── Auto-select expiry (nearest) ──────────────────────────────────────────
  const autoExpiry = selectedExpiry ?? expiries?.[0] ?? "—";

  // ── Find recommended strike LTP ───────────────────────────────────────────
  const recRow = chain.find((r) => r.strike_price === recommendedStrike);
  const recLtp =
    action === "BUY CALL"
      ? (recRow?.call_options?.market_data?.ltp ?? 0)
      : action === "BUY PUT"
        ? (recRow?.put_options?.market_data?.ltp ?? 0)
        : 0;

  // ── ATM Greeks for display ───────────────────────────────────────────────
  const atmCeKey = atm?.call_options?.instrument_key ?? "";
  const atmPeKey = atm?.put_options?.instrument_key ?? "";
  const atmDeltaVal = greeksData?.[atmCeKey]?.delta ?? null;
  const atmGamma = greeksData?.[atmCeKey]?.gamma ?? null;
  const atmTheta = greeksData?.[atmCeKey]?.theta ?? null;
  const atmVega = greeksData?.[atmCeKey]?.vega ?? null;
  const atmIV = greeksData?.[atmCeKey]?.iv ?? null;
  const atmPeIV = greeksData?.[atmPeKey]?.iv ?? null;

  // ── High-conviction signal gate ───────────────────────────────────────────
  // (must be after atmIV declaration)
  const isHighConviction =
    chain.length > 0 &&
    confidence === "HIGH" &&
    trend !== "NEUTRAL" &&
    bullSignals + bearSignals >= 6 &&
    (atmIV === null || atmIV < 40) &&
    recLtp > 0;

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional signal fire
  useEffect(() => {
    if (!isHighConviction || !onSignalReady || recLtp <= 0) return;
    const slPct = (tradeSettings?.slPct ?? 25) / 100;
    const sl = recLtp * (1 - slPct);
    const risk = recLtp - sl;
    const tgt1 = recLtp + risk * (tradeSettings?.tgt1RR ?? 2);
    const tgt2 = recLtp + risk * (tradeSettings?.tgt2RR ?? 3);
    onSignalReady({
      instrument: "NIFTY",
      strike: recommendedStrike,
      action: trend === "BULLISH" ? "BUY CALL" : "BUY PUT",
      expiry: autoExpiry,
      entryPrice: recLtp,
      sl,
      tgt1,
      tgt2,
      ceInstrumentKey: atm?.call_options?.instrument_key,
      peInstrumentKey: atm?.put_options?.instrument_key,
    });
  }, [isHighConviction, trend, recommendedStrike]); // eslint-disable-line

  // Early return after hooks
  if (chain.length === 0) return null;

  // Market regime based on IV
  const marketRegime =
    atmIV === null
      ? null
      : atmIV < 15
        ? {
            label: "LOW VOL",
            cls: "text-blue-300 border-blue-700/40 bg-blue-950/40",
          }
        : atmIV < 25
          ? {
              label: "NORMAL",
              cls: "text-green-300 border-green-700/40 bg-green-950/40",
            }
          : atmIV < 40
            ? {
                label: "HIGH VOL",
                cls: "text-amber-300 border-amber-700/40 bg-amber-950/40",
              }
            : {
                label: "EXTREME",
                cls: "text-red-300 border-red-700/40 bg-red-950/40",
              };

  // Theta decay warning
  const thetaDecayPct =
    recLtp > 0 && atmTheta !== null ? (Math.abs(atmTheta) / recLtp) * 100 : 0;
  const highDecay = thetaDecayPct > 1;

  // Best CE strike (delta closest to 0.45)
  let bestCeStrike: {
    strike: number;
    ltp: number;
    delta: number;
    theta: number;
  } | null = null;
  if (greeksData) {
    let closestCe = 999;
    for (const row of chain) {
      const key = row.call_options?.instrument_key;
      if (!key || !greeksData[key]) continue;
      const d = Math.abs((greeksData[key].delta ?? 0.5) - 0.45);
      if (d < closestCe) {
        closestCe = d;
        bestCeStrike = {
          strike: row.strike_price,
          ltp: row.call_options?.market_data?.ltp ?? 0,
          delta: greeksData[key].delta ?? 0,
          theta: greeksData[key].theta ?? 0,
        };
      }
    }
  }

  // Best PE strike (delta closest to -0.45)
  let bestPeStrike: {
    strike: number;
    ltp: number;
    delta: number;
    theta: number;
  } | null = null;
  if (greeksData) {
    let closestPe = 999;
    for (const row of chain) {
      const key = row.put_options?.instrument_key;
      if (!key || !greeksData[key]) continue;
      const d = Math.abs((greeksData[key].delta ?? -0.5) - -0.45);
      if (d < closestPe) {
        closestPe = d;
        bestPeStrike = {
          strike: row.strike_price,
          ltp: row.put_options?.market_data?.ltp ?? 0,
          delta: greeksData[key].delta ?? 0,
          theta: greeksData[key].theta ?? 0,
        };
      }
    }
  }

  // ── AI reasoning text ─────────────────────────────────────────────────────
  const reasoning: string[] = [];
  if (PCR > 1.2)
    reasoning.push(
      `PCR ${PCR.toFixed(2)} indicates heavy PUT writing — market makers expect support, bullish bias.`,
    );
  else if (PCR < 0.8)
    reasoning.push(
      `PCR ${PCR.toFixed(2)} indicates heavy CALL writing — resistance building, bearish bias.`,
    );
  else
    reasoning.push(
      `PCR ${PCR.toFixed(2)} — neutral OI distribution, no strong directional bias.`,
    );

  reasoning.push(
    `Max Pain at ${maxPainStrike.toLocaleString("en-IN")} — market likely to gravitate here by expiry. Current spot ${underlyingLtp > 0 ? underlyingLtp.toLocaleString("en-IN") : "—"}.`,
  );
  reasoning.push(
    `CE resistance at ${maxCeOiRow.strike_price.toLocaleString("en-IN")}, PE support at ${maxPeOiRow.strike_price.toLocaleString("en-IN")} — ${bullSignals} bullish / ${bearSignals} bearish signals.`,
  );
  if (greeksData && atm) {
    if (atmDeltaVal !== null) {
      reasoning.push(
        `ATM CE Delta: ${atmDeltaVal.toFixed(3)} — ${atmDeltaVal > 0.5 ? "bullish momentum (delta above 0.50)" : "bearish bias (delta below 0.50)"}.`,
      );
    }
    if (atmIV !== null) {
      reasoning.push(
        `ATM IV: ${atmIV.toFixed(1)}% — ${atmIV > 25 ? "elevated volatility, option premiums are rich" : "low IV, options are relatively cheap"}.`,
      );
    }
    if (atmIV !== null && atmPeIV !== null && Math.abs(atmPeIV - atmIV) > 1) {
      reasoning.push(
        `IV Skew: PE IV ${atmPeIV.toFixed(1)}% vs CE IV ${atmIV.toFixed(1)}% — ${atmPeIV > atmIV ? "downside fear premium present" : "upside demand driving CE premiums"}.`,
      );
    }
    if (atmGamma !== null && atmGamma > 0.003) {
      reasoning.push(
        `HIGH GAMMA zone (${atmGamma.toFixed(4)}) — expect explosive moves near ATM, avoid naked option sells.`,
      );
    }
    if (highDecay) {
      reasoning.push(
        `Theta decay: ${thetaDecayPct.toFixed(1)}%/day of premium — avoid holding options overnight if theta > 1% per day.`,
      );
    }
  }

  // ── Style classes ─────────────────────────────────────────────────────────
  const actionBg =
    action === "BUY CALL"
      ? "bg-green-950 border-green-700/60 text-green-300"
      : action === "BUY PUT"
        ? "bg-red-950 border-red-700/60 text-red-300"
        : "bg-secondary border-border text-muted-foreground";

  const confCls =
    confidence === "HIGH"
      ? "bg-green-900/60 text-green-300 border-green-700/40"
      : confidence === "MEDIUM"
        ? "bg-amber-900/60 text-amber-300 border-amber-700/40"
        : "bg-secondary text-muted-foreground border-border";

  return (
    <div
      data-ocid="options.trend_panel"
      className="border-b border-border"
      style={{ background: "oklch(0.10 0.012 250)" }}
    >
      {/* Header with toggle */}
      <div className="flex items-center gap-2 px-3 py-2">
        <BarChart2 className="w-3.5 h-3.5 text-primary" />
        <p className="text-[10px] font-bold text-muted-foreground tracking-widest uppercase">
          AI Option Chain Analysis
        </p>
        <span className="ml-auto text-[9px] text-muted-foreground/50 italic">
          100% data-driven signals
        </span>
        {onToggleExpanded && (
          <button
            type="button"
            data-ocid="options.ai_panel.toggle"
            className="ml-1 p-0.5 rounded hover:bg-secondary/60 transition-colors text-muted-foreground hover:text-foreground"
            onClick={onToggleExpanded}
            aria-label={expanded ? "Minimize AI panel" : "Expand AI panel"}
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-200${expanded ? "" : " rotate-90"}`}
            />
          </button>
        )}
      </div>
      {expanded && (
        <div className="p-3">
          {/* Main recommendation card */}
          <div
            data-ocid="options.ai.card"
            className={`rounded-lg border p-3 mb-3 ${actionBg}`}
          >
            {/* Action + Confidence row */}
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`text-base font-black tracking-tight px-3 py-1 rounded-md border ${actionBg}`}
              >
                {action === "BUY CALL"
                  ? "▲ BUY CALL"
                  : action === "BUY PUT"
                    ? "▼ BUY PUT"
                    : "~ NEUTRAL"}
              </span>
              <div className="flex items-center gap-1.5 flex-1">
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded border shrink-0 ${confCls}`}
                >
                  {confidence}
                </span>
                {marketRegime && (
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${marketRegime.cls}`}
                  >
                    {marketRegime.label}
                  </span>
                )}
                <div className="flex-1 h-2 rounded-full overflow-hidden bg-secondary/60 min-w-[40px]">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.round((Math.max(bullSignals, bearSignals) / 8) * 100)}%`,
                      background:
                        trend === "BULLISH"
                          ? "oklch(0.64 0.2 145)"
                          : trend === "BEARISH"
                            ? "oklch(0.62 0.22 22)"
                            : "oklch(0.7 0.05 250)",
                    }}
                  />
                </div>
                <span className="text-[9px] text-muted-foreground/70 font-mono-data shrink-0">
                  {trend === "BULLISH" ? bullSignals : bearSignals}/8
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground ml-auto">
                Strike:{" "}
                <span className="font-mono-data font-bold text-foreground">
                  {recommendedStrike > 0
                    ? recommendedStrike.toLocaleString("en-IN")
                    : "—"}
                </span>
              </span>
            </div>

            {/* Strike + Expiry */}
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <p className="text-[9px] text-muted-foreground mb-0.5 uppercase tracking-wider">
                  Strike Price
                </p>
                <p className="font-mono-data text-xl font-black text-foreground">
                  {recommendedStrike > 0
                    ? recommendedStrike.toLocaleString("en-IN")
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-[9px] text-muted-foreground mb-0.5 uppercase tracking-wider">
                  Expiry
                </p>
                <p className="font-mono-data text-sm font-bold text-foreground">
                  {autoExpiry}
                </p>
              </div>
            </div>

            {/* Entry / SL / Target */}
            {recLtp > 0 &&
              (() => {
                const slPct = (tradeSettings?.slPct ?? 25) / 100;
                const sl = recLtp * (1 - slPct);
                const risk = recLtp - sl;
                const target1 = recLtp + risk * (tradeSettings?.tgt1RR ?? 2);
                const target2 = recLtp + risk * (tradeSettings?.tgt2RR ?? 3);
                return (
                  <div className="flex mb-2 rounded-lg border border-border bg-card overflow-hidden">
                    <div className="flex-1 text-center py-2 px-1">
                      <p className="text-[8px] text-muted-foreground mb-1 uppercase tracking-widest font-semibold">
                        Buy Price
                      </p>
                      <p className="font-mono-data text-sm font-black text-blue-300">
                        ₹{recLtp.toFixed(2)}
                      </p>
                    </div>
                    <div className="flex-1 text-center py-2 px-1 border-l border-border">
                      <p className="text-[8px] text-muted-foreground mb-1 uppercase tracking-widest font-semibold">
                        SL
                      </p>
                      <p className="font-mono-data text-sm font-black text-red-400">
                        ₹{sl.toFixed(2)}
                      </p>
                      <p className="text-[8px] text-muted-foreground/60 mt-0.5">
                        R:R 1:{(tradeSettings?.tgt1RR ?? 2).toFixed(1)}
                      </p>
                    </div>
                    <div className="flex-1 text-center py-2 px-1 border-l border-border">
                      <p className="text-[8px] text-muted-foreground mb-1 uppercase tracking-widest font-semibold">
                        TGT1
                      </p>
                      <p className="font-mono-data text-sm font-black text-green-400">
                        ₹{target1.toFixed(2)}
                      </p>
                    </div>
                    <div className="flex-1 text-center py-2 px-1 border-l border-border">
                      <p className="text-[8px] text-muted-foreground mb-1 uppercase tracking-widest font-semibold">
                        TGT2
                      </p>
                      <p className="font-mono-data text-sm font-black text-emerald-300">
                        ₹{target2.toFixed(2)}
                      </p>
                    </div>
                  </div>
                );
              })()}

            {/* Greeks scorecard */}
            {(atmDeltaVal !== null ||
              atmGamma !== null ||
              atmTheta !== null ||
              atmVega !== null ||
              atmIV !== null) && (
              <div className="flex gap-2 flex-wrap mb-2">
                {atmDeltaVal !== null && (
                  <div className="flex flex-col items-center bg-secondary/30 rounded px-2 py-1 border border-border/50 min-w-[44px]">
                    <span className="text-[8px] text-muted-foreground uppercase tracking-wider">
                      Δ Delta
                    </span>
                    <span
                      className={`text-[11px] font-mono-data font-bold ${action === "BUY CALL" ? (atmDeltaVal > 0.45 ? "text-green-400" : "text-amber-400") : action === "BUY PUT" ? (atmDeltaVal < 0.55 ? "text-green-400" : "text-amber-400") : "text-foreground"}`}
                    >
                      {atmDeltaVal.toFixed(3)}
                    </span>
                  </div>
                )}
                {atmGamma !== null && (
                  <div className="flex flex-col items-center bg-secondary/30 rounded px-2 py-1 border border-border/50 min-w-[44px]">
                    <span className="text-[8px] text-muted-foreground uppercase tracking-wider">
                      Γ Gamma
                    </span>
                    <span
                      className={`text-[11px] font-mono-data font-bold ${atmGamma > 0.003 ? "text-red-400" : "text-foreground"}`}
                    >
                      {atmGamma.toFixed(4)}
                    </span>
                  </div>
                )}
                {atmTheta !== null && (
                  <div className="flex flex-col items-center bg-secondary/30 rounded px-2 py-1 border border-border/50 min-w-[44px]">
                    <span className="text-[8px] text-muted-foreground uppercase tracking-wider">
                      Θ Theta
                    </span>
                    <span
                      className={`text-[11px] font-mono-data font-bold ${highDecay ? "text-red-400" : "text-foreground"}`}
                    >
                      {atmTheta.toFixed(2)}
                    </span>
                    {highDecay && (
                      <span className="text-[7px] text-red-400 font-bold">
                        HIGH DECAY
                      </span>
                    )}
                  </div>
                )}
                {atmVega !== null && (
                  <div className="flex flex-col items-center bg-secondary/30 rounded px-2 py-1 border border-border/50 min-w-[44px]">
                    <span className="text-[8px] text-muted-foreground uppercase tracking-wider">
                      ν Vega
                    </span>
                    <span className="text-[11px] font-mono-data font-bold text-foreground">
                      {atmVega.toFixed(2)}
                    </span>
                  </div>
                )}
                {atmIV !== null && (
                  <div className="flex flex-col items-center bg-secondary/30 rounded px-2 py-1 border border-border/50 min-w-[44px]">
                    <span className="text-[8px] text-muted-foreground uppercase tracking-wider">
                      IV %
                    </span>
                    <span
                      className={`text-[11px] font-mono-data font-bold ${atmIV > 40 ? "text-red-400" : atmIV > 25 ? "text-amber-400" : "text-green-400"}`}
                    >
                      {atmIV.toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Best Strike Suggestions */}
            {(bestCeStrike || bestPeStrike) && (
              <div className="grid grid-cols-2 gap-2 mb-2">
                {bestCeStrike && (
                  <div className="rounded border border-green-800/40 bg-green-950/20 p-2">
                    <p className="text-[8px] text-muted-foreground uppercase tracking-wider mb-1">
                      Best CE Entry
                    </p>
                    <p className="font-mono-data text-sm font-bold text-green-300">
                      {bestCeStrike.strike.toLocaleString("en-IN")}
                    </p>
                    <div className="flex gap-2 mt-1">
                      <span className="text-[9px] text-muted-foreground">
                        ₹{bestCeStrike.ltp.toFixed(2)}
                      </span>
                      <span className="text-[9px] text-muted-foreground">
                        Δ {bestCeStrike.delta.toFixed(3)}
                      </span>
                      <span className="text-[9px] text-muted-foreground">
                        Θ {bestCeStrike.theta.toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
                {bestPeStrike && (
                  <div className="rounded border border-red-800/40 bg-red-950/20 p-2">
                    <p className="text-[8px] text-muted-foreground uppercase tracking-wider mb-1">
                      Best PE Entry
                    </p>
                    <p className="font-mono-data text-sm font-bold text-red-300">
                      {bestPeStrike.strike.toLocaleString("en-IN")}
                    </p>
                    <div className="flex gap-2 mt-1">
                      <span className="text-[9px] text-muted-foreground">
                        ₹{bestPeStrike.ltp.toFixed(2)}
                      </span>
                      <span className="text-[9px] text-muted-foreground">
                        Δ {bestPeStrike.delta.toFixed(3)}
                      </span>
                      <span className="text-[9px] text-muted-foreground">
                        Θ {bestPeStrike.theta.toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* OI Concentration bars */}
            <div className="mb-2">
              <p className="text-[8px] text-muted-foreground uppercase tracking-wider mb-1">
                OI Concentration
              </p>
              <div className="space-y-1">
                {top3CeOI.slice(0, 3).map((r) => {
                  const oi = r.call_options?.market_data?.oi ?? 0;
                  const maxOI = top3CeOI[0]
                    ? (top3CeOI[0].call_options?.market_data?.oi ?? 1)
                    : 1;
                  return (
                    <div
                      key={`ce-oi-${r.strike_price}`}
                      className="flex items-center gap-2"
                    >
                      <span className="text-[9px] text-red-300 font-mono-data w-14 text-right shrink-0">
                        {r.strike_price.toLocaleString("en-IN")}
                      </span>
                      <div className="flex-1 h-1.5 bg-secondary/40 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(oi / maxOI) * 100}%`,
                            background: "oklch(0.62 0.22 22 / 0.7)",
                          }}
                        />
                      </div>
                      <span className="text-[8px] text-muted-foreground/60 w-12 shrink-0">
                        {(oi / 100000).toFixed(1)}L CE
                      </span>
                    </div>
                  );
                })}
                {top3PeOI.slice(0, 3).map((r) => {
                  const oi = r.put_options?.market_data?.oi ?? 0;
                  const maxOI = top3PeOI[0]
                    ? (top3PeOI[0].put_options?.market_data?.oi ?? 1)
                    : 1;
                  return (
                    <div
                      key={`pe-oi-${r.strike_price}`}
                      className="flex items-center gap-2"
                    >
                      <span className="text-[9px] text-green-300 font-mono-data w-14 text-right shrink-0">
                        {r.strike_price.toLocaleString("en-IN")}
                      </span>
                      <div className="flex-1 h-1.5 bg-secondary/40 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(oi / maxOI) * 100}%`,
                            background: "oklch(0.64 0.2 145 / 0.7)",
                          }}
                        />
                      </div>
                      <span className="text-[8px] text-muted-foreground/60 w-12 shrink-0">
                        {(oi / 100000).toFixed(1)}L PE
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Compact metrics row with tap/hover tooltip */}
            <div
              className="relative mt-1 cursor-pointer"
              onClick={() => setReasoningOpen((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ")
                  setReasoningOpen((v) => !v);
              }}
            >
              {/* Compact metrics — always visible */}
              <div className="flex gap-3 flex-wrap text-[10px] cursor-pointer">
                <span className="text-muted-foreground">
                  PCR{" "}
                  <span className="font-mono-data text-foreground">
                    {PCR.toFixed(2)}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  Max Pain{" "}
                  <span className="font-mono-data text-amber-300">
                    {maxPainStrike.toLocaleString("en-IN")}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  CE Res{" "}
                  <span className="font-mono-data text-red-300">
                    {maxCeOiRow.strike_price.toLocaleString("en-IN")}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  PE Sup{" "}
                  <span className="font-mono-data text-green-300">
                    {maxPeOiRow.strike_price.toLocaleString("en-IN")}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  OI Hot{" "}
                  <span className="font-mono-data text-foreground/70">
                    {oiMomentumRow.strike_price.toLocaleString("en-IN")}
                  </span>
                </span>
                <span className="text-[9px] text-muted-foreground/40 italic ml-auto">
                  tap/hover for analysis
                </span>
              </div>
              {/* Hover tooltip — full reasoning */}
              <div
                className={`absolute left-0 top-full mt-1 z-50 w-full p-2 rounded-md border border-border shadow-xl space-y-1 ${reasoningOpen ? "visible opacity-100" : "invisible opacity-0"} hover:visible hover:opacity-100 transition-opacity duration-150`}
                style={{ background: "oklch(0.13 0.012 250)" }}
              >
                {reasoning.map((line, i) => {
                  const icons = ["📊", "🎯", "📈", "📉", "⚡", "🔥", "⚠️"];
                  return line ? (
                    <p
                      key={line.slice(0, 30)}
                      className="text-[10px] text-muted-foreground leading-relaxed"
                    >
                      {icons[i] ?? "•"} {line}
                    </p>
                  ) : null;
                })}
              </div>
            </div>
          </div>
          <p className="text-[9px] text-muted-foreground/50 italic text-center">
            ⚠️ AI analysis based on OI data. Trade at your own risk.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── LTP Hover Popup ──────────────────────────────────────────────────────────
interface MarketDepthEntry {
  price: number;
  quantity: number;
  orders?: number;
}

interface LtpSidePanelProps {
  instrumentKey: string;
  ltp: number;
  side: "CE" | "PE";
  strikePrice: number;
  token: string;
  lotSize: number;
  onClose: () => void;
  onBuy: (instrumentKey: string, ltp: number, lotSize: number) => void;
  onSell: (instrumentKey: string, ltp: number, lotSize: number) => void;
}

// ─── LTP Side Panel Sub-components (memoized to avoid full re-render every second) ─
const LiveLtpDisplay = memo(function LiveLtpDisplay({
  liveLtp,
  ohlc,
  change,
  changePct,
  isPositive,
}: {
  liveLtp: number;
  ohlc: {
    open: number;
    prev_close: number;
    high: number;
    low: number;
    volume?: number;
    avg_price?: number;
    lower_circuit?: number;
    upper_circuit?: number;
  } | null;
  change: number;
  changePct: number;
  isPositive: boolean;
}) {
  return (
    <>
      <div className="font-mono-data text-xl font-bold text-foreground mt-0.5">
        {liveLtp.toFixed(2)}
      </div>
      {ohlc && (
        <div
          className="font-mono-data text-xs mt-0.5"
          style={{
            color: isPositive ? "oklch(0.64 0.2 145)" : "oklch(0.62 0.22 22)",
          }}
        >
          {isPositive ? "+" : ""}
          {change.toFixed(2)} ({isPositive ? "+" : ""}
          {changePct.toFixed(2)}%)
        </div>
      )}
    </>
  );
});

const DepthRows = memo(function DepthRows({
  depth,
}: {
  depth: { bids: MarketDepthEntry[]; asks: MarketDepthEntry[] } | null;
}) {
  if (!depth) return null;
  const totalBidQty = depth.bids.reduce((s, b) => s + (b.quantity ?? 0), 0);
  const totalAskQty = depth.asks.reduce((s, a) => s + (a.quantity ?? 0), 0);
  const totalQty = totalBidQty + totalAskQty;
  const bidPct = totalQty > 0 ? Math.round((totalBidQty / totalQty) * 100) : 50;
  const maxBidQty = Math.max(...depth.bids.map((b) => b.quantity ?? 0), 1);
  const maxAskQty = Math.max(...depth.asks.map((a) => a.quantity ?? 0), 1);

  return (
    <>
      {/* Header */}
      <div className="grid grid-cols-4 text-[10px] text-muted-foreground font-semibold mb-1 px-1">
        <div className="text-right">Qty</div>
        <div className="text-right">Bid</div>
        <div className="text-left pl-1">Ask</div>
        <div className="text-left pl-1">Qty</div>
      </div>
      {/* Rows */}
      {Array.from({ length: 5 }).map((_, i) => {
        const bid = depth.bids[i];
        const ask = depth.asks[i];
        const bidBarPct = bid ? (bid.quantity / maxBidQty) * 100 : 0;
        const askBarPct = ask ? (ask.quantity / maxAskQty) * 100 : 0;
        return (
          <div
            key={`${bid?.price ?? "b"}-${ask?.price ?? "a"}-${i}`}
            className="grid grid-cols-4 text-[11px] font-mono-data py-0.5 relative"
          >
            {/* Bid qty with green bar */}
            <div className="text-right pr-1 relative">
              <div
                className="absolute right-0 top-0 h-full rounded-sm"
                style={{
                  width: `${bidBarPct}%`,
                  background: "oklch(0.64 0.2 145 / 0.15)",
                }}
              />
              <span
                className="relative"
                style={{ color: "oklch(0.64 0.2 145)" }}
              >
                {bid?.quantity?.toLocaleString("en-IN") ?? "—"}
              </span>
            </div>
            {/* Bid price */}
            <div
              className="text-right pr-1"
              style={{ color: "oklch(0.64 0.2 145)" }}
            >
              {bid?.price?.toFixed(2) ?? "—"}
            </div>
            {/* Ask price */}
            <div
              className="text-left pl-1"
              style={{ color: "oklch(0.62 0.22 22)" }}
            >
              {ask?.price?.toFixed(2) ?? "—"}
            </div>
            {/* Ask qty with red bar */}
            <div className="text-left pl-1 relative">
              <div
                className="absolute left-0 top-0 h-full rounded-sm"
                style={{
                  width: `${askBarPct}%`,
                  background: "oklch(0.62 0.22 22 / 0.15)",
                }}
              />
              <span
                className="relative"
                style={{ color: "oklch(0.62 0.22 22)" }}
              >
                {ask?.quantity?.toLocaleString("en-IN") ?? "—"}
              </span>
            </div>
          </div>
        );
      })}
      {/* Totals */}
      <div className="mt-2 pt-2 border-t border-border/50">
        <div className="flex justify-between text-[10px] font-mono-data mb-1">
          <span style={{ color: "oklch(0.64 0.2 145)" }}>
            {bidPct}% ({totalBidQty.toLocaleString("en-IN")})
          </span>
          <span className="text-muted-foreground text-[9px]">Total</span>
          <span style={{ color: "oklch(0.62 0.22 22)" }}>
            ({totalAskQty.toLocaleString("en-IN")}) {100 - bidPct}%
          </span>
        </div>
        {/* Split bar */}
        <div
          className="h-1.5 rounded-full overflow-hidden flex"
          style={{ background: "oklch(var(--secondary))" }}
        >
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${bidPct}%`, background: "oklch(0.64 0.2 145)" }}
          />
          <div
            className="h-full transition-all duration-500"
            style={{
              width: `${100 - bidPct}%`,
              background: "oklch(0.62 0.22 22)",
            }}
          />
        </div>
      </div>
    </>
  );
});

function LtpSidePanel({
  instrumentKey,
  ltp,
  side,
  strikePrice,
  token,
  lotSize,
  onClose,
  onBuy,
  onSell,
}: LtpSidePanelProps) {
  const [depth, setDepth] = useState<{
    bids: MarketDepthEntry[];
    asks: MarketDepthEntry[];
  } | null>(null);
  const [ohlc, setOhlc] = useState<{
    open: number;
    prev_close: number;
    high: number;
    low: number;
    volume?: number;
    avg_price?: number;
    lower_circuit?: number;
    upper_circuit?: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [depthLoading, setDepthLoading] = useState(true);
  const [statsOpen, setStatsOpen] = useState(true);
  const [depthOpen, setDepthOpen] = useState(true);
  const [visible, setVisible] = useState(false);
  const [liveLtp, setLiveLtp] = useState(ltp);

  // Derive symbol label from instrumentKey + strikePrice + side
  const symbolLabel = (() => {
    const parts = instrumentKey.split("|");
    const seg = parts[1] ?? instrumentKey;
    // Try to extract underlying name from segment e.g. NIFTY23500CE
    const match = seg.match(/^([A-Z]+)\d/);
    const underlying = match ? match[1] : seg.split(/\d/)[0];
    return `${underlying} ${strikePrice.toLocaleString("en-IN")} ${side}`;
  })();

  const change = ohlc ? liveLtp - ohlc.prev_close : 0;
  const changePct =
    ohlc && ohlc.prev_close > 0 ? (change / ohlc.prev_close) * 100 : 0;
  const isPositive = change >= 0;

  useEffect(() => {
    // slide in after mount
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  // Live LTP + depth polling every 1 second
  useEffect(() => {
    if (!token || !instrumentKey) return;
    const encoded = encodeURIComponent(instrumentKey);
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    async function poll() {
      try {
        // Fetch live LTP
        const ltpRes = await fetch(
          `https://api.upstox.com/v2/market-quote/ltp?instrument_key=${encoded}`,
          { headers },
        );
        if (ltpRes.ok) {
          const d = await ltpRes.json();
          const key = Object.keys(d?.data ?? {})[0];
          const lastPrice = d?.data?.[key]?.last_price;
          if (lastPrice) setLiveLtp(lastPrice);
        }
      } catch {}
      try {
        // Fetch market depth — try depth endpoint first, fall back to full quotes
        function parseDepthFromResponse(d: Record<string, unknown>) {
          const key = Object.keys(
            (d?.data as Record<string, unknown>) ?? {},
          )[0];
          const keyData =
            (d?.data as Record<string, Record<string, unknown>>)?.[key] ?? {};
          const rawDepth = (keyData?.depth ??
            keyData?.market_level ??
            keyData) as Record<string, unknown> | null;
          if (!rawDepth) return null;
          // Normalise each entry to {price, quantity, orders}
          function normalise(
            arr: unknown[],
          ): { price: number; quantity: number; orders?: number }[] {
            return arr
              .map((e) => {
                const entry = e as Record<string, unknown>;
                return {
                  price: Number(
                    entry?.price ?? entry?.bid_price ?? entry?.ask_price ?? 0,
                  ),
                  quantity: Number(
                    entry?.quantity ??
                      entry?.bid_quantity ??
                      entry?.ask_quantity ??
                      entry?.vol ??
                      0,
                  ),
                  orders:
                    entry?.orders != null ? Number(entry.orders) : undefined,
                };
              })
              .filter((e) => e.price > 0 || e.quantity > 0);
          }
          const bids = normalise(
            (rawDepth?.buy ?? rawDepth?.bid ?? []) as unknown[],
          ).slice(0, 5);
          const asks = normalise(
            (rawDepth?.sell ?? rawDepth?.ask ?? []) as unknown[],
          ).slice(0, 5);
          return { bids, asks };
        }

        let depthParsed: {
          bids: { price: number; quantity: number; orders?: number }[];
          asks: { price: number; quantity: number; orders?: number }[];
        } | null = null;

        // Primary: depth endpoint
        try {
          const depthRes = await fetch(
            `https://api.upstox.com/v2/market-quote/depth?instrument_key=${encoded}&mode=full`,
            { headers },
          );
          if (depthRes.ok) {
            const d = await depthRes.json();
            depthParsed = parseDepthFromResponse(d);
          }
        } catch {}

        // Fallback: full quotes endpoint (includes depth)
        if (
          !depthParsed ||
          (depthParsed.bids.length === 0 && depthParsed.asks.length === 0)
        ) {
          try {
            const quotesRes = await fetch(
              `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${encoded}&mode=full`,
              { headers },
            );
            if (quotesRes.ok) {
              const d = await quotesRes.json();
              depthParsed = parseDepthFromResponse(d);
            }
          } catch {}
        }

        if (depthParsed) {
          setDepth(depthParsed);
        }
      } catch {}
      setDepthLoading(false);
    }

    poll();
    const interval = setInterval(poll, 1000);
    return () => clearInterval(interval);
  }, [instrumentKey, token]);

  useEffect(() => {
    async function fetchData() {
      if (!token || !instrumentKey) return;
      setLoading(true);
      try {
        const encoded = encodeURIComponent(instrumentKey);
        const headers = {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        };
        const ohlcRes = await fetch(
          `https://api.upstox.com/v2/market-quote/ohlc?instrument_key=${encoded}&interval=1d`,
          { headers },
        );
        if (ohlcRes.ok) {
          const o = await ohlcRes.json();
          const key = Object.keys(o?.data ?? {})[0];
          const q = o?.data?.[key]?.ohlc;
          const pc =
            o?.data?.[key]?.prev_close_price ?? o?.data?.[key]?.previous_close;
          const lc =
            o?.data?.[key]?.lower_circuit_limit ??
            o?.data?.[key]?.lower_circuit;
          const uc =
            o?.data?.[key]?.upper_circuit_limit ??
            o?.data?.[key]?.upper_circuit;
          const vol =
            o?.data?.[key]?.volume ?? o?.data?.[key]?.total_traded_volume;
          const avgPx =
            o?.data?.[key]?.average_trade_price ??
            o?.data?.[key]?.avg_traded_price;
          if (q)
            setOhlc({
              open: q.open,
              prev_close: pc ?? 0,
              high: q.high,
              low: q.low,
              volume: vol,
              avg_price: avgPx,
              lower_circuit: lc,
              upper_circuit: uc,
            });
        }
      } catch {}
      setLoading(false);
    }
    fetchData();
  }, [instrumentKey, token]);

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-30 bg-black/40"
        onClick={onClose}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        aria-hidden="true"
      />
      {/* Panel */}
      <div
        data-ocid="ltp_panel.sheet"
        className="fixed right-0 top-0 h-full z-50 w-80 flex flex-col overflow-hidden shadow-2xl transition-transform duration-300"
        style={{
          background: "oklch(var(--card))",
          borderLeft: "1px solid oklch(var(--border))",
          transform: visible ? "translateX(0)" : "translateX(100%)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between p-4 border-b border-border shrink-0"
          style={{ background: "oklch(var(--background))" }}
        >
          <button
            data-ocid="ltp_panel.close_button"
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-secondary transition-colors mr-3 mt-0.5"
            aria-label="Close panel"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm text-foreground truncate">
              {symbolLabel}
            </div>
            <LiveLtpDisplay
              liveLtp={liveLtp}
              ohlc={ohlc}
              change={change}
              changePct={changePct}
              isPositive={isPositive}
            />
          </div>
        </div>

        {/* Buy / Sell buttons */}
        <div className="flex gap-2 p-3 border-b border-border shrink-0">
          <button
            data-ocid="ltp_panel.buy_button"
            type="button"
            onClick={() => {
              onBuy(instrumentKey, liveLtp, lotSize);
              onClose();
            }}
            className="flex-1 py-2.5 rounded font-bold text-sm text-white transition-opacity hover:opacity-90"
            style={{ background: "oklch(0.55 0.18 145)" }}
          >
            BUY
          </button>
          <button
            data-ocid="ltp_panel.sell_button"
            type="button"
            onClick={() => {
              onSell(instrumentKey, liveLtp, lotSize);
              onClose();
            }}
            className="flex-1 py-2.5 rounded font-bold text-sm text-white transition-opacity hover:opacity-90"
            style={{ background: "oklch(0.55 0.22 22)" }}
          >
            SELL
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Market Stats */}
          <div className="border-b border-border">
            <button
              type="button"
              onClick={() => setStatsOpen((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
            >
              <span>Market Stats</span>
              <span className="text-muted-foreground">
                {statsOpen ? "▲" : "▼"}
              </span>
            </button>
            {statsOpen && (
              <div className="px-4 pb-4 text-xs">
                {loading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="h-4 bg-secondary rounded animate-pulse"
                      />
                    ))}
                  </div>
                ) : ohlc ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-x-4">
                      <div>
                        <div className="text-muted-foreground text-[10px]">
                          Open
                        </div>
                        <div className="font-mono-data font-semibold text-foreground">
                          {ohlc.open.toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-[10px]">
                          Prev. Close
                        </div>
                        <div className="font-mono-data font-semibold text-foreground">
                          {ohlc.prev_close.toFixed(2)}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4">
                      <div>
                        <div className="text-muted-foreground text-[10px]">
                          Low
                        </div>
                        <div
                          className="font-mono-data font-semibold"
                          style={{ color: "oklch(0.62 0.22 22)" }}
                        >
                          {ohlc.low.toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-[10px]">
                          High
                        </div>
                        <div
                          className="font-mono-data font-semibold"
                          style={{ color: "oklch(0.64 0.2 145)" }}
                        >
                          {ohlc.high.toFixed(2)}
                        </div>
                      </div>
                    </div>
                    {(ohlc.lower_circuit != null ||
                      ohlc.upper_circuit != null) && (
                      <div>
                        <div className="text-muted-foreground text-[10px] mb-1">
                          Circuit (Lower–Upper)
                        </div>
                        <div
                          className="relative h-1.5 rounded-full overflow-hidden"
                          style={{ background: "oklch(var(--secondary))" }}
                        >
                          {ohlc.lower_circuit != null &&
                            ohlc.upper_circuit != null &&
                            ohlc.upper_circuit > ohlc.lower_circuit && (
                              <div
                                className="absolute top-0 h-full rounded-full"
                                style={{
                                  left: `${((ltp - ohlc.lower_circuit) / (ohlc.upper_circuit - ohlc.lower_circuit)) * 100}%`,
                                  width: "3px",
                                  background: "oklch(0.72 0.18 75)",
                                  transform: "translateX(-50%)",
                                }}
                              />
                            )}
                        </div>
                        <div className="flex justify-between font-mono-data text-[10px] text-muted-foreground mt-0.5">
                          <span>{ohlc.lower_circuit?.toFixed(2) ?? "—"}</span>
                          <span>{ohlc.upper_circuit?.toFixed(2) ?? "—"}</span>
                        </div>
                      </div>
                    )}
                    {ohlc.volume != null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground text-[10px]">
                          Volume
                        </span>
                        <span className="font-mono-data text-foreground">
                          {ohlc.volume.toLocaleString("en-IN")}
                        </span>
                      </div>
                    )}
                    {ohlc.avg_price != null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground text-[10px]">
                          Avg. traded price
                        </span>
                        <span className="font-mono-data text-foreground">
                          {ohlc.avg_price.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-muted-foreground text-[10px] py-2 text-center">
                    No data available
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Market Depth */}
          <div>
            <button
              type="button"
              onClick={() => setDepthOpen((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors"
            >
              <span>Market Depth</span>
              <span className="text-muted-foreground">
                {depthOpen ? "▲" : "▼"}
              </span>
            </button>
            {depthOpen && (
              <div className="px-3 pb-4">
                {depthLoading ? (
                  <div className="space-y-1.5">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className="h-5 bg-secondary rounded animate-pulse"
                      />
                    ))}
                  </div>
                ) : depth ? (
                  <>
                    <DepthRows depth={depth} />
                  </>
                ) : (
                  <DepthRows depth={{ bids: [], asks: [] }} />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

const OptionChainHeader = memo(function OptionChainHeader() {
  return (
    <thead className="sticky top-0 z-10">
      <tr style={{ background: "oklch(var(--card))" }}>
        <th
          colSpan={8}
          className="py-1.5 px-2 text-center text-[10px] font-bold tracking-wider border-b border-r border-border"
          style={{
            color: "oklch(0.64 0.2 145)",
            background: "oklch(0.64 0.2 145 / 0.08)",
          }}
        >
          CE
        </th>
        <th className="py-1.5 px-3 text-center text-[10px] text-muted-foreground font-bold border-b border-border">
          STRIKE
        </th>
        <th
          colSpan={8}
          className="py-1.5 px-2 text-center text-[10px] font-bold tracking-wider border-b border-l border-border"
          style={{
            color: "oklch(0.62 0.22 22)",
            background: "oklch(0.62 0.22 22 / 0.08)",
          }}
        >
          PE
        </th>
      </tr>
      <tr style={{ background: "oklch(var(--card))" }}>
        {["LTP", "OI", "VOL", "IV%", "Δ", "Γ", "Θ", "Vega"].map((h) => (
          <th
            key={h}
            className="py-1 px-2 text-right text-[10px] text-muted-foreground font-semibold border-b border-border"
          >
            {h}
          </th>
        ))}
        <th className="py-1 px-2 border-b border-border" />
        {["LTP", "OI", "VOL", "IV", "Vega", "Θ", "Γ", "Δ"].map((h) => (
          <th
            key={h}
            className="py-1 px-2 text-left text-[10px] text-muted-foreground font-semibold border-b border-border"
          >
            {h}
          </th>
        ))}
      </tr>
    </thead>
  );
});

function SignalMonitorPanel({
  signals,
  expanded,
  onToggleExpanded,
  onClear,
  chain,
}: {
  signals: GeneratedSignal[];
  expanded: boolean;
  onToggleExpanded: () => void;
  onClear: () => void;
  chain: OptionData[];
}) {
  const totalSignals = signals.length;
  const activeSignals = signals.filter((s) => s.status === "ACTIVE").length;
  const winSignals = signals.filter(
    (s) => s.status === "TARGET1_HIT" || s.status === "TARGET2_HIT",
  ).length;
  const slSignals = signals.filter((s) => s.status === "SL_HIT").length;
  const closedSignals = totalSignals - activeSignals;
  const winPct =
    closedSignals > 0 ? Math.round((winSignals / closedSignals) * 100) : 0;

  const today = new Date().toISOString().slice(0, 10);
  const todayCount = signals.filter((s) => s.date === today).length;

  const statusConfig = {
    ACTIVE: {
      label: "ACTIVE",
      cls: "bg-amber-900/50 text-amber-300 border-amber-700/40",
    },
    TARGET1_HIT: {
      label: "TGT1 ✓",
      cls: "bg-green-900/50 text-green-300 border-green-700/40",
    },
    TARGET2_HIT: {
      label: "TGT2 ✓✓",
      cls: "bg-emerald-900/50 text-emerald-300 border-emerald-700/40",
    },
    SL_HIT: {
      label: "SL HIT",
      cls: "bg-red-900/50 text-red-300 border-red-700/40",
    },
    EXPIRED: {
      label: "EXPIRED",
      cls: "bg-secondary text-muted-foreground border-border",
    },
  };

  return (
    <div
      className="border-b border-border"
      style={{ background: "oklch(0.09 0.010 250)" }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <div
          className={`w-2 h-2 rounded-full ${activeSignals > 0 ? "bg-green-400 animate-pulse" : "bg-muted-foreground/30"}`}
        />
        <p className="text-[10px] font-bold text-muted-foreground tracking-widest uppercase">
          Signal Monitor
        </p>
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-mono font-bold border border-primary/30">
          {todayCount}/3 today
        </span>
        <span className="text-[9px] text-muted-foreground/50 ml-auto">
          Win {winPct}% · {activeSignals} active
        </span>
        {signals.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-[9px] text-muted-foreground/40 hover:text-red-400 transition-colors px-1"
          >
            Clear
          </button>
        )}
        <button
          type="button"
          onClick={onToggleExpanded}
          className="p-0.5 rounded hover:bg-secondary/60 transition-colors text-muted-foreground hover:text-foreground"
        >
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${expanded ? "" : "rotate-90"}`}
          />
        </button>
      </div>

      {expanded && (
        <div className="px-3 pb-3">
          {/* Performance summary */}
          {totalSignals > 0 && (
            <div className="grid grid-cols-4 gap-2 mb-3">
              {[
                { label: "Total", value: totalSignals, cls: "text-foreground" },
                {
                  label: "Win %",
                  value: `${winPct}%`,
                  cls:
                    winPct >= 60
                      ? "text-green-400"
                      : winPct >= 40
                        ? "text-amber-400"
                        : "text-red-400",
                },
                {
                  label: "Active",
                  value: activeSignals,
                  cls: "text-amber-300",
                },
                {
                  label: "SL Hit",
                  value: slSignals,
                  cls: slSignals > 0 ? "text-red-400" : "text-muted-foreground",
                },
              ].map(({ label, value, cls }) => (
                <div
                  key={label}
                  className="bg-secondary/30 rounded p-2 text-center border border-border/50"
                >
                  <p className="text-[8px] text-muted-foreground uppercase tracking-wider">
                    {label}
                  </p>
                  <p className={`font-mono text-sm font-bold ${cls}`}>
                    {value}
                  </p>
                </div>
              ))}
            </div>
          )}

          {signals.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-[11px] text-muted-foreground/50">
                No signals generated yet.
              </p>
              <p className="text-[10px] text-muted-foreground/30 mt-1">
                Waiting for HIGH confidence confluence (6+/8 signals).
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
              {signals.map((sig) => {
                const cfg = statusConfig[sig.status];
                const isCall = sig.action === "BUY CALL";
                const actionCls = isCall
                  ? "bg-green-950/50 border-green-800/40 text-green-300"
                  : "bg-red-950/50 border-red-800/40 text-red-300";
                const row = chain.find((r) => r.strike_price === sig.strike);
                const currentLtp = isCall
                  ? (row?.call_options?.market_data?.ltp ?? 0)
                  : (row?.put_options?.market_data?.ltp ?? 0);
                const pnl =
                  currentLtp > 0
                    ? ((currentLtp - sig.entryPrice) / sig.entryPrice) * 100
                    : null;

                return (
                  <div
                    key={sig.id}
                    className={`rounded-lg border p-2.5 ${
                      sig.status === "ACTIVE"
                        ? "border-amber-800/40 bg-amber-950/10"
                        : sig.status === "SL_HIT"
                          ? "border-red-900/30 bg-red-950/10 opacity-70"
                          : sig.status === "EXPIRED"
                            ? "border-border/30 opacity-50"
                            : "border-green-900/30 bg-green-950/10"
                    }`}
                  >
                    {/* Row 1: action + instrument + status */}
                    <div className="flex items-center gap-2 mb-1.5">
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded border ${actionCls}`}
                      >
                        {isCall ? "▲" : "▼"} {sig.action}
                      </span>
                      <span className="text-[11px] font-bold text-foreground font-mono">
                        {sig.instrument} {sig.strike.toLocaleString("en-IN")}
                      </span>
                      <span className="text-[9px] text-muted-foreground">
                        {sig.expiry}
                      </span>
                      <span
                        className={`ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded border ${cfg.cls}`}
                      >
                        {cfg.label}
                      </span>
                    </div>

                    {/* Row 2: trade card */}
                    <div className="grid grid-cols-4 gap-1 mb-1.5">
                      {[
                        {
                          label: "Entry",
                          value: `₹${sig.entryPrice.toFixed(2)}`,
                          cls: "text-blue-300",
                        },
                        {
                          label: "SL",
                          value: `₹${sig.sl.toFixed(2)}`,
                          cls: "text-red-400",
                        },
                        {
                          label: "TGT1",
                          value: `₹${sig.tgt1.toFixed(2)}`,
                          cls: "text-green-400",
                        },
                        {
                          label: "TGT2",
                          value: `₹${sig.tgt2.toFixed(2)}`,
                          cls: "text-emerald-300",
                        },
                      ].map(({ label, value, cls }) => (
                        <div
                          key={label}
                          className="bg-secondary/20 rounded px-1.5 py-1 text-center border border-border/30"
                        >
                          <p className="text-[7px] text-muted-foreground uppercase tracking-wider">
                            {label}
                          </p>
                          <p
                            className={`font-mono text-[10px] font-bold ${cls}`}
                          >
                            {value}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Row 3: live LTP + P&L + timestamp */}
                    <div className="flex items-center gap-3">
                      {currentLtp > 0 && (
                        <span className="text-[9px] text-muted-foreground">
                          Live:{" "}
                          <span className="font-mono text-foreground font-bold">
                            ₹{currentLtp.toFixed(2)}
                          </span>
                        </span>
                      )}
                      {pnl !== null && sig.status === "ACTIVE" && (
                        <span
                          className={`text-[9px] font-mono font-bold ${pnl >= 0 ? "text-green-400" : "text-red-400"}`}
                        >
                          {pnl >= 0 ? "+" : ""}
                          {pnl.toFixed(1)}%
                        </span>
                      )}
                      <span className="text-[8px] text-muted-foreground/40 ml-auto">
                        {new Date(sig.timestamp).toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {" · "}
                        {new Date(sig.timestamp).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OptionChainTab({
  token,
  indexTicks,
  initialUnderlying,
  tradeSettings,
  onBuyStrike,
  onUnderlyingChange,
}: {
  token: string;
  indexTicks: Record<string, TickData>;
  initialUnderlying?: string;
  tradeSettings?: TradeSettings;
  onBuyStrike?: (
    instrumentKey: string,
    ltp: number,
    txType: "BUY" | "SELL",
    lotSize: number,
  ) => void;
  onUnderlyingChange?: (underlying: string) => void;
}) {
  const [underlying, setUnderlying] = useState<string>(
    initialUnderlying ?? "NSE_INDEX|Nifty 50",
  );
  const [expiryDates, setExpiryDates] = useState<string[]>([]);
  const [expiry, setExpiry] = useState("");
  const [loadingExpiry, setLoadingExpiry] = useState(false);
  const [chain, setChain] = useState<OptionData[]>([]);
  const [loading, setLoading] = useState(false);
  const selectedExpiryRef = useRef<HTMLButtonElement>(null);

  // ── Signal Monitor state ───────────────────────────────────────────────────
  const SIGNALS_KEY = "upstox_signals_v1";

  const loadSignals = (): GeneratedSignal[] => {
    try {
      return JSON.parse(localStorage.getItem(SIGNALS_KEY) ?? "[]");
    } catch {
      return [];
    }
  };

  const [signals, setSignals] = useState<GeneratedSignal[]>(loadSignals);
  const [signalMonitorExpanded, setSignalMonitorExpanded] = useState(true);
  const pendingSignalRef = useRef<{
    key: string;
    count: number;
    data: Omit<GeneratedSignal, "id" | "timestamp" | "date" | "status">;
  } | null>(null);

  useEffect(() => {
    if (initialUnderlying) setUnderlying(initialUnderlying);
  }, [initialUnderlying]);

  // Auto-scroll selected expiry into view
  // biome-ignore lint/correctness/useExhaustiveDependencies: ref scroll triggered by expiry change
  useEffect(() => {
    selectedExpiryRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [expiry]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: loadSignals is stable
  const recordSignal = useCallback(
    (
      raw: Omit<GeneratedSignal, "id" | "timestamp" | "date" | "status"> & {
        instrument?: string;
      },
    ) => {
      const today = new Date().toISOString().slice(0, 10);
      const existing = loadSignals();
      const todayCount = existing.filter((s) => s.date === today).length;
      if (todayCount >= 3) return;
      const newSignal: GeneratedSignal = {
        ...raw,
        instrument: raw.instrument ?? underlying,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
        date: today,
        status: "ACTIVE",
      };
      const updated = [newSignal, ...existing].slice(0, 30);
      localStorage.setItem("upstox_signals_v1", JSON.stringify(updated));
      setSignals(updated);
    },
    [underlying],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: loadSignals is stable
  const handleSignalReady = useCallback(
    (raw: Omit<GeneratedSignal, "id" | "timestamp" | "date" | "status">) => {
      const key = `${raw.action}-${raw.strike}-${raw.expiry}`;
      if (pendingSignalRef.current?.key === key) {
        pendingSignalRef.current.count++;
        if (pendingSignalRef.current.count >= 3) {
          const existing = loadSignals();
          const recentDuplicate = existing.find(
            (s) =>
              s.strike === raw.strike &&
              s.action === raw.action &&
              s.expiry === raw.expiry &&
              Date.now() - s.timestamp < 60 * 60 * 1000,
          );
          if (!recentDuplicate) {
            recordSignal(raw);
          }
          pendingSignalRef.current = null;
        }
      } else {
        pendingSignalRef.current = { key, count: 1, data: raw };
      }
    },
    [recordSignal],
  );

  useEffect(() => {
    if (signals.length === 0 || chain.length === 0) return;
    const now = Date.now();
    let changed = false;
    const updated = signals.map((sig) => {
      if (sig.status !== "ACTIVE") return sig;
      const expiryTs = new Date(sig.expiry).getTime();
      if (now > expiryTs + 24 * 60 * 60 * 1000) {
        changed = true;
        return { ...sig, status: "EXPIRED" as const };
      }
      const row = chain.find((r) => r.strike_price === sig.strike);
      if (!row) return sig;
      const currentLtp =
        sig.action === "BUY CALL"
          ? (row.call_options?.market_data?.ltp ?? 0)
          : (row.put_options?.market_data?.ltp ?? 0);
      if (currentLtp <= 0) return sig;
      if (currentLtp >= sig.tgt2) {
        changed = true;
        return { ...sig, status: "TARGET2_HIT" as const };
      }
      if (currentLtp >= sig.tgt1) {
        changed = true;
        return { ...sig, status: "TARGET1_HIT" as const };
      }
      if (currentLtp <= sig.sl) {
        changed = true;
        return { ...sig, status: "SL_HIT" as const };
      }
      return sig;
    });
    if (changed) {
      localStorage.setItem("upstox_signals_v1", JSON.stringify(updated));
      setSignals(updated);
    }
  }, [chain, signals]);

  const fetchExpiryDates = useCallback(
    async (underlyingKey: string) => {
      setLoadingExpiry(true);
      setExpiryDates([]);
      setExpiry("");
      const res = await upstoxFetch<any>(
        `/v2/option/contract?instrument_key=${encodeURIComponent(underlyingKey)}`,
        token,
      );
      if (res.data) {
        const data = Array.isArray(res.data) ? res.data : [];
        const dates: string[] = [];
        for (const item of data) {
          const d =
            typeof item === "string"
              ? item
              : (item.expiry_date ?? item.expiry ?? "");
          if (d && !dates.includes(d)) dates.push(d);
        }
        dates.sort();
        setExpiryDates(dates);
        if (dates.length > 0) setExpiry(dates[0]);
      } else {
        toast.error(`Expiry dates: ${res.error}`);
      }
      setLoadingExpiry(false);
    },
    [token],
  );

  useEffect(() => {
    fetchExpiryDates(underlying);
  }, [underlying, fetchExpiryDates]);

  const fetchChain = async () => {
    if (!expiry) {
      toast.error("Select expiry date");
      return;
    }
    setLoading(true);
    const res = await upstoxFetch<OptionData[]>(
      `/v2/option/chain?instrument_key=${encodeURIComponent(underlying)}&expiry_date=${expiry}`,
      token,
    );
    if (res.data) {
      const arr = Array.isArray(res.data) ? res.data : [];
      setChain(
        arr.sort((a, b) => (a.strike_price ?? 0) - (b.strike_price ?? 0)),
      );
    } else {
      toast.error(`Option chain: ${res.error}`);
    }
    setLoading(false);
  };

  // Auto-fetch chain when expiry changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: fetchChain is stable, intentional
  useEffect(() => {
    if (expiry) {
      fetchChain();
    }
  }, [expiry]);

  // Auto-refresh option chain LTP every 1 second
  // biome-ignore lint/correctness/useExhaustiveDependencies: fetchChain is stable, intentional
  useEffect(() => {
    if (!expiry) return;
    const id = setInterval(() => {
      fetchChain();
    }, 1000);
    return () => clearInterval(id);
  }, [expiry]);

  const underlyingLtp = indexTicks[underlying]?.ltp ?? 0;
  const atm = chain.reduce<OptionData | null>((best, row) => {
    if (!best) return row;
    return Math.abs(row.strike_price - underlyingLtp) <
      Math.abs(best.strike_price - underlyingLtp)
      ? row
      : best;
  }, null);

  const localAtmIdx = atm
    ? chain.findIndex((r) => r.strike_price === atm.strike_price)
    : -1;
  const [showAllStrikes, setShowAllStrikes] = useState(false);
  const [aiPanelExpanded, setAiPanelExpanded] = useState(true);
  const [chainPanelExpanded, setChainPanelExpanded] = useState(true);
  const [greeksData, setGreeksData] = useState<
    Record<
      string,
      {
        delta?: number;
        gamma?: number;
        theta?: number;
        vega?: number;
        iv?: number;
      }
    >
  >({});
  const [sidePanel, setSidePanel] = useState<{
    instrumentKey: string;
    ltp: number;
    side: "CE" | "PE";
    strikePrice: number;
    lotSize: number;
  } | null>(null);
  const displayChain = showAllStrikes
    ? chain
    : (() => {
        if (localAtmIdx < 0) return chain;
        const start = Math.max(0, localAtmIdx - 10);
        const end = Math.min(chain.length, localAtmIdx + 11);
        return chain.slice(start, end);
      })();

  // Ref callback: scrolls ATM row into view whenever it is mounted/updated
  const atmRowRef = useCallback((node: HTMLTableRowElement | null) => {
    if (node) node.scrollIntoView({ block: "center", behavior: "smooth" });
  }, []);

  // Calculate Greeks locally using Black-Scholes every second
  // biome-ignore lint/correctness/useExhaustiveDependencies: interval recalculates on data change
  useEffect(() => {
    if (!expiry || displayChain.length === 0 || underlyingLtp <= 0) return;

    const calcAllGreeks = () => {
      const today = new Date();
      const expiryDate = new Date(expiry);
      const T = Math.max(
        (expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 365),
        0.001,
      );
      const r = 0.065;
      const S = underlyingLtp;

      const newGreeks: Record<
        string,
        {
          delta?: number;
          gamma?: number;
          theta?: number;
          vega?: number;
          iv?: number;
        }
      > = {};

      for (const row of displayChain) {
        if (row.call_options?.instrument_key) {
          const K = row.strike_price;
          const ltp = row.call_options.market_data?.ltp ?? 0;
          const iv = ltp > 0 ? impliedVolatility(ltp, S, K, T, r, "CE") : 0.2;
          const greeks = blackScholes(S, K, T, r, iv, "CE");
          newGreeks[row.call_options.instrument_key] = {
            delta: greeks.delta,
            gamma: greeks.gamma,
            theta: greeks.theta,
            vega: greeks.vega,
            iv: iv * 100,
          };
        }
        if (row.put_options?.instrument_key) {
          const K = row.strike_price;
          const ltp = row.put_options.market_data?.ltp ?? 0;
          const iv = ltp > 0 ? impliedVolatility(ltp, S, K, T, r, "PE") : 0.2;
          const greeks = blackScholes(S, K, T, r, iv, "PE");
          newGreeks[row.put_options.instrument_key] = {
            delta: greeks.delta,
            gamma: greeks.gamma,
            theta: greeks.theta,
            vega: greeks.vega,
            iv: iv * 100,
          };
        }
      }
      setGreeksData(newGreeks);
    };

    calcAllGreeks();
    const id = setInterval(calcAllGreeks, 1000);
    return () => clearInterval(id);
  }, [expiry, displayChain, underlyingLtp]);

  return (
    <div className="flex flex-col h-full">
      {/* Trend Analysis Panel */}
      <TrendAnalysisPanel
        chain={chain}
        underlyingLtp={underlyingLtp}
        expiries={expiryDates}
        selectedExpiry={expiry}
        tradeSettings={tradeSettings}
        greeksData={greeksData}
        expanded={aiPanelExpanded}
        onToggleExpanded={() => setAiPanelExpanded((v) => !v)}
        onSignalReady={handleSignalReady}
      />
      {/* Signal Monitor Panel */}
      <SignalMonitorPanel
        signals={signals}
        expanded={signalMonitorExpanded}
        onToggleExpanded={() => setSignalMonitorExpanded((v) => !v)}
        onClear={() => {
          localStorage.removeItem("upstox_signals_v1");
          setSignals([]);
        }}
        chain={chain}
      />
      {/* Option Chain Header with toggle */}
      <div
        className="flex items-center justify-between px-3 py-1.5 border-b border-border"
        style={{ background: "oklch(var(--card))" }}
      >
        <div className="flex items-center gap-2">
          <LineChart className="w-3.5 h-3.5 text-primary" />
          <span className="text-[10px] font-bold text-muted-foreground tracking-widest uppercase">
            Option Chain
          </span>
        </div>
        <button
          type="button"
          data-ocid="options.chain_panel.toggle"
          className="p-0.5 rounded hover:bg-secondary/60 transition-colors text-muted-foreground hover:text-foreground"
          onClick={() => setChainPanelExpanded((v) => !v)}
          aria-label={
            chainPanelExpanded ? "Minimize chain panel" : "Expand chain panel"
          }
        >
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200${chainPanelExpanded ? "" : " -rotate-90"}`}
          />
        </button>
      </div>
      {chainPanelExpanded && (
        <>
          {/* Controls */}
          <div
            className="p-3 border-b border-border space-y-2"
            style={{ background: "oklch(var(--card))" }}
          >
            {/* Underlying tabs */}
            <div className="flex gap-1">
              {OPTION_UNDERLYINGS.map((u) => (
                <button
                  key={u.key}
                  data-ocid={`options.expiry_tab.${OPTION_UNDERLYINGS.findIndex((x) => x.key === u.key) + 1}`}
                  type="button"
                  onClick={() => {
                    setUnderlying(u.key);
                    onUnderlyingChange?.(u.key);
                  }}
                  className={`px-3 py-1.5 rounded text-xs font-bold border transition-colors ${
                    underlying === u.key
                      ? "bg-primary/20 text-primary border-primary/50"
                      : "bg-secondary text-muted-foreground border-border hover:text-foreground"
                  }`}
                >
                  {u.label}
                  {indexTicks[u.key]?.ltp ? (
                    <span className="ml-1 font-mono-data opacity-70">
                      {indexTicks[u.key].ltp.toFixed(0)}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>

            {/* Expiry tabs — horizontally scrollable */}
            <div
              className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none"
              data-ocid="options.expiry_tabs"
            >
              {loadingExpiry ? (
                <span className="text-[10px] text-muted-foreground px-2 py-1">
                  Loading expiries...
                </span>
              ) : (
                expiryDates.map((d, i) => (
                  <button
                    key={d}
                    type="button"
                    ref={expiry === d ? selectedExpiryRef : undefined}
                    data-ocid={`options.expiry_tab.${i + 1}`}
                    onClick={() => setExpiry(d)}
                    className={`shrink-0 px-3 py-1 rounded-full text-[10px] font-mono font-bold border transition-colors whitespace-nowrap ${
                      expiry === d
                        ? "bg-primary/20 text-primary border-primary/50"
                        : "bg-secondary text-muted-foreground border-border hover:text-foreground"
                    }`}
                  >
                    {d}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Chain Table */}
          {loading ? (
            <div className="p-4 space-y-1.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="h-8 rounded bg-secondary animate-pulse"
                />
              ))}
            </div>
          ) : chain.length === 0 ? (
            <div className="py-12 text-center">
              <LineChart className="w-7 h-7 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">
                {expiry
                  ? "Loading option chain..."
                  : "Select an index to load option chain"}
              </p>
            </div>
          ) : (
            <div className="overflow-auto flex-1" data-ocid="options.table">
              <table className="w-full text-xs border-collapse min-w-[560px]">
                <OptionChainHeader />
                <tbody>
                  {displayChain.map((row) => {
                    const isAtm = atm?.strike_price === row.strike_price;
                    const ce = row.call_options?.market_data ?? {};
                    const pe = row.put_options?.market_data ?? {};
                    const ceIk = row.call_options?.instrument_key;
                    const peIk = row.put_options?.instrument_key;
                    return (
                      <tr
                        key={row.strike_price}
                        ref={isAtm ? atmRowRef : undefined}
                        className={`border-b border-border/50 transition-colors ${
                          isAtm ? "" : "hover:bg-secondary/40"
                        }`}
                        style={
                          isAtm
                            ? {
                                background: "oklch(0.72 0.18 75 / 0.1)",
                                borderColor: "oklch(0.72 0.18 75 / 0.3)",
                              }
                            : {}
                        }
                      >
                        {/* biome-ignore lint/a11y/useKeyWithClickEvents: trading table cell */}
                        <td
                          className="py-1.5 px-2 text-right font-mono-data text-foreground cursor-pointer hover:text-primary transition-colors"
                          onClick={() =>
                            ceIk &&
                            (ce.ltp ?? 0) > 0 &&
                            setSidePanel({
                              instrumentKey: ceIk,
                              ltp: ce.ltp ?? 0,
                              side: "CE",
                              strikePrice: row.strike_price,
                              lotSize: row.lot_size ?? getLotSize(underlying),
                            })
                          }
                        >
                          {(ce.ltp ?? 0) > 0 ? (ce.ltp ?? 0).toFixed(2) : "—"}
                        </td>
                        <td
                          className="py-1.5 px-2 text-right font-mono-data"
                          style={{ color: "oklch(0.64 0.2 145 / 0.7)" }}
                        >
                          {ce.oi ? `${(ce.oi / 1000).toFixed(1)}K` : "—"}
                        </td>
                        <td
                          className="py-1.5 px-2 text-right font-mono-data"
                          style={{ color: "oklch(0.64 0.2 145 / 0.7)" }}
                        >
                          {ce.volume
                            ? `${(ce.volume / 1000).toFixed(1)}K`
                            : "—"}
                        </td>
                        <td
                          className="py-1.5 px-2 text-right font-mono-data border-r border-border"
                          style={{ color: "oklch(0.64 0.2 145 / 0.5)" }}
                        >
                          {ceIk && greeksData[ceIk]?.iv != null
                            ? greeksData[ceIk]!.iv!.toFixed(1)
                            : "—"}
                        </td>
                        {(["delta", "gamma", "theta", "vega"] as const).map(
                          (k) => (
                            <td
                              key={`ce-${k}`}
                              className="py-1.5 px-1 text-right font-mono-data text-[9px]"
                              style={{ color: "oklch(0.64 0.2 145 / 0.5)" }}
                            >
                              {ceIk && greeksData[ceIk]?.[k] != null
                                ? (greeksData[ceIk][k] as number).toFixed(4)
                                : "—"}
                            </td>
                          ),
                        )}
                        <td
                          className={`py-1.5 px-3 text-center font-mono-data font-bold text-xs ${
                            isAtm ? "text-atm" : "text-muted-foreground"
                          }`}
                        >
                          {isAtm && (
                            <span className="mr-1 text-atm text-[9px]">▶</span>
                          )}
                          {row.strike_price.toLocaleString("en-IN")}
                        </td>
                        {/* biome-ignore lint/a11y/useKeyWithClickEvents: trading table cell */}
                        <td
                          className="py-1.5 px-2 text-left font-mono-data text-foreground border-l border-border cursor-pointer hover:text-primary transition-colors"
                          onClick={() =>
                            peIk &&
                            (pe.ltp ?? 0) > 0 &&
                            setSidePanel({
                              instrumentKey: peIk,
                              ltp: pe.ltp ?? 0,
                              side: "PE",
                              strikePrice: row.strike_price,
                              lotSize: row.lot_size ?? getLotSize(underlying),
                            })
                          }
                        >
                          {(pe.ltp ?? 0) > 0 ? (pe.ltp ?? 0).toFixed(2) : "—"}
                        </td>
                        <td
                          className="py-1.5 px-2 text-left font-mono-data"
                          style={{ color: "oklch(0.62 0.22 22 / 0.7)" }}
                        >
                          {pe.oi ? `${(pe.oi / 1000).toFixed(1)}K` : "—"}
                        </td>
                        <td
                          className="py-1.5 px-2 text-left font-mono-data"
                          style={{ color: "oklch(0.62 0.22 22 / 0.7)" }}
                        >
                          {pe.volume
                            ? `${(pe.volume / 1000).toFixed(1)}K`
                            : "—"}
                        </td>
                        <td
                          className="py-1.5 px-2 text-left font-mono-data"
                          style={{ color: "oklch(0.62 0.22 22 / 0.5)" }}
                        >
                          {peIk && greeksData[peIk]?.iv != null
                            ? greeksData[peIk]!.iv!.toFixed(1)
                            : "—"}
                        </td>
                        {(["vega", "theta", "gamma", "delta"] as const).map(
                          (k) => (
                            <td
                              key={`pe-${k}`}
                              className="py-1.5 px-1 text-left font-mono-data text-[9px]"
                              style={{ color: "oklch(0.62 0.22 22 / 0.5)" }}
                            >
                              {peIk && greeksData[peIk]?.[k] != null
                                ? (greeksData[peIk][k] as number).toFixed(4)
                                : "—"}
                            </td>
                          ),
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="flex justify-center py-2 border-t border-border/50">
                <button
                  data-ocid="option_chain.show_all_toggle"
                  type="button"
                  onClick={() => setShowAllStrikes((v) => !v)}
                  className="text-xs text-muted-foreground underline hover:text-foreground transition-colors"
                >
                  {showAllStrikes
                    ? "Show ±10 strikes"
                    : `Show all ${chain.length} strikes`}
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {sidePanel && (
        <LtpSidePanel
          instrumentKey={sidePanel.instrumentKey}
          ltp={sidePanel.ltp}
          side={sidePanel.side}
          strikePrice={sidePanel.strikePrice}
          token={token}
          onClose={() => setSidePanel(null)}
          lotSize={sidePanel.lotSize}
          onBuy={(ik, ltpVal, ls) => {
            onBuyStrike?.(ik, ltpVal, "BUY", ls);
            setSidePanel(null);
          }}
          onSell={(ik, ltpVal, ls) => {
            onBuyStrike?.(ik, ltpVal, "SELL", ls);
            setSidePanel(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Live WebSocket Tab ────────────────────────────────────────────────────────
function LiveTab({ token }: { token: string }) {
  const [instruments, setInstruments] = useState<string[]>([]);
  const [inputKey, setInputKey] = useState("");
  const [wsStatus, setWsStatus] = useState<WsStatus>("disconnected");
  const [ticks, setTicks] = useState<Record<string, TickData>>({});
  const [tickCount, setTickCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);

  const processTick = useCallback((raw: any) => {
    if (!raw?.feeds) return;
    setTicks((prev) => {
      const next = { ...prev };
      for (const [key, feed] of Object.entries<any>(raw.feeds)) {
        const ff =
          (feed as any)?.ff?.marketFF ?? (feed as any)?.ff?.indexFF ?? {};
        const ltpData = ff.ltpc ?? {};
        const md = ff.marketDeptFF?.bid ?? [];
        const ask = ff.marketDeptFF?.ask ?? [];
        next[key] = {
          key,
          ltp: ltpData.ltp ?? next[key]?.ltp ?? 0,
          bid: md[0]?.price ?? 0,
          ask: ask[0]?.price ?? 0,
          volume: ff.ltpc?.toi ?? next[key]?.volume ?? 0,
          change: ltpData.cp ?? next[key]?.change ?? 0,
          ts: Date.now(),
        };
      }
      return next;
    });
    setTickCount((prev) => prev + 1);
  }, []);

  const connect = useCallback(() => {
    if (!token) return;
    if (wsRef.current) wsRef.current.close();
    setWsStatus("connecting");
    setTickCount(0);
    const ws = new WebSocket(
      `wss://api.upstox.com/v2/feed/market-data-feed?token=${encodeURIComponent(token)}`,
    );
    ws.onopen = () => {
      setWsStatus("connected");
      if (instruments.length > 0) {
        ws.send(
          JSON.stringify({
            guid: "live-tab",
            method: "sub",
            data: { instrumentKeys: instruments, mode: "full" },
          }),
        );
      }
    };
    ws.onmessage = (event) => {
      if (event.data instanceof Blob) {
        event.data.text().then((text) => {
          try {
            processTick(JSON.parse(text));
          } catch {}
        });
        return;
      }
      try {
        processTick(JSON.parse(event.data));
      } catch {}
    };
    ws.onerror = () => setWsStatus("error");
    ws.onclose = () => setWsStatus("disconnected");
    wsRef.current = ws;
  }, [token, instruments, processTick]);

  const disconnect = () => {
    wsRef.current?.close();
    wsRef.current = null;
    setWsStatus("disconnected");
  };

  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  const addInstrument = () => {
    const key = inputKey.trim();
    if (!key || instruments.includes(key)) return;
    const next = [...instruments, key];
    setInstruments(next);
    setInputKey("");
    if (wsRef.current && wsStatus === "connected") {
      wsRef.current.send(
        JSON.stringify({
          guid: "live-tab",
          method: "sub",
          data: { instrumentKeys: [key], mode: "full" },
        }),
      );
    }
  };

  const removeInstrument = (k: string) => {
    setInstruments((prev) => prev.filter((x) => x !== k));
    setTicks((prev) => {
      const n = { ...prev };
      delete n[k];
      return n;
    });
  };

  const tickEntries = Object.values(ticks).filter((t) =>
    instruments.includes(t.key),
  );

  return (
    <div className="p-4 space-y-4">
      {/* Connection controls */}
      <div className="flex items-center justify-between p-3 rounded border border-border bg-secondary/40">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              wsStatus === "connected"
                ? "bg-green-500 animate-pulse-dot"
                : wsStatus === "connecting"
                  ? "bg-yellow-400 animate-pulse"
                  : wsStatus === "error"
                    ? "bg-red-500"
                    : "bg-muted-foreground"
            }`}
          />
          <span className="text-xs font-mono font-bold text-foreground capitalize">
            {wsStatus}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground">
          <span>
            <span className="text-foreground font-bold">
              {instruments.length}
            </span>{" "}
            subscriptions
          </span>
          <span>
            <span className="text-foreground font-bold">{tickCount}</span> ticks
          </span>
        </div>
        <button
          data-ocid="live.connect_button"
          type="button"
          onClick={
            wsStatus === "connected" || wsStatus === "connecting"
              ? disconnect
              : connect
          }
          className={`px-3 py-1.5 rounded text-xs font-bold border transition-colors ${
            wsStatus === "connected"
              ? "bg-red-950 text-loss border-red-800/40 hover:bg-red-900"
              : "bg-blue-950 text-blue-400 border-blue-800/40 hover:bg-blue-900"
          }`}
        >
          {wsStatus === "connected"
            ? "Disconnect"
            : wsStatus === "connecting"
              ? "Connecting…"
              : "Connect"}
        </button>
      </div>

      {/* Add instrument */}
      <div className="flex gap-2">
        <Input
          data-ocid="live.add_input"
          placeholder="NSE_EQ|INE848E01016"
          value={inputKey}
          onChange={(e) => setInputKey(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addInstrument()}
          className="h-8 bg-secondary border-border font-mono text-xs flex-1"
        />
        <button
          type="button"
          onClick={addInstrument}
          className="h-8 w-8 flex items-center justify-center rounded border border-border bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Subscribed chips */}
      {instruments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {instruments.map((inst) => (
            <div
              key={inst}
              className="flex items-center gap-1 px-2 py-1 rounded-full bg-secondary border border-border text-[10px] font-mono"
            >
              <span className="text-foreground">{inst}</span>
              <button
                type="button"
                onClick={() => removeInstrument(inst)}
                className="text-muted-foreground hover:text-destructive ml-0.5"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Live table */}
      {tickEntries.length > 0 ? (
        <div className="overflow-x-auto" data-ocid="live.table">
          <table className="w-full text-xs border-collapse min-w-[400px]">
            <thead>
              <tr
                className="border-b border-border"
                style={{ background: "oklch(var(--card))" }}
              >
                <th className="py-1.5 px-3 text-left text-[10px] text-muted-foreground font-semibold tracking-wider">
                  INSTRUMENT
                </th>
                <th className="py-1.5 px-3 text-right text-[10px] text-muted-foreground font-semibold tracking-wider">
                  LTP
                </th>
                <th className="py-1.5 px-3 text-right text-[10px] text-muted-foreground font-semibold tracking-wider">
                  BID
                </th>
                <th className="py-1.5 px-3 text-right text-[10px] text-muted-foreground font-semibold tracking-wider">
                  ASK
                </th>
                <th className="py-1.5 px-3 text-right text-[10px] text-muted-foreground font-semibold tracking-wider">
                  CHG%
                </th>
              </tr>
            </thead>
            <tbody>
              {tickEntries.map((tick, i) => (
                <tr
                  key={tick.key}
                  data-ocid={`live.item.${i + 1}`}
                  className="border-b border-border/50 hover:bg-secondary/40 transition-colors"
                >
                  <td className="py-2 px-3 font-mono text-[10px] text-muted-foreground">
                    {tick.key}
                  </td>
                  <td className="py-2 px-3 text-right font-mono-data font-bold text-foreground">
                    ₹{tick.ltp.toFixed(2)}
                  </td>
                  <td className="py-2 px-3 text-right font-mono-data text-gain">
                    {tick.bid > 0 ? tick.bid.toFixed(2) : "—"}
                  </td>
                  <td className="py-2 px-3 text-right font-mono-data text-loss">
                    {tick.ask > 0 ? tick.ask.toFixed(2) : "—"}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <PnlPct value={tick.change} className="text-xs" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : wsStatus === "connected" ? (
        <div className="py-8 text-center">
          <Activity className="w-6 h-6 text-primary mx-auto mb-2 animate-pulse" />
          <p className="text-xs text-muted-foreground">
            Add instruments and waiting for data…
          </p>
        </div>
      ) : null}
    </div>
  );
}

// ─── Overview Tab ──────────────────────────────────────────────────────────────
function OverviewTab({
  profile,
  token,
  loading,
  indexTicks,
  onTabChange,
}: {
  profile: Profile | null;
  token: string;
  loading: boolean;
  indexTicks?: Record<string, TickData>;
  onTabChange?: (tab: TabValue) => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyToken = () => {
    navigator.clipboard.writeText(token).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const isMarketOpen = () => {
    const now = new Date();
    const day = now.getDay(); // 0=Sun, 6=Sat
    if (day === 0 || day === 6) return false;
    // Convert to IST (UTC+5:30)
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const ist = new Date(utc + 5.5 * 3600000);
    const h = ist.getHours();
    const m = ist.getMinutes();
    const mins = h * 60 + m;
    return mins >= 9 * 60 + 15 && mins < 15 * 60 + 30;
  };

  const marketOpen = isMarketOpen();

  const INDEX_MAP: Array<{ label: string; key: string }> = [
    { label: "NIFTY", key: "NSE_INDEX|Nifty 50" },
    { label: "BANKNIFTY", key: "NSE_INDEX|Nifty Bank" },
    { label: "SENSEX", key: "BSE_INDEX|SENSEX" },
  ];

  return (
    <div className="p-4 space-y-4">
      {/* Market Status Banner */}
      <div
        className={`flex items-center justify-between px-4 py-2.5 rounded border ${
          marketOpen
            ? "border-green-800/40 bg-green-950/30"
            : "border-border bg-secondary/30"
        }`}
      >
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full inline-block ${marketOpen ? "bg-green-400 animate-pulse" : "bg-muted-foreground"}`}
          />
          <span className="text-xs font-semibold text-foreground">
            Market {marketOpen ? "Open" : "Closed"}
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {marketOpen ? "Closes 3:30 PM IST" : "Opens 9:15 AM IST"}
        </span>
      </div>

      {/* Portfolio Summary */}
      <div className="rounded border border-border overflow-hidden">
        <div
          className="px-4 py-2.5 border-b border-border"
          style={{ background: "oklch(var(--card))" }}
        >
          <p className="text-[10px] font-bold text-muted-foreground tracking-widest uppercase">
            Portfolio Summary
          </p>
        </div>
        <div className="grid grid-cols-3 divide-x divide-border">
          {[
            { label: "Total Value", value: "—", color: "text-foreground" },
            { label: "Day P&L", value: "—", color: "text-muted-foreground" },
            {
              label: "Overall P&L",
              value: "—",
              color: "text-muted-foreground",
            },
          ].map((item) => (
            <div key={item.label} className="px-3 py-3 text-center">
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">
                {item.label}
              </div>
              <div className={`font-mono-data text-sm font-bold ${item.color}`}>
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Index Overview */}
      {indexTicks && (
        <div className="rounded border border-border overflow-hidden">
          <div
            className="px-4 py-2.5 border-b border-border"
            style={{ background: "oklch(var(--card))" }}
          >
            <p className="text-[10px] font-bold text-muted-foreground tracking-widest uppercase">
              Index Overview
            </p>
          </div>
          <div className="grid grid-cols-3 divide-x divide-border">
            {INDEX_MAP.map(({ label, key }) => {
              const tick = indexTicks[key];
              const pos = (tick?.change ?? 0) >= 0;
              return (
                <div key={label} className="px-2 py-3 text-center">
                  <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1 font-bold">
                    {label}
                  </div>
                  <div className="font-mono-data text-sm font-bold text-foreground">
                    {tick
                      ? tick.ltp.toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })
                      : "—"}
                  </div>
                  {tick && (
                    <div
                      className={`text-[10px] font-bold mt-0.5 ${pos ? "text-gain" : "text-loss"}`}
                    >
                      {pos ? "+" : ""}
                      {tick.change.toFixed(2)}%
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      {onTabChange && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            data-ocid="overview.orders_button"
            onClick={() => onTabChange("orders")}
            className="py-2.5 px-4 rounded border border-border text-xs font-semibold text-foreground hover:bg-secondary transition-colors"
          >
            View Orders
          </button>
          <button
            type="button"
            data-ocid="overview.options_button"
            onClick={() => onTabChange("options")}
            className="py-2.5 px-4 rounded border border-primary/50 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
          >
            View Options
          </button>
        </div>
      )}

      {/* Profile */}
      <div className="rounded border border-border overflow-hidden">
        <div
          className="px-4 py-2.5 border-b border-border"
          style={{ background: "oklch(var(--card))" }}
        >
          <p className="text-[10px] font-bold text-muted-foreground tracking-widest uppercase">
            Profile
          </p>
        </div>
        <div className="p-4">
          {loading ? (
            <div data-ocid="overview.loading_state" className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-5 rounded bg-secondary animate-pulse"
                />
              ))}
            </div>
          ) : profile ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{
                    background: "oklch(0.62 0.2 250 / 0.2)",
                    border: "1px solid oklch(0.62 0.2 250 / 0.4)",
                    color: "oklch(0.75 0.2 250)",
                  }}
                >
                  {profile.name[0]?.toUpperCase() ?? "U"}
                </div>
                <div>
                  <p className="font-semibold text-sm text-foreground">
                    {profile.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    {profile.userId}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
                    Email
                  </p>
                  <p className="text-xs text-foreground truncate">
                    {profile.email}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">
                    Broker
                  </p>
                  <p className="text-xs text-foreground">{profile.broker}</p>
                </div>
              </div>
            </div>
          ) : (
            <div data-ocid="overview.error_state" className="py-4 text-center">
              <p className="text-xs text-muted-foreground">
                Could not load profile
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Token */}
      <div className="rounded border border-border overflow-hidden">
        <div
          className="px-4 py-2.5 border-b border-border flex items-center justify-between"
          style={{ background: "oklch(var(--card))" }}
        >
          <p className="text-[10px] font-bold text-muted-foreground tracking-widest uppercase">
            Access Token
          </p>
          <div className="flex items-center gap-2">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-950 text-gain border border-green-800/40 font-bold">
              Active
            </span>
            <button
              type="button"
              onClick={copyToken}
              className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
            >
              <Copy className="w-3 h-3" />
            </button>
          </div>
        </div>
        <div className="p-3">
          <p className="font-mono text-[10px] text-muted-foreground break-all line-clamp-4">
            {token}
          </p>
          {copied && <p className="text-[10px] text-gain mt-1">Copied!</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Funds Tab ────────────────────────────────────────────────────────────────
function FundsTab({
  funds,
  loading,
}: { funds: Funds | null; loading: boolean }) {
  const utilization =
    funds && funds.total > 0 ? (funds.used / funds.total) * 100 : 0;

  return (
    <div className="p-4 space-y-4">
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded bg-secondary animate-pulse" />
          ))}
        </div>
      ) : funds ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div
              className="p-4 rounded border border-border"
              style={{
                background: "oklch(0.62 0.2 250 / 0.08)",
                borderColor: "oklch(0.62 0.2 250 / 0.3)",
              }}
            >
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                Available Balance
              </p>
              <p className="font-mono-data text-xl font-bold text-foreground">
                ₹
                {funds.available.toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                })}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Ready to trade
              </p>
            </div>
            <div className="p-4 rounded border border-border">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                Used Margin
              </p>
              <p className="font-mono-data text-xl font-bold text-loss">
                ₹
                {funds.used.toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                })}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">Blocked</p>
            </div>
            <div className="p-4 rounded border border-border">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                Net Value
              </p>
              <p className="font-mono-data text-xl font-bold text-foreground">
                ₹
                {funds.total.toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                })}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">Total</p>
            </div>
          </div>

          <div className="p-4 rounded border border-border space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Margin Utilization
              </p>
              <p className="font-mono-data text-xs font-bold text-foreground">
                {utilization.toFixed(1)}%
              </p>
            </div>
            <Progress value={utilization} className="h-1.5" />
          </div>
        </>
      ) : (
        <div className="py-10 text-center">
          <Wallet className="w-7 h-7 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">
            Could not load funds data
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Dashboard Screen ─────────────────────────────────────────────────────────
function DashboardScreen({
  token,
  onDisconnect,
}: { token: string; onDisconnect: () => void }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [funds, setFunds] = useState<Funds | null>(null);
  const [loading, setLoading] = useState(true);
  const [corsWarning, setCorsWarning] = useState(false);
  const [activeTab, setActiveTab] = useState<TabValue>("overview");
  const [watchlistOpen, setWatchlistOpen] = useState(false);
  const { ticks: indexTicks, wsStatus, lastUpdated } = useIndexWebSocket(token);
  const { theme, toggle: toggleTheme } = useTheme();
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    key: string;
    label: string;
  } | null>(null);
  const [optionUnderlying, setOptionUnderlying] =
    useState<string>("NSE_INDEX|Nifty 50");
  const [orderPrefill, setOrderPrefill] = useState<{
    instrumentKey?: string;
    txType?: "BUY" | "SELL";
    price?: string;
    quantity?: string;
    lotSize?: number;
  } | null>(null);

  const [pendingSquareOff, setPendingSquareOff] = useState<{
    instrumentKey: string;
    name: string;
    qty: number;
    price: string;
    lotSize: number;
    mode: "sell" | "gtt";
  } | null>(null);

  const handleBuyStrike = (
    instrumentKey: string,
    ltp: number,
    txType: "BUY" | "SELL",
    lotSize: number,
  ) => {
    setOrderPrefill({
      instrumentKey,
      txType,
      price: ltp.toFixed(2),
      quantity: "1",
      lotSize,
    });
    setActiveTab("orders");
  };

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tradeSettings, setTradeSettings] =
    useState<TradeSettings>(loadTradeSettings);

  const handleIndexContextMenu = (
    key: string,
    label: string,
    e: React.MouseEvent,
  ) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, key, label });
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    const [profileRes, fundsRes] = await Promise.all([
      upstoxFetch<any>("/v2/user/profile", token),
      upstoxFetch<any>("/v2/user/get-funds-and-margin", token),
    ]);

    if (profileRes.data) {
      const d = profileRes.data;
      setProfile({
        name: d.name ?? d.user_name ?? "—",
        email: d.email ?? "—",
        broker: d.broker ?? "Upstox",
        userId: d.user_id ?? "—",
      });
    } else if (profileRes.error) {
      setCorsWarning(true);
    }

    if (fundsRes.data) {
      const d = fundsRes.data?.equity ?? fundsRes.data;
      setFunds({
        available: d.available_margin ?? d.available_balance ?? 0,
        used: d.used_margin ?? 0,
        total: d.net ?? 0,
      });
    }

    setLoading(false);
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{ background: "oklch(var(--background))" }}
    >
      {/* Header */}
      <AppHeader
        token={token}
        onDisconnect={onDisconnect}
        onMenuToggle={() => setWatchlistOpen((v) => !v)}
        indexTicks={indexTicks}
        wsStatus={wsStatus}
        onIndexContextMenu={handleIndexContextMenu}
        theme={theme}
        onThemeToggle={toggleTheme}
        lastUpdated={lastUpdated}
        onSettingsOpen={() => setSettingsOpen(true)}
      />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        tradeSettings={tradeSettings}
        onTradeSettingsSave={setTradeSettings}
      />

      {/* CORS warning */}
      {corsWarning && (
        <div
          className="px-3 py-1.5 border-b border-amber-800/30"
          style={{ background: "oklch(0.72 0.18 75 / 0.08)" }}
        >
          <p className="text-[10px] text-amber-400">
            ⚠️ API blocked by CORS — enable CORS proxy or test from registered
            redirect URI
          </p>
        </div>
      )}

      {/* Body: sidebar + main */}
      <div className="flex flex-1 overflow-hidden" data-ocid="main.section">
        {/* Watchlist sidebar — desktop always visible, mobile overlay */}
        <div
          className={`
          absolute inset-y-0 left-0 z-30 lg:relative lg:flex lg:z-auto
          transition-transform duration-200
          ${watchlistOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
          style={{ top: "44px" }}
        >
          <WatchlistPanel
            ticks={indexTicks}
            onClose={() => setWatchlistOpen(false)}
          />
        </div>

        {/* Mobile overlay backdrop */}
        {watchlistOpen && (
          <div
            role="button"
            tabIndex={-1}
            onKeyDown={(e) => e.key === "Escape" && setWatchlistOpen(false)}
            className="fixed inset-0 z-20 bg-black/60 lg:hidden"
            onClick={() => setWatchlistOpen(false)}
            style={{ top: "44px" }}
          />
        )}

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden relative z-40">
          <TabNav active={activeTab} onChange={setActiveTab} />

          <div className="flex-1 overflow-auto animate-slide-up">
            {activeTab === "overview" && (
              <OverviewTab
                profile={profile}
                token={token}
                loading={loading}
                indexTicks={indexTicks}
                onTabChange={setActiveTab}
              />
            )}
            {activeTab === "funds" && (
              <FundsTab funds={funds} loading={loading} />
            )}
            {activeTab === "orders" && (
              <OrdersTab
                token={token}
                prefill={orderPrefill}
                onPrefillConsumed={() => setOrderPrefill(null)}
                onBack={() => {
                  setOrderPrefill(null);
                  setActiveTab("options");
                }}
              />
            )}
            {activeTab === "positions" && (
              <PositionsTab
                token={token}
                onSquareOff={(pos, mode) => {
                  const instrumentKey = pos.instrument_token;
                  const qty = Math.abs(pos.quantity);
                  setPendingSquareOff({
                    instrumentKey,
                    name: pos.tradingsymbol || instrumentKey,
                    qty,
                    price: pos.last_price.toFixed(2),
                    lotSize: qty,
                    mode,
                  });
                }}
              />
            )}
            {activeTab === "holdings" && (
              <HoldingsTab
                token={token}
                onSquareOff={(h, mode) => {
                  const instrumentKey =
                    h.instrument_token || `${h.exchange}_EQ|${h.tradingsymbol}`;
                  const qty = h.quantity;
                  setPendingSquareOff({
                    instrumentKey,
                    name: h.tradingsymbol || instrumentKey,
                    qty,
                    price: h.last_price.toFixed(2),
                    lotSize: qty,
                    mode,
                  });
                }}
              />
            )}
            {activeTab === "options" && (
              <OptionChainTab
                token={token}
                indexTicks={indexTicks}
                initialUnderlying={optionUnderlying}
                tradeSettings={tradeSettings}
                onBuyStrike={handleBuyStrike}
                onUnderlyingChange={setOptionUnderlying}
              />
            )}
            {activeTab === "market" && <LiveTab token={token} />}
            {activeTab === "risk" && <RiskTab token={token} />}
          </div>

          {/* Square-Off Confirmation Dialog */}
          <AlertDialog
            open={!!pendingSquareOff}
            onOpenChange={(open) => {
              if (!open) setPendingSquareOff(null);
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm Square Off</AlertDialogTitle>
                <AlertDialogDescription>
                  {pendingSquareOff && (
                    <>
                      Are you sure you want to square off{" "}
                      <span className="font-semibold text-foreground">
                        {pendingSquareOff.name}
                      </span>{" "}
                      —{" "}
                      <span className="font-semibold text-foreground">
                        {pendingSquareOff.qty} qty
                      </span>{" "}
                      {pendingSquareOff.mode === "sell"
                        ? "at market price (SELL order)"
                        : "via GTT SELL order"}
                      ?
                    </>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel
                  data-ocid="squareoff.cancel_button"
                  onClick={() => setPendingSquareOff(null)}
                >
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  data-ocid="squareoff.confirm_button"
                  className="bg-red-600 hover:bg-red-500 text-white"
                  onClick={() => {
                    if (!pendingSquareOff) return;
                    const { instrumentKey, price, qty, lotSize, mode } =
                      pendingSquareOff;
                    if (mode === "sell") {
                      setOrderPrefill({
                        instrumentKey,
                        txType: "SELL",
                        price,
                        quantity: String(qty),
                      });
                    } else {
                      setOrderPrefill({
                        instrumentKey,
                        txType: "SELL",
                        price,
                        quantity: String(qty),
                        lotSize,
                        // @ts-ignore
                        gttMode: true,
                      });
                    }
                    setActiveTab("orders");
                    setPendingSquareOff(null);
                  }}
                >
                  Confirm Square Off
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Footer */}
          <footer
            className="px-4 py-2 border-t border-border text-center"
            style={{ background: "oklch(var(--background))" }}
          >
            <p className="text-[10px] text-muted-foreground">
              © {new Date().getFullYear()} Built with ❤️ using{" "}
              <a
                href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary/70 hover:text-primary transition-colors"
              >
                caffeine.ai
              </a>
            </p>
          </footer>
        </div>
      </div>

      {/* Context Menu */}
      {ctxMenu && (
        <>
          <div
            role="button"
            tabIndex={-1}
            className="fixed inset-0 z-50"
            onClick={() => setCtxMenu(null)}
            onKeyDown={(e) => e.key === "Escape" && setCtxMenu(null)}
          />
          <div
            className="fixed z-50 min-w-[160px] rounded border border-border shadow-xl py-1"
            style={{
              left: ctxMenu.x,
              top: ctxMenu.y,
              background: "oklch(0.13 0.006 240)",
            }}
          >
            <div className="px-3 py-1.5 border-b border-border mb-1">
              <p className="text-[10px] font-bold text-primary tracking-widest uppercase">
                {ctxMenu.label}
              </p>
            </div>
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-secondary/60 transition-colors"
              onClick={() => {
                const tick = indexTicks[ctxMenu.key];
                if (tick) {
                  toast.info(
                    `${ctxMenu.label}: ${tick.ltp.toLocaleString("en-IN", { minimumFractionDigits: 2 })} (${tick.change >= 0 ? "+" : ""}${tick.change.toFixed(2)}%)`,
                  );
                } else {
                  toast.info(`${ctxMenu.label}: No data yet`);
                }
                setCtxMenu(null);
              }}
            >
              Symbol Info
            </button>
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-xs text-foreground hover:bg-secondary/60 transition-colors"
              onClick={() => {
                setOptionUnderlying(ctxMenu.key);
                setActiveTab("options");
                setCtxMenu(null);
              }}
            >
              Option Chain
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Setup Screen ─────────────────────────────────────────────────────────────
function SetupScreen({ onToken }: { onToken: (token: string) => void }) {
  useTheme(); // apply theme class on mount
  const [apiKey, setApiKey] = useState(LS.get(KEYS.apiKey));
  const [apiSecret, setApiSecret] = useState(LS.get(KEYS.apiSecret));
  const [redirectUri, setRedirectUri] = useState(
    LS.get(KEYS.redirectUri) || window.location.href.split("?")[0],
  );
  const [manualToken, setManualToken] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [showManual, setShowManual] = useState(false);

  const handleConnect = () => {
    if (!apiKey.trim()) {
      toast.error("API Key is required");
      return;
    }
    LS.set(KEYS.apiKey, apiKey.trim());
    LS.set(KEYS.apiSecret, apiSecret.trim());
    LS.set(KEYS.redirectUri, redirectUri.trim());
    const url = `https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=${encodeURIComponent(apiKey.trim())}&redirect_uri=${encodeURIComponent(redirectUri.trim())}`;
    window.location.href = url;
  };

  const handleSaveToken = () => {
    if (!manualToken.trim()) {
      toast.error("Token is required");
      return;
    }
    LS.set(KEYS.token, manualToken.trim());
    toast.success("Token saved!");
    onToken(manualToken.trim());
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: "oklch(var(--background))" }}
    >
      <div className="w-full max-w-sm space-y-4">
        {/* Brand */}
        <div className="text-center mb-6">
          <div
            className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center"
            style={{
              background: "oklch(0.62 0.2 250 / 0.15)",
              border: "1px solid oklch(0.62 0.2 250 / 0.4)",
            }}
          >
            <Zap className="w-6 h-6" style={{ color: "oklch(0.75 0.2 250)" }} />
          </div>
          <h1 className="font-display font-bold text-xl text-foreground tracking-tight">
            Upstox Connect
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Professional trading terminal
          </p>
        </div>

        {/* OAuth Setup */}
        <div
          className="rounded border border-border overflow-hidden"
          style={{ background: "oklch(var(--card))" }}
        >
          <div
            className="px-4 py-2.5 border-b border-border"
            style={{ background: "oklch(var(--card))" }}
          >
            <p className="text-[10px] font-bold text-muted-foreground tracking-widest uppercase">
              OAuth Setup
            </p>
          </div>
          <div className="p-4 space-y-3">
            <div>
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                API Key
              </Label>
              <Input
                data-ocid="setup.api_key_input"
                placeholder="Your Upstox API Key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="h-10 mt-1 bg-secondary border-border font-mono text-xs"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                API Secret
              </Label>
              <div className="relative mt-1">
                <Input
                  data-ocid="setup.api_secret_input"
                  type={showSecret ? "text" : "password"}
                  placeholder="Your API Secret"
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  className="h-10 bg-secondary border-border font-mono text-xs pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showSecret ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Redirect URI
              </Label>
              <Input
                data-ocid="setup.redirect_input"
                placeholder="https://yourapp.com/callback"
                value={redirectUri}
                onChange={(e) => setRedirectUri(e.target.value)}
                className="h-10 mt-1 bg-secondary border-border font-mono text-[11px]"
              />
            </div>
            <button
              data-ocid="setup.submit_button"
              type="button"
              onClick={handleConnect}
              className="w-full h-10 rounded text-sm font-bold text-white transition-colors"
              style={{ background: "oklch(0.62 0.2 250)" }}
            >
              Connect to Upstox
            </button>
          </div>
        </div>

        {/* Manual Token */}
        <div
          className="rounded border border-border overflow-hidden"
          style={{ background: "oklch(var(--card))" }}
        >
          <button
            type="button"
            onClick={() => setShowManual(!showManual)}
            className="w-full px-4 py-2.5 flex items-center justify-between text-[10px] font-bold text-muted-foreground tracking-widest uppercase border-b border-border hover:text-foreground transition-colors"
            style={{ background: "oklch(var(--card))" }}
          >
            Manual Token Entry
            <ChevronDown
              className={`w-3 h-3 transition-transform ${showManual ? "rotate-180" : ""}`}
            />
          </button>
          {showManual && (
            <div className="p-4 space-y-3">
              <div>
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Access Token
                </Label>
                <Input
                  data-ocid="auth.manual_token_input"
                  placeholder="Paste your access token here"
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  className="h-10 mt-1 bg-secondary border-border font-mono text-[11px]"
                />
              </div>
              <button
                data-ocid="auth.manual_token_button"
                type="button"
                onClick={handleSaveToken}
                className="w-full h-10 rounded text-xs font-bold border border-border text-foreground bg-secondary hover:bg-secondary/80 transition-colors"
              >
                Save Token
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Token Exchange Screen ────────────────────────────────────────────────────
function ExchangeScreen({ onToken }: { onToken: (token: string) => void }) {
  const [status, setStatus] = useState<"exchanging" | "error">("exchanging");
  const [error, setError] = useState("");
  const doneRef = useRef(false);

  useEffect(() => {
    if (doneRef.current) return;
    doneRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code) {
      setStatus("error");
      setError("No code in URL");
      return;
    }

    const apiKey = LS.get(KEYS.apiKey);
    const apiSecret = LS.get(KEYS.apiSecret);
    const redirectUri = LS.get(KEYS.redirectUri);

    if (!apiKey) {
      setStatus("error");
      setError("API Key not found");
      return;
    }

    fetch("https://api.upstox.com/v2/login/authorization/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: apiKey,
        client_secret: apiSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.access_token) {
          LS.set(KEYS.token, d.access_token);
          window.history.replaceState({}, "", window.location.pathname);
          onToken(d.access_token);
        } else {
          throw new Error(d.errors?.[0]?.message ?? JSON.stringify(d));
        }
      })
      .catch((e) => {
        setStatus("error");
        setError(e.message);
      });
  }, [onToken]);

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "oklch(var(--background))" }}
    >
      <div className="text-center space-y-3">
        {status === "exchanging" ? (
          <>
            <Loader2
              className="w-8 h-8 animate-spin mx-auto"
              style={{ color: "oklch(0.62 0.2 250)" }}
            />
            <p className="text-sm text-foreground font-semibold">
              Authenticating…
            </p>
            <p className="text-xs text-muted-foreground">
              Exchanging code for access token
            </p>
          </>
        ) : (
          <>
            <div className="w-10 h-10 rounded-full bg-red-950 border border-red-800/40 flex items-center justify-center mx-auto">
              <X className="w-5 h-5 text-loss" />
            </div>
            <p className="text-sm text-foreground font-semibold">
              Authentication Failed
            </p>
            <p className="text-xs text-muted-foreground font-mono max-w-xs">
              {error}
            </p>
            <button
              type="button"
              onClick={() => {
                window.history.replaceState({}, "", window.location.pathname);
                window.location.reload();
              }}
              className="mt-2 h-9 px-4 rounded border border-border text-xs font-bold text-foreground bg-secondary hover:bg-secondary/80 transition-colors"
            >
              Try Again
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── App Root ─────────────────────────────────────────────────────────────────
export default function App() {
  const [token, setToken] = useState(() => LS.get(KEYS.token));
  const [screen, setScreen] = useState<Screen>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("code")) return "exchanging";
    if (LS.get(KEYS.token)) return "dashboard";
    return "setup";
  });

  const handleToken = (t: string) => {
    setToken(t);
    setScreen("dashboard");
  };

  const handleDisconnect = () => {
    LS.del(KEYS.token);
    setToken("");
    setScreen("setup");
  };

  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "oklch(0.11 0.005 240)",
            border: "1px solid oklch(0.18 0.006 240)",
            color: "oklch(0.93 0.008 220)",
            fontSize: "12px",
          },
        }}
      />
      {screen === "setup" && <SetupScreen onToken={handleToken} />}
      {screen === "exchanging" && <ExchangeScreen onToken={handleToken} />}
      {screen === "dashboard" && token && (
        <DashboardScreen token={token} onDisconnect={handleDisconnect} />
      )}
    </>
  );
}
