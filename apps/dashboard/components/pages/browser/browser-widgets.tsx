"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { browserHref, timeAgo, useNews } from "@/lib/browser/news";
import {
  updateBrowser,
  useBrowser,
  useNewsFeeds,
  type WidgetId,
} from "@/lib/browser/store";
import { Icon } from "@/lib/icons";
import { cn } from "@/lib/utils";

/** Home screen widgets (clock, weather, headlines). */

export const WIDGETS: { id: WidgetId; name: string; wide: boolean }[] = [
  { id: "clock", name: "Relógio", wide: false },
  { id: "weather", name: "Clima", wide: false },
  { id: "news", name: "Notícias", wide: true },
];

function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-36 flex-col justify-between overflow-hidden rounded-[28px] p-4 shadow-sm",
        className
      )}
    >
      {children}
    </div>
  );
}

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  return (
    <Card className="bg-gradient-to-br from-[#2b2622] to-[#5c3d2e] text-white">
      <span className="font-medium text-white/70 text-xs uppercase tracking-wide">
        {now?.toLocaleDateString("pt-BR", { weekday: "long" })}
      </span>
      <span className="font-semibold text-5xl tabular-nums tracking-tight">
        {now?.toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </span>
      <span className="text-sm text-white/80">
        {now?.toLocaleDateString("pt-BR", { day: "numeric", month: "long" })}
      </span>
    </Card>
  );
}

const WEATHER: Record<number, [string, string]> = {
  0: ["Céu limpo", "☀️"],
  1: ["Poucas nuvens", "🌤️"],
  2: ["Parcialmente nublado", "⛅"],
  3: ["Nublado", "☁️"],
  45: ["Neblina", "🌫️"],
  48: ["Neblina", "🌫️"],
  51: ["Garoa", "🌦️"],
  53: ["Garoa", "🌦️"],
  55: ["Garoa", "🌦️"],
  61: ["Chuva fraca", "🌧️"],
  63: ["Chuva", "🌧️"],
  65: ["Chuva forte", "🌧️"],
  71: ["Neve", "🌨️"],
  80: ["Pancadas de chuva", "🌦️"],
  81: ["Pancadas de chuva", "🌦️"],
  82: ["Temporal", "⛈️"],
  95: ["Trovoada", "⛈️"],
};

function Weather() {
  const { weather } = useBrowser();
  const [data, setData] = useState<{
    temp: number;
    code: number;
    max: number;
    min: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!weather) {
      return;
    }
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${weather.lat}&longitude=${weather.lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`;
    fetch(url)
      .then((r) => r.json())
      .then((j) =>
        setData({
          temp: Math.round(j.current.temperature_2m),
          code: j.current.weather_code,
          max: Math.round(j.daily.temperature_2m_max[0]),
          min: Math.round(j.daily.temperature_2m_min[0]),
        })
      )
      .catch(() => setError("Sem clima agora."));
  }, [weather]);
  const locate = () => {
    navigator.geolocation?.getCurrentPosition(
      (pos) =>
        updateBrowser((d) => ({
          ...d,
          weather: {
            lat: Math.round(pos.coords.latitude * 100) / 100,
            lon: Math.round(pos.coords.longitude * 100) / 100,
            place: "Aqui",
          },
        })),
      () => setError("Permita a localização para ver o clima.")
    );
  };
  const [label, emoji] = WEATHER[data?.code ?? 0] ?? ["", "🌡️"];
  return (
    <Card className="bg-gradient-to-br from-[#4a6fa5] to-[#8fb3e0] text-white">
      {weather ? (
        <>
          <span className="font-medium text-white/80 text-xs">
            {weather.place}
          </span>
          <span className="flex items-end gap-2">
            <span className="font-semibold text-5xl tabular-nums">
              {data ? `${data.temp}°` : "—"}
            </span>
            <span className="pb-1.5 text-2xl">{emoji}</span>
          </span>
          <span className="text-sm text-white/85">
            {error ??
              (data ? `${label} · ${data.max}° / ${data.min}°` : "Carregando…")}
          </span>
        </>
      ) : (
        <button
          className="flex h-full flex-col items-start gap-2 text-left"
          onClick={locate}
          type="button"
        >
          <span className="text-3xl">🌤️</span>
          <span className="font-semibold">Clima</span>
          <span className="text-sm text-white/85">
            {error ?? "Toque para usar sua localização"}
          </span>
        </button>
      )}
    </Card>
  );
}

function Headlines() {
  const feeds = useNewsFeeds();
  const { items } = useNews(feeds);
  return (
    <Card className="col-span-2 bg-card text-card-foreground ring-1 ring-border">
      <span className="flex items-center gap-1.5 font-semibold text-[#c96442] text-xs uppercase tracking-wide">
        <Icon className="size-3.5" name="IconNewspaper" />
        Notícias
      </span>
      <div className="flex flex-col gap-2 pt-2">
        {(items ?? []).slice(0, 3).map((i) => (
          <Link className="block" href={browserHref(i.link)} key={i.link}>
            <span className="line-clamp-2 font-medium text-sm leading-snug">
              {i.title}
            </span>
            <span className="text-muted-foreground text-xs">
              {i.source} · {timeAgo(i.date)}
            </span>
          </Link>
        ))}
        {items === null ? (
          <span className="text-muted-foreground text-sm">Carregando…</span>
        ) : null}
      </div>
    </Card>
  );
}

export function Widget({ id }: { id: WidgetId }) {
  if (id === "clock") {
    return <Clock />;
  }
  if (id === "weather") {
    return <Weather />;
  }
  if (id === "news") {
    return <Headlines />;
  }
  return null;
}
