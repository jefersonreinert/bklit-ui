"use client";

import { useCallback, useEffect, useState } from "react";

export type Impact = "high" | "medium" | "low" | "holiday";

export interface EconEvent {
  id: string;
  time: string;
  allDay: boolean;
  country: string;
  currency: string;
  impact: Impact;
  title: string;
  actual?: string;
  forecast?: string;
  previous?: string;
  url: string;
  source: "investing" | "forexfactory";
}

const API = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api`;

const pad = (n: number) => String(n).padStart(2, "0");
export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Monday of the week containing d. */
export function weekStart(d: Date) {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7));
  return s;
}

export function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Events between two local days; refreshes every 2 minutes. */
export function useCalendar(from: Date, to: Date) {
  const f = dayKey(addDays(from, -1));
  const t = dayKey(addDays(to, 1));
  const [events, setEvents] = useState<EconEvent[] | null>(null);
  const [source, setSource] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/markets/calendar/?from=${f}&to=${t}`, {
        cache: "no-store",
      });
      if (res.status === 401) {
        setError("locked");
        return;
      }
      const data = (await res.json()) as {
        events: EconEvent[];
        source: string;
      };
      setEvents(data.events);
      setSource(data.source);
      setError(null);
    } catch {
      setError("Sem conexão com o calendário.");
    } finally {
      setLoading(false);
    }
  }, [f, t]);
  useEffect(() => {
    setEvents(null);
    load();
    const timer = setInterval(load, 120_000);
    return () => clearInterval(timer);
  }, [load]);
  return { events, source, error, loading, reload: load };
}

const CURRENCY_FLAG: Record<string, string> = {
  USD: "US",
  EUR: "EU",
  GBP: "GB",
  JPY: "JP",
  CNY: "CN",
  CAD: "CA",
  AUD: "AU",
  NZD: "NZ",
  CHF: "CH",
  BRL: "BR",
  MXN: "MX",
  INR: "IN",
  KRW: "KR",
  ZAR: "ZA",
  TRY: "TR",
  RUB: "RU",
  SEK: "SE",
  NOK: "NO",
  DKK: "DK",
  PLN: "PL",
  HKD: "HK",
  SGD: "SG",
  IDR: "ID",
  ARS: "AR",
  CLP: "CL",
  COP: "CO",
  CZK: "CZ",
  HUF: "HU",
  ILS: "IL",
  SAR: "SA",
  AED: "AE",
  TWD: "TW",
  THB: "TH",
  MYR: "MY",
  PHP: "PH",
};

/** 🇺🇸 from "USD" (regional indicator letters). */
export function flag(currency: string) {
  const cc = CURRENCY_FLAG[currency];
  if (!cc) {
    return "🏳️";
  }
  return [...cc]
    .map((c) => String.fromCodePoint(0x1_f1_e6 + c.charCodeAt(0) - 65))
    .join("");
}

const NUM = /-?\d+(?:[.,]\d+)?/;

/** Actual above (1), below (-1) or equal/unknown (0) the forecast. */
export function surprise(e: Pick<EconEvent, "actual" | "forecast">) {
  const a = NUM.exec(e.actual ?? "")?.[0];
  const f = NUM.exec(e.forecast ?? "")?.[0];
  if (!(a && f)) {
    return 0;
  }
  const d = Number(a.replace(",", ".")) - Number(f.replace(",", "."));
  if (Math.abs(d) < 1e-9) {
    return 0;
  }
  return d > 0 ? 1 : -1;
}

export const IMPACT_LABEL: Record<Impact, string> = {
  high: "Alto",
  medium: "Médio",
  low: "Baixo",
  holiday: "Feriado",
};
