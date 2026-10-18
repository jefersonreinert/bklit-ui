//+------------------------------------------------------------------+
//|                                          CasaBrasaOHLCExport.mq5 |
//| Exporta velas OHLC (os 21 tempos gráficos do MT5, histórico      |
//| completo + tempo real) e ticks para a plataforma Casa Brasa      |
//| (Gráficos → Operar). Só lê preços: nunca envia ordens.           |
//|                                                                  |
//| Instalação:                                                      |
//|  1. Ferramentas → Opções → Expert Advisors → marque "Permitir    |
//|     WebRequest para as URLs listadas" e adicione                 |
//|     https://<deployment>.convex.site                             |
//|  2. Ferramentas → Opções → Gráficos → "Máx. barras no gráfico" = |
//|     Unlimited (senão o histórico para nesse limite).             |
//|  3. Anexe o EA a um gráfico e cole em InpUrl a URL do webhook    |
//|     .../ohlc/mt5?token=… (ou a URL sem token + InpToken).        |
//|  4. Escolha os ativos (InpSymbols), os tempos gráficos           |
//|     (InpTimeframes), os ticks (InpTicks) e o backfill.           |
//|  5. Deixe o terminal aberto. O progresso fica salvo em           |
//|     MQL5/Files e continua de onde parou ao reiniciar.            |
//|                                                                  |
//| Horários: em UTC (InpTimeUtc), as velas D1/W1/MN1 começam na     |
//| meia-noite da corretora convertida (ex.: 21:00 UTC numa          |
//| corretora UTC+3). A plataforma reconstrói o horário da corretora |
//| com offset_sec.                                                  |
//+------------------------------------------------------------------+
#property copyright "Casa Brasa"
#property version   "1.00"
#property strict
#property description "Exporta velas OHLC (21 tempos gráficos) e ticks para a plataforma."
#property description "Só lê preços: nunca envia ordens."

enum OhlcTransport
  {
   OHLC_HTTP = 0,   // HTTP (POST JSON)
   OHLC_FILE = 1,   // Arquivo (JSONL)
   OHLC_BOTH = 2    // HTTP e arquivo
  };

enum OhlcBackfill
  {
   OHLC_BACKFILL_NONE = 0,      // Nenhum
   OHLC_BACKFILL_FULL = 1,      // Completo
   OHLC_BACKFILL_ON_DEMAND = 2  // Sob demanda (velas)
  };

#define OHLC_TF_COUNT   21
/** Bytes por POST: o webhook recusa corpos acima de 256 000 (MAX_BODY). */
#define OHLC_BODY_MAX   240000
/** Bytes por bloco de uma série ou de ticks dentro de um envio. */
#define OHLC_PART_MAX   110000
#define OHLC_MN1_SEC    2592000
/** Menor mês: limita os blocos de MN1 a no máximo N velas. */
#define OHLC_MN1_MIN    2419200

ENUM_TIMEFRAMES OHLC_TFS[OHLC_TF_COUNT] =
  {
   PERIOD_M1, PERIOD_M2, PERIOD_M3, PERIOD_M4, PERIOD_M5, PERIOD_M6,
   PERIOD_M10, PERIOD_M12, PERIOD_M15, PERIOD_M20, PERIOD_M30,
   PERIOD_H1, PERIOD_H2, PERIOD_H3, PERIOD_H4, PERIOD_H6, PERIOD_H8,
   PERIOD_H12, PERIOD_D1, PERIOD_W1, PERIOD_MN1
  };

string OHLC_TF_NAMES[OHLC_TF_COUNT] =
  {
   "M1", "M2", "M3", "M4", "M5", "M6", "M10", "M12", "M15", "M20", "M30",
   "H1", "H2", "H3", "H4", "H6", "H8", "H12", "D1", "W1", "MN1"
  };

/** Pedido de histórico vindo da plataforma (resposta do webhook). */
struct OhlcRequest
  {
   string            id;
   string            kind;     // "bars" ou "ticks"
   string            symbol;
   string            tf;
   long              fromMs;
   long              toMs;
  };

//=== Funções puras (testadas por mql5/tests/OhlcExportSelfTest.mq5) ===

//--- Tempos gráficos -------------------------------------------------
string OhlcTfName(const ENUM_TIMEFRAMES tf)
  {
   for(int i = 0; i < OHLC_TF_COUNT; i++)
      if(OHLC_TFS[i] == tf)
         return OHLC_TF_NAMES[i];
   return "";
  }

string OhlcTrim(const string s)
  {
   string r = s;
   StringTrimLeft(r);
   StringTrimRight(r);
   return r;
  }

/** "M1", "h4", "MN", "mn1", "D", "W" → tempo gráfico; false se desconhecido. */
bool OhlcTfParse(const string text, ENUM_TIMEFRAMES &tf)
  {
   string t = OhlcTrim(text);
   StringToUpper(t);
   if(t == "MN")
      t = "MN1";
   else
      if(t == "W")
         t = "W1";
      else
         if(t == "D")
            t = "D1";
   for(int i = 0; i < OHLC_TF_COUNT; i++)
      if(OHLC_TF_NAMES[i] == t)
        {
         tf = OHLC_TFS[i];
         return true;
        }
   return false;
  }

/** Duração em segundos (MN1: 30 dias, valor nominal). */
int OhlcTfSeconds(const ENUM_TIMEFRAMES tf)
  {
   if(tf == PERIOD_MN1)
      return OHLC_MN1_SEC;
   return PeriodSeconds(tf);
  }

/** Passo usado para dividir o backfill: nunca mais de N velas por bloco. */
int OhlcTfStep(const ENUM_TIMEFRAMES tf)
  {
   if(tf == PERIOD_MN1)
      return OHLC_MN1_MIN;
   return PeriodSeconds(tf);
  }

//--- Listas ------------------------------------------------------------
bool OhlcHas(const string &list[], const string s)
  {
   for(int i = 0; i < ArraySize(list); i++)
      if(list[i] == s)
         return true;
   return false;
  }

/** "A, B;C  A" → {"A","B","C"} (sem vazios nem repetidos, na ordem). */
int OhlcSplit(const string text, string &out[])
  {
   ArrayResize(out, 0);
   string t = text;
   StringReplace(t, ";", ",");
   StringReplace(t, " ", ",");
   StringReplace(t, "\t", ",");
   string parts[];
   int n = StringSplit(t, ',', parts);
   for(int i = 0; i < n; i++)
     {
      string p = OhlcTrim(parts[i]);
      if(p == "" || OhlcHas(out, p))
         continue;
      int k = ArraySize(out);
      ArrayResize(out, k + 1);
      out[k] = p;
     }
   return ArraySize(out);
  }

/** "ALL" (ou vazio) = os 21; senão a lista, na ordem do MT5. Desconhecidos vão para `bad`. */
int OhlcParseTfs(const string text, ENUM_TIMEFRAMES &out[], string &bad)
  {
   ArrayResize(out, 0);
   bad = "";
   string t = OhlcTrim(text);
   StringToUpper(t);
   bool all = t == "" || t == "ALL";
   bool use[OHLC_TF_COUNT];
   for(int j = 0; j < OHLC_TF_COUNT; j++)
      use[j] = all;
   if(!all)
     {
      string items[];
      int n = OhlcSplit(text, items);
      for(int i = 0; i < n; i++)
        {
         ENUM_TIMEFRAMES tf;
         if(!OhlcTfParse(items[i], tf))
           {
            bad += (bad == "" ? "" : ",") + items[i];
            continue;
           }
         for(int j = 0; j < OHLC_TF_COUNT; j++)
            if(OHLC_TFS[j] == tf)
               use[j] = true;
        }
     }
   for(int j = 0; j < OHLC_TF_COUNT; j++)
     {
      if(!use[j])
         continue;
      int k = ArraySize(out);
      ArrayResize(out, k + 1);
      out[k] = OHLC_TFS[j];
     }
   return ArraySize(out);
  }

//--- JSON --------------------------------------------------------------
string OhlcEsc(const string s)
  {
   string r = s;
   StringReplace(r, "\\", "\\\\");
   StringReplace(r, "\"", "\\\"");
   StringReplace(r, "\n", " ");
   StringReplace(r, "\r", " ");
   StringReplace(r, "\t", " ");
   return r;
  }

/** Número sem zeros inúteis: 3 → "3", 0.5 → "0.5" (volumes). */
string OhlcNum(const double v)
  {
   if(v == MathRound(v) && MathAbs(v) < 1e15)
      return IntegerToString((long)MathRound(v));
   string s = DoubleToString(v, 8);
   while(StringLen(s) > 1 && StringGetCharacter(s, StringLen(s) - 1) == '0')
      s = StringSubstr(s, 0, StringLen(s) - 1);
   if(StringGetCharacter(s, StringLen(s) - 1) == '.')
      s = StringSubstr(s, 0, StringLen(s) - 1);
   return s;
  }

//--- Horários ------------------------------------------------------------
/** Hora da corretora − UTC, arredondada a 15 min (igual ao CasaBrasaJournal). */
long OhlcOffsetSec(const datetime server, const datetime gmt)
  {
   return (long)MathRound((double)(server - gmt) / 900.0) * 900;
  }

/** Hora da corretora → ms (UTC quando utc=true). */
long OhlcMs(const datetime t, const bool utc, const long offset)
  {
   return ((long)t - (utc ? offset : 0)) * 1000;
  }

/** time_msc da corretora → ms (UTC quando utc=true). */
long OhlcMscMs(const long msc, const bool utc, const long offset)
  {
   return msc - (utc ? offset * 1000 : 0);
  }

/** ms do payload → hora da corretora (inverso de OhlcMs, arredonda para baixo). */
datetime OhlcFromMs(const long ms, const bool utc, const long offset)
  {
   long sec = ms >= 0 ? ms / 1000 : -((-ms + 999) / 1000);
   return (datetime)(sec + (utc ? offset : 0));
  }

/** ms do payload → time_msc da corretora. */
long OhlcMscFromMs(const long ms, const bool utc, const long offset)
  {
   return ms + (utc ? offset * 1000 : 0);
  }

//--- Linhas e blocos -------------------------------------------------------
/** [t_ms, open, high, low, close, tick_volume, real_volume, spread] */
string OhlcRateJson(const MqlRates &r, const int digits, const bool utc, const long offset)
  {
   return "[" + IntegerToString(OhlcMs(r.time, utc, offset)) + "," +
          DoubleToString(r.open, digits) + "," +
          DoubleToString(r.high, digits) + "," +
          DoubleToString(r.low, digits) + "," +
          DoubleToString(r.close, digits) + "," +
          IntegerToString(r.tick_volume) + "," +
          IntegerToString(r.real_volume) + "," +
          IntegerToString(r.spread) + "]";
  }

/** Bloco de velas de uma série. from_ms/to_ms só em history (range=true). */
string OhlcSeriesJson(const string symbol, const ENUM_TIMEFRAMES tf, const int digits,
                      const string rows, const bool range, const long fromMs,
                      const long toMs, const long firstMs)
  {
   string j = "{\"symbol\":\"" + OhlcEsc(symbol) + "\",\"tf\":\"" + OhlcTfName(tf) +
              "\",\"sec\":" + IntegerToString(OhlcTfSeconds(tf)) +
              ",\"digits\":" + IntegerToString(digits);
   if(range)
      j += ",\"from_ms\":" + IntegerToString(fromMs) + ",\"to_ms\":" + IntegerToString(toMs);
   if(firstMs > 0)
      j += ",\"first_ms\":" + IntegerToString(firstMs);
   return j + ",\"bars\":[" + rows + "]}";
  }

/** [t_ms, bid, ask, last, volume, flags] */
string OhlcTickJson(const MqlTick &t, const int digits, const bool utc, const long offset)
  {
   double vol = t.volume_real > 0 ? t.volume_real : (double)t.volume;
   return "[" + IntegerToString(OhlcMscMs(t.time_msc, utc, offset)) + "," +
          DoubleToString(t.bid, digits) + "," +
          DoubleToString(t.ask, digits) + "," +
          DoubleToString(t.last, digits) + "," +
          OhlcNum(vol) + "," +
          IntegerToString(t.flags) + "]";
  }

/** Bloco de ticks de um ativo. chart = "bid" (forex/CFD) ou "last" (bolsa). */
string OhlcTicksJson(const string symbol, const int digits, const string chart,
                     const string rows, const bool range, const long fromMs, const long toMs)
  {
   string j = "{\"symbol\":\"" + OhlcEsc(symbol) + "\",\"digits\":" + IntegerToString(digits) +
              ",\"chart\":\"" + chart + "\"";
   if(range)
      j += ",\"from_ms\":" + IntegerToString(fromMs) + ",\"to_ms\":" + IntegerToString(toMs);
   return j + ",\"rows\":[" + rows + "]}";
  }

/**
 * Envelope de um envio. series/ticks: blocos já separados por vírgula ("" = omitido).
 * extra: campos adicionais já formatados, começando por vírgula (",\"done\":true").
 */
string OhlcEnvelopeJson(const string type, const string account, const string server,
                        const string broker, const long offset, const bool utc,
                        const long sentMs, const long seq, const string requestId,
                        const string series, const string ticks, const string extra)
  {
   string j = "{\"v\":1,\"type\":\"" + type + "\",\"source\":\"mt5-ohlc\"" +
              ",\"account\":\"" + OhlcEsc(account) + "\"" +
              ",\"server\":\"" + OhlcEsc(server) + "\"" +
              ",\"broker\":\"" + OhlcEsc(broker) + "\"" +
              ",\"offset_sec\":" + IntegerToString(offset) +
              ",\"time_utc\":" + (utc ? "true" : "false") +
              ",\"sent_ms\":" + IntegerToString(sentMs) +
              ",\"seq\":" + IntegerToString(seq);
   if(requestId != "")
      j += ",\"request_id\":\"" + OhlcEsc(requestId) + "\"";
   if(series != "")
      j += ",\"series\":[" + series + "]";
   if(ticks != "")
      j += ",\"ticks\":[" + ticks + "]";
   return j + extra + "}";
  }

//--- Detecção de mudança -----------------------------------------------------
bool OhlcSameRate(const MqlRates &a, const MqlRates &b)
  {
   return a.time == b.time && a.open == b.open && a.high == b.high &&
          a.low == b.low && a.close == b.close && a.tick_volume == b.tick_volume &&
          a.real_volume == b.real_volume && a.spread == b.spread;
  }

/**
 * Índice da primeira vela a enviar (rates do mais antigo para o mais novo).
 * Pula as velas anteriores à última enviada e a própria última se não mudou.
 * Retorna count quando nada mudou.
 */
int OhlcFirstChanged(const MqlRates &rates[], const int count, const MqlRates &last,
                     const bool hasLast)
  {
   if(!hasLast)
      return 0;
   for(int i = 0; i < count; i++)
     {
      if(rates[i].time < last.time)
         continue;
      if(rates[i].time == last.time && OhlcSameRate(rates[i], last))
         return i + 1;
      return i;
     }
   return count;
  }

//--- Ticks no mesmo milissegundo --------------------------------------------
/**
 * Quantos ticks do início pular: os anteriores a lastMsc e os `sentAtLast`
 * primeiros com time_msc == lastMsc (já enviados).
 */
int OhlcTickSkip(const MqlTick &ticks[], const int count, const long lastMsc,
                 const int sentAtLast)
  {
   int skip = 0;
   while(skip < count && ticks[skip].time_msc < lastMsc)
      skip++;
   int same = 0;
   while(skip < count && same < sentAtLast && ticks[skip].time_msc == lastMsc)
     {
      skip++;
      same++;
     }
   return skip;
  }

/** Avança o estado depois de enviar ticks[from..to). */
void OhlcTickAdvance(const MqlTick &ticks[], const int from, const int to,
                     long &lastMsc, int &sentAtLast)
  {
   if(to <= from)
      return;
   long msc = ticks[to - 1].time_msc;
   int n = 0;
   for(int i = to - 1; i >= from && ticks[i].time_msc == msc; i--)
      n++;
   if(msc == lastMsc)
      sentAtLast += n;
   else
     {
      lastMsc = msc;
      sentAtLast = n;
     }
  }

//--- Divisão do backfill -----------------------------------------------------
/**
 * Próximo bloco do backfill, do mais novo para o mais antigo: [from, to] com
 * no máximo maxBars velas de `step` segundos. O bloco seguinte termina em from - 1.
 * Retorna false quando cursorTo já passou do início (first).
 */
bool OhlcChunk(const datetime cursorTo, const datetime first, const int step,
               const int maxBars, datetime &from, datetime &to)
  {
   if(cursorTo < first || maxBars <= 0 || step <= 0)
      return false;
   to = cursorTo;
   long start = (long)cursorTo - (long)step * maxBars + 1;
   from = (datetime)MathMax((long)first, start);
   return true;
  }

//--- Resposta do webhook -------------------------------------------------------
/** Valor bruto de "key": no objeto JSON plano `obj` ("" se ausente). */
string OhlcJsonRaw(const string obj, const string key)
  {
   string pat = "\"" + key + "\"";
   int p = StringFind(obj, pat);
   while(p >= 0)
     {
      int c = p + StringLen(pat);
      while(c < StringLen(obj) && (StringGetCharacter(obj, c) == ' '))
         c++;
      if(c < StringLen(obj) && StringGetCharacter(obj, c) == ':')
        {
         c++;
         while(c < StringLen(obj) && StringGetCharacter(obj, c) == ' ')
            c++;
         if(StringGetCharacter(obj, c) == '"')
           {
            string out = "";
            for(int i = c + 1; i < StringLen(obj); i++)
              {
               ushort ch = StringGetCharacter(obj, i);
               if(ch == '\\' && i + 1 < StringLen(obj))
                 {
                  i++;
                  out += ShortToString(StringGetCharacter(obj, i));
                  continue;
                 }
               if(ch == '"')
                  return out;
               out += ShortToString(ch);
              }
            return out;
           }
         int e = c;
         while(e < StringLen(obj))
           {
            ushort ch = StringGetCharacter(obj, e);
            if(ch == ',' || ch == '}' || ch == ']' || ch == ' ')
               break;
            e++;
           }
         return StringSubstr(obj, c, e - c);
        }
      p = StringFind(obj, pat, p + 1);
     }
   return "";
  }

/**
 * { ok: true, next_ms?: 1000, requests: [{id, kind, symbol, tf?, from_ms, to_ms}] }
 * Retorna quantos pedidos válidos leu; nextMs = 0 se ausente.
 */
int OhlcParseRequests(const string body, OhlcRequest &out[], long &nextMs)
  {
   ArrayResize(out, 0);
   string nm = OhlcJsonRaw(body, "next_ms");
   nextMs = nm == "" ? 0 : StringToInteger(nm);
   int p = StringFind(body, "\"requests\"");
   if(p < 0)
      return 0;
   int a = StringFind(body, "[", p);
   if(a < 0)
      return 0;
   int depth = 0;
   int start = -1;
   bool inStr = false;
   for(int i = a + 1; i < StringLen(body); i++)
     {
      ushort ch = StringGetCharacter(body, i);
      if(inStr)
        {
         if(ch == '\\')
            i++;
         else
            if(ch == '"')
               inStr = false;
         continue;
        }
      if(ch == '"')
         inStr = true;
      else
         if(ch == '{')
           {
            if(depth == 0)
               start = i;
            depth++;
           }
         else
            if(ch == '}')
              {
               depth--;
               if(depth == 0 && start >= 0)
                 {
                  string obj = StringSubstr(body, start, i - start + 1);
                  OhlcRequest r;
                  r.id = OhlcJsonRaw(obj, "id");
                  r.kind = OhlcJsonRaw(obj, "kind");
                  r.symbol = OhlcJsonRaw(obj, "symbol");
                  r.tf = OhlcJsonRaw(obj, "tf");
                  r.fromMs = StringToInteger(OhlcJsonRaw(obj, "from_ms"));
                  r.toMs = StringToInteger(OhlcJsonRaw(obj, "to_ms"));
                  bool okKind = r.kind == "ticks" || r.kind == "bars";
                  if(r.id != "" && r.symbol != "" && okKind && r.toMs >= r.fromMs)
                    {
                     int k = ArraySize(out);
                     ArrayResize(out, k + 1);
                     out[k] = r;
                    }
                  start = -1;
                 }
              }
            else
               if(ch == ']' && depth == 0)
                  break;
     }
   return ArraySize(out);
  }

#ifndef OHLC_NO_EVENTS
//=== EA: entradas, estado e eventos ========================================

input group "Envio"
input OhlcTransport InpTransport     = OHLC_HTTP;          // Transporte
input string        InpUrl           = "";                 // URL do webhook (.../ohlc/mt5)
input string        InpToken         = "";                 // Token (cabeçalho X-Feed-Token)
input group "Dados"
input string        InpSymbols       = "";                 // Ativos: vazio = do gráfico, * = Observação do Mercado, ou lista
input string        InpTimeframes    = "ALL";              // Tempos gráficos: ALL ou lista (M1,M5,H1,D1)
input int           InpHistoryBars   = 500;                // Velas do snapshot inicial por série
input OhlcBackfill  InpBackfill      = OHLC_BACKFILL_ON_DEMAND; // Histórico (backfill)
input string        InpBackfillFrom  = "";                 // Backfill completo a partir de (AAAA.MM.DD, vazio = tudo)
input bool          InpTicks         = true;               // Exportar ticks em tempo real
input string        InpTickSymbols   = "";                 // Ativos com ticks (vazio = os mesmos)
input int           InpTickSnapshotMin = 30;               // Minutos de ticks enviados ao iniciar
input group "Ritmo"
input int           InpIntervalMs    = 500;                // Intervalo de verificação (ms, mínimo 100)
input int           InpHeartbeatSec  = 15;                 // Heartbeat sem mudanças (s, 0 = desligado)
input int           InpMaxBarsPerSend  = 5000;             // Máximo de velas por envio
input int           InpMaxTicksPerSend = 20000;            // Máximo de ticks por envio
input group "Formato"
input bool          InpTimeUtc       = true;               // Horários em UTC (senão, da corretora)
input string        InpFileName      = "ohlc_feed.jsonl";  // Arquivo (modo arquivo)
input bool          InpFileCommon    = true;               // Arquivo na pasta comum dos terminais
input bool          InpVerbose       = false;              // Log detalhado

/** Uma série (ativo × tempo gráfico). */
struct OhlcSeries
  {
   string            symbol;
   int               sym;          // índice em g_syms
   ENUM_TIMEFRAMES   tf;
   bool              has;          // já enviou o snapshot
   MqlRates          last;         // última vela enviada com sucesso
   datetime          savedTime;    // última vela enviada antes de reiniciar (0 = nenhuma)
   datetime          bfCursor;     // próximo bloco do backfill termina aqui (0 = ainda não começou)
   bool              bfDone;
  };

/** Um ativo. */
struct OhlcSymbol
  {
   string            symbol;
   int               digits;
   string            chart;        // "bid" ou "last"
   long              seenMsc;      // time_msc do último tick com envio de velas bem-sucedido
   bool              ticks;        // exporta ticks
   bool              tickInit;
   long              tLastMsc;     // último tick enviado
   int               tSentAtLast;  // ticks já enviados com esse time_msc
  };

/** Trabalho em segundo plano: pedido da plataforma ou recuperação após queda. */
struct OhlcJob
  {
   string            requestId;    // "" = recuperação (catch-up)
   bool              ticks;
   string            symbol;
   ENUM_TIMEFRAMES   tf;
   datetime          from;         // velas: hora da corretora
   datetime          to;
   datetime          cursor;       // velas: o próximo bloco termina aqui
   long              fromMsc;      // ticks: time_msc da corretora
   long              toMsc;
   long              tCursor;
   int               tSkip;
   long              firstTick;    // primeiro tick encontrado (0 = nenhum)
   bool              reachedStart; // o pedido começa antes do início do histórico
   int               chunks;
   int               waits;        // tentativas com o histórico ainda carregando
   ulong             retryAt;
  };

/** Um pedaço pronto para enviar e o que ele confirma quando o envio dá certo. */
struct OhlcPart
  {
   bool              isTicks;
   int               idx;          // série ou ativo
   bool              snapshot;
   string            json;
   MqlRates          last;
   long              tLastMsc;
   int               tSentAtLast;
  };

OhlcSeries g_series[];
OhlcSymbol g_syms[];
OhlcJob    g_jobs[];
OhlcPart   g_parts[];
long       g_seq = 0;
long       g_offset = 0;
string     g_account = "";
string     g_server = "";
string     g_broker = "";
bool       g_http = true;
bool       g_file = false;
ulong      g_nextTry = 0;      // GetTickCount64 do próximo envio após falha
int        g_backoffMs = 0;
ulong      g_lastSend = 0;
ulong      g_lastCycle = 0;
ulong      g_pollUntil = 0;    // a plataforma pediu verificação mais frequente até aqui
long       g_pollMs = 0;
bool       g_dirty = false;
ulong      g_lastSave = 0;
int        g_failures = 0;
datetime   g_backfillFrom = 0;
string     g_stateFile = "";
int        g_bfNext = 0;       // próxima série do backfill completo

void Log(const string msg)
  {
   Print("OHLC Export: ", msg);
  }

void Debug(const string msg)
  {
   if(InpVerbose)
      Log(msg);
  }

int MaxBarsPerSend()
  {
   return MathMax(1, InpMaxBarsPerSend);
  }

int MaxTicksPerSend()
  {
   return MathMax(1, InpMaxTicksPerSend);
  }

datetime FirstDate(const string symbol, const ENUM_TIMEFRAMES tf)
  {
   long first = SeriesInfoInteger(symbol, tf, SERIES_SERVER_FIRSTDATE);
   if(first <= 0)
      first = SeriesInfoInteger(symbol, tf, SERIES_TERMINAL_FIRSTDATE);
   if(first <= 0)
      first = SeriesInfoInteger(symbol, tf, SERIES_FIRSTDATE);
   return (datetime)first;
  }

long NowMs()
  {
   return (long)TimeGMT() * 1000 + (long)(GetTickCount64() % 1000);
  }

//--- Estado salvo (MQL5/Files) -------------------------------------------------
int FindSeries(const string symbol, const string tfName)
  {
   for(int i = 0; i < ArraySize(g_series); i++)
      if(g_series[i].symbol == symbol && OhlcTfName(g_series[i].tf) == tfName)
         return i;
   return -1;
  }

int FindSym(const string symbol)
  {
   for(int i = 0; i < ArraySize(g_syms); i++)
      if(g_syms[i].symbol == symbol)
         return i;
   return -1;
  }

void SaveState()
  {
   int h = FileOpen(g_stateFile, FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(h == INVALID_HANDLE)
     {
      Log("não foi possível salvar o progresso em " + g_stateFile + " (erro " + IntegerToString(GetLastError()) + ")");
      return;
     }
   FileWriteString(h, "seq|" + IntegerToString(g_seq) + "\n");
   for(int i = 0; i < ArraySize(g_series); i++)
     {
      OhlcSeries s = g_series[i];
      datetime last = s.has ? s.last.time : s.savedTime;
      FileWriteString(h, "bar|" + s.symbol + "|" + OhlcTfName(s.tf) + "|" +
                      IntegerToString((long)last) + "|" + IntegerToString((long)s.bfCursor) + "|" +
                      (s.bfDone ? "1" : "0") + "\n");
     }
   for(int i = 0; i < ArraySize(g_syms); i++)
     {
      if(!g_syms[i].ticks || !g_syms[i].tickInit)
         continue;
      FileWriteString(h, "tick|" + g_syms[i].symbol + "|" + IntegerToString(g_syms[i].tLastMsc) + "|" +
                      IntegerToString(g_syms[i].tSentAtLast) + "\n");
     }
   FileClose(h);
   g_dirty = false;
   g_lastSave = GetTickCount64();
  }

void LoadState()
  {
   if(!FileIsExist(g_stateFile))
      return;
   int h = FileOpen(g_stateFile, FILE_READ | FILE_TXT | FILE_ANSI);
   if(h == INVALID_HANDLE)
      return;
   while(!FileIsEnding(h))
     {
      string line = FileReadString(h);
      string f[];
      int n = StringSplit(line, '|', f);
      if(n >= 2 && f[0] == "seq")
         g_seq = StringToInteger(f[1]);
      else
         if(n >= 6 && f[0] == "bar")
           {
            int i = FindSeries(f[1], f[2]);
            if(i < 0)
               continue;
            g_series[i].savedTime = (datetime)StringToInteger(f[3]);
            g_series[i].bfCursor = (datetime)StringToInteger(f[4]);
            g_series[i].bfDone = f[5] == "1";
           }
         else
            if(n >= 4 && f[0] == "tick")
              {
               int i = FindSym(f[1]);
               if(i < 0 || !g_syms[i].ticks)
                  continue;
               g_syms[i].tLastMsc = StringToInteger(f[2]);
               g_syms[i].tSentAtLast = (int)StringToInteger(f[3]);
               g_syms[i].tickInit = g_syms[i].tLastMsc > 0;
              }
     }
   FileClose(h);
  }

//--- Envio ------------------------------------------------------------------
bool AppendFile(const string line)
  {
   int flags = FILE_READ | FILE_WRITE | FILE_TXT | FILE_ANSI | FILE_SHARE_READ;
   if(InpFileCommon)
      flags |= FILE_COMMON;
   int h = FileOpen(InpFileName, flags, 0, CP_UTF8);
   if(h == INVALID_HANDLE)
     {
      Log("não foi possível abrir " + InpFileName + " (erro " + IntegerToString(GetLastError()) + ")");
      return false;
     }
   FileSeek(h, 0, SEEK_END);
   FileWriteString(h, line + "\n");
   FileClose(h);
   return true;
  }

void Fail(const string why)
  {
   g_backoffMs = g_backoffMs == 0 ? 1000 : MathMin(30000, g_backoffMs * 2);
   g_nextTry = GetTickCount64() + g_backoffMs;
   g_failures++;
   // Só a 1ª falha de uma sequência e depois a cada 10, para não lotar o log
   if(g_failures == 1 || g_failures % 10 == 0 || InpVerbose)
      Log(why + " | nova tentativa em " + IntegerToString(g_backoffMs / 1000) + " s (falhas seguidas: " +
          IntegerToString(g_failures) + ")");
  }

void HandleResponse(const string body);

/** POST (e/ou linha no arquivo) de um envelope. true só com resposta 2xx. */
bool Send(const string type, const string requestId, const string series,
          const string ticks, const string extra)
  {
   g_seq++;
   g_dirty = true;
   string body = OhlcEnvelopeJson(type, g_account, g_server, g_broker, g_offset, InpTimeUtc,
                                  NowMs(), g_seq, requestId, series, ticks, extra);
   g_lastSend = GetTickCount64();
   if(g_file && !AppendFile(body) && !g_http)
     {
      Fail("falha ao gravar o arquivo");
      return false;
     }
   if(!g_http)
      return true;
   char data[];
   char result[];
   string resultHeaders;
   int len = StringToCharArray(body, data, 0, WHOLE_ARRAY, CP_UTF8) - 1;
   ArrayResize(data, MathMax(0, len));
   string headers = "Content-Type: application/json\r\n";
   if(InpToken != "")
      headers += "X-Feed-Token: " + InpToken + "\r\n";
   ResetLastError();
   int code = WebRequest("POST", InpUrl, headers, 5000, data, result, resultHeaders);
   if(code == -1)
     {
      int err = GetLastError();
      if(err == 4014)
         Fail("URL não liberada. Ferramentas → Opções → Expert Advisors → Permitir WebRequest para a URL: " + InpUrl);
      else
         Fail("erro de WebRequest " + IntegerToString(err) + " (rede ou plataforma fora do ar)");
      return false;
     }
   string answer = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
   if(code < 200 || code > 299)
     {
      if(code == 401)
         Fail("HTTP 401: token inválido. Copie de novo a URL do webhook com o token.");
      else
         Fail("HTTP " + IntegerToString(code) + " " + StringSubstr(answer, 0, 200));
      return false;
     }
   if(g_failures > 0)
      Log("conexão restabelecida após " + IntegerToString(g_failures) + " falha(s); reenviando o que faltou");
   g_failures = 0;
   g_backoffMs = 0;
   g_nextTry = 0;
   Debug(type + " seq " + IntegerToString(g_seq) + " (" + IntegerToString(len) + " bytes) → HTTP " +
         IntegerToString(code));
   HandleResponse(answer);
   return true;
  }

bool Ready()
  {
   return GetTickCount64() >= g_nextTry;
  }

//--- Pedidos sob demanda --------------------------------------------------------
bool HasJob(const string requestId)
  {
   for(int i = 0; i < ArraySize(g_jobs); i++)
      if(g_jobs[i].requestId == requestId)
         return true;
   return false;
  }

void AddJob(OhlcJob &job)
  {
   int k = ArraySize(g_jobs);
   ArrayResize(g_jobs, k + 1);
   g_jobs[k] = job;
  }

void InitJob(OhlcJob &j)
  {
   j.requestId = "";
   j.ticks = false;
   j.symbol = "";
   j.tf = PERIOD_M1;
   j.from = 0;
   j.to = 0;
   j.cursor = 0;
   j.fromMsc = 0;
   j.toMsc = 0;
   j.tCursor = 0;
   j.tSkip = 0;
   j.firstTick = 0;
   j.reachedStart = false;
   j.chunks = 0;
   j.waits = 0;
   j.retryAt = 0;
  }

/** Recuperação: velas entre a última enviada antes de cair e o snapshot. */
void AddCatchUpBars(const string symbol, const ENUM_TIMEFRAMES tf, const datetime from,
                    const datetime to)
  {
   if(to < from)
      return;
   OhlcJob j;
   InitJob(j);
   j.symbol = symbol;
   j.tf = tf;
   j.from = from;
   j.to = to;
   j.cursor = to;
   AddJob(j);
   Debug("recuperando " + symbol + " " + OhlcTfName(tf) + " de " + TimeToString(from) + " a " + TimeToString(to));
  }

void AddCatchUpTicks(const string symbol, const long fromMsc, const int skip, const long toMsc)
  {
   if(toMsc < fromMsc)
      return;
   OhlcJob j;
   InitJob(j);
   j.ticks = true;
   j.symbol = symbol;
   j.fromMsc = fromMsc;
   j.toMsc = toMsc;
   j.tCursor = fromMsc;
   j.tSkip = skip;
   AddJob(j);
   Debug("recuperando ticks de " + symbol);
  }

void HandleResponse(const string body)
  {
   OhlcRequest reqs[];
   long nextMs = 0;
   int n = OhlcParseRequests(body, reqs, nextMs);
   if(nextMs > 0)
     {
      g_pollMs = MathMax(100, nextMs);
      g_pollUntil = GetTickCount64() + 60000;
     }
   for(int i = 0; i < n; i++)
     {
      if(HasJob(reqs[i].id))
         continue;
      OhlcJob j;
      InitJob(j);
      j.requestId = reqs[i].id;
      j.symbol = reqs[i].symbol;
      j.ticks = reqs[i].kind == "ticks";
      if(!SymbolSelect(j.symbol, true))
        {
         Send("history", j.requestId, "", "", ",\"done\":true,\"error\":\"ativo desconhecido: " + OhlcEsc(j.symbol) + "\"");
         continue;
        }
      if(j.ticks)
        {
         j.fromMsc = OhlcMscFromMs(reqs[i].fromMs, InpTimeUtc, g_offset);
         j.toMsc = OhlcMscFromMs(reqs[i].toMs, InpTimeUtc, g_offset);
         j.tCursor = j.fromMsc;
        }
      else
        {
         if(!OhlcTfParse(reqs[i].tf, j.tf))
           {
            Send("history", j.requestId, "", "", ",\"done\":true,\"error\":\"tempo gráfico inválido: " + OhlcEsc(reqs[i].tf) + "\"");
            continue;
           }
         j.from = OhlcFromMs(reqs[i].fromMs, InpTimeUtc, g_offset);
         j.to = OhlcFromMs(reqs[i].toMs, InpTimeUtc, g_offset);
         j.cursor = j.to;
        }
      AddJob(j);
      Log("pedido " + j.requestId + ": " + (j.ticks ? "ticks" : "velas " + OhlcTfName(j.tf)) + " de " + j.symbol);
     }
  }

void RemoveJob(const int i)
  {
   int n = ArraySize(g_jobs);
   for(int k = i; k < n - 1; k++)
      g_jobs[k] = g_jobs[k + 1];
   ArrayResize(g_jobs, n - 1);
  }

/** Fim de um pedido (ou de uma recuperação). Retorna false se o envio falhou. */
bool FinishJob(const int i, const string extra)
  {
   OhlcJob j = g_jobs[i];
   if(j.requestId != "" && !Send("history", j.requestId, "", "", ",\"done\":true" + extra))
      return false;
   if(j.requestId != "")
      Log("pedido " + j.requestId + " concluído (" + IntegerToString(j.chunks) + " blocos)");
   RemoveJob(i);
   return true;
  }

/** Histórico ainda carregando no terminal (erro 4401 ou série não sincronizada). */
bool Loading(const string symbol, const ENUM_TIMEFRAMES tf, const int err)
  {
   return err == 4401 || err == ERR_HISTORY_NOT_FOUND ||
          !(bool)SeriesInfoInteger(symbol, tf, SERIES_SYNCHRONIZED);
  }

/** Um bloco de velas de um pedido/recuperação. */
void RunBarsJob(const int i)
  {
   OhlcJob j = g_jobs[i];
   int sym = FindSym(j.symbol);
   int digits = sym >= 0 ? g_syms[sym].digits : (int)SymbolInfoInteger(j.symbol, SYMBOL_DIGITS);
   datetime first = FirstDate(j.symbol, j.tf);
   datetime from = j.from;
   if(first > 0 && from < first)
     {
      from = first;
      g_jobs[i].reachedStart = true;
     }
   long firstMs = first > 0 ? OhlcMs(first, InpTimeUtc, g_offset) : 0;
   datetime cf, ct;
   int maxBars = MathMin(MaxBarsPerSend(), OHLC_PART_MAX * 2 / 100);
   if(!OhlcChunk(j.cursor, from, OhlcTfStep(j.tf), maxBars, cf, ct))
     {
      string extra = g_jobs[i].reachedStart && firstMs > 0 ? ",\"first_ms\":" + IntegerToString(firstMs) : "";
      FinishJob(i, extra);
      return;
     }
   MqlRates rates[];
   ResetLastError();
   int n = CopyRates(j.symbol, j.tf, cf, ct, rates);
   if(n < 0 || (n == 0 && Loading(j.symbol, j.tf, GetLastError())))
     {
      // Histórico ainda baixando: tenta de novo depois, sem tratar como falha
      g_jobs[i].waits++;
      g_jobs[i].retryAt = GetTickCount64() + 1000;
      if(g_jobs[i].waits % 30 == 1)
         Log("aguardando o histórico de " + j.symbol + " " + OhlcTfName(j.tf) + " carregar no terminal…");
      if(g_jobs[i].waits < 120)
         return;
      n = 0;
     }
   string rows = "";
   for(int k = 0; k < n; k++)
      rows += (k > 0 ? "," : "") + OhlcRateJson(rates[k], digits, InpTimeUtc, g_offset);
   string series = OhlcSeriesJson(j.symbol, j.tf, digits, rows, true,
                                  OhlcMs(cf, InpTimeUtc, g_offset), OhlcMs(ct, InpTimeUtc, g_offset), firstMs);
   if(!Send("history", j.requestId, series, "", ""))
      return;
   g_jobs[i].waits = 0;
   g_jobs[i].chunks++;
   g_jobs[i].cursor = cf - 1;
  }

/** Um bloco de ticks de um pedido/recuperação (do mais antigo ao mais novo). */
void RunTicksJob(const int i)
  {
   OhlcJob j = g_jobs[i];
   int sym = FindSym(j.symbol);
   int digits = sym >= 0 ? g_syms[sym].digits : (int)SymbolInfoInteger(j.symbol, SYMBOL_DIGITS);
   string chart = sym >= 0 ? g_syms[sym].chart :
                  (SymbolInfoInteger(j.symbol, SYMBOL_CHART_MODE) == SYMBOL_CHART_MODE_LAST ? "last" : "bid");
   int maxTicks = MathMin(MaxTicksPerSend(), OHLC_PART_MAX * 2 / 60);
   MqlTick ticks[];
   long winFrom = j.tCursor;
   long winTo = winFrom;
   int n = 0;
   // Janelas de 15 min até achar ticks (fins de semana não têm nenhum)
   for(int w = 0; w < 96 && winFrom <= j.toMsc; w++)
     {
      winTo = MathMin(j.toMsc, winFrom + 15 * 60000 - 1);
      ResetLastError();
      n = CopyTicksRange(j.symbol, ticks, COPY_TICKS_ALL, (ulong)winFrom, (ulong)winTo);
      if(n < 0)
        {
         g_jobs[i].waits++;
         g_jobs[i].retryAt = GetTickCount64() + 1000;
         if(g_jobs[i].waits < 60)
            return;
         n = 0;
        }
      int skip = OhlcTickSkip(ticks, n, j.tCursor, j.tSkip);
      if(n - skip > 0)
         break;
      // Janela vazia: segue para a próxima
      n = 0;
      winFrom = winTo + 1;
      g_jobs[i].tCursor = winFrom;
      g_jobs[i].tSkip = 0;
      j.tCursor = winFrom;
      j.tSkip = 0;
     }
   if(n == 0)
     {
      if(winFrom > j.toMsc)
        {
         string extra = "";
         // Sem ticks onde há velas M1: o histórico de ticks da corretora acaba aqui
         long noTicksUntil = j.firstTick > 0 ? j.firstTick : j.toMsc;
         if(noTicksUntil - j.fromMsc > 300000 &&
            Bars(j.symbol, PERIOD_M1, (datetime)(j.fromMsc / 1000), (datetime)(noTicksUntil / 1000) - 60) > 0)
            extra = ",\"ticks_end_ms\":" + IntegerToString(OhlcMscMs(noTicksUntil, InpTimeUtc, g_offset));
         if(j.requestId == "")
           {
            RemoveJob(i);
            return;
           }
         FinishJob(i, extra);
        }
      return;
     }
   int skip = OhlcTickSkip(ticks, n, j.tCursor, j.tSkip);
   int end = MathMin(n, skip + maxTicks);
   string rows = "";
   for(int k = skip; k < end; k++)
      rows += (k > skip ? "," : "") + OhlcTickJson(ticks[k], digits, InpTimeUtc, g_offset);
   long cursor = j.tCursor;
   int sent = j.tSkip;
   OhlcTickAdvance(ticks, skip, end, cursor, sent);
   // O bloco cobre do cursor até o último tick enviado (ou o fim da janela, se acabou)
   long blockTo = end == n ? winTo : ticks[end - 1].time_msc;
   string block = OhlcTicksJson(j.symbol, digits, chart, rows, true,
                                OhlcMscMs(j.tCursor, InpTimeUtc, g_offset), OhlcMscMs(blockTo, InpTimeUtc, g_offset));
   if(!Send("history", j.requestId, "", block, ""))
      return;
   if(g_jobs[i].firstTick == 0)
      g_jobs[i].firstTick = ticks[skip].time_msc;
   g_jobs[i].chunks++;
   if(end == n)
     {
      g_jobs[i].tCursor = winTo + 1;
      g_jobs[i].tSkip = 0;
     }
   else
     {
      g_jobs[i].tCursor = cursor;
      g_jobs[i].tSkip = sent;
     }
  }

/** Um bloco de trabalho em segundo plano: pedidos > recuperação > backfill completo. */
void RunBackground()
  {
   ulong now = GetTickCount64();
   for(int pass = 0; pass < 2; pass++)
      for(int i = 0; i < ArraySize(g_jobs); i++)
        {
         bool request = g_jobs[i].requestId != "";
         if((pass == 0) != request || g_jobs[i].retryAt > now)
            continue;
         if(g_jobs[i].ticks)
            RunTicksJob(i);
         else
            RunBarsJob(i);
         return;
        }
   if(InpBackfill == OHLC_BACKFILL_FULL)
      RunFullBackfill();
  }

/** Backfill completo: ativo por ativo, tf por tf, até o início do histórico. */
void RunFullBackfill()
  {
   int total = ArraySize(g_series);
   for(int k = 0; k < total; k++)
     {
      int i = (g_bfNext + k) % total;
      OhlcSeries s = g_series[i];
      if(s.bfDone || !s.has)
         continue;
      g_bfNext = i;
      datetime first = FirstDate(s.symbol, s.tf);
      if(g_backfillFrom > first)
         first = g_backfillFrom;
      if(first <= 0)
         return;   // início ainda desconhecido: espera sincronizar
      if(s.bfCursor == 0)
        {
         // Começa logo antes da vela mais antiga do snapshot
         MqlRates r[];
         if(CopyRates(s.symbol, s.tf, 0, MathMax(1, InpHistoryBars), r) <= 0)
            return;
         g_series[i].bfCursor = r[0].time - 1;
         s.bfCursor = g_series[i].bfCursor;
        }
      int digits = g_syms[s.sym].digits;
      long firstMs = OhlcMs(first, InpTimeUtc, g_offset);
      datetime cf, ct;
      int maxBars = MathMin(MaxBarsPerSend(), OHLC_PART_MAX * 2 / 100);
      if(!OhlcChunk(s.bfCursor, first, OhlcTfStep(s.tf), maxBars, cf, ct))
        {
         g_series[i].bfDone = true;
         g_dirty = true;
         Log("backfill completo de " + s.symbol + " " + OhlcTfName(s.tf) + " até " + TimeToString(first));
         continue;
        }
      MqlRates rates[];
      ResetLastError();
      int n = CopyRates(s.symbol, s.tf, cf, ct, rates);
      if(n < 0 || (n == 0 && Loading(s.symbol, s.tf, GetLastError())))
         return;   // ainda carregando: tenta no próximo ciclo
      string rows = "";
      for(int r = 0; r < n; r++)
         rows += (r > 0 ? "," : "") + OhlcRateJson(rates[r], digits, InpTimeUtc, g_offset);
      string series = OhlcSeriesJson(s.symbol, s.tf, digits, rows, true,
                                     OhlcMs(cf, InpTimeUtc, g_offset), OhlcMs(ct, InpTimeUtc, g_offset), firstMs);
      if(Send("history", "", series, "", ""))
        {
         g_series[i].bfCursor = cf - 1;
         Debug("backfill " + s.symbol + " " + OhlcTfName(s.tf) + ": " + IntegerToString(n) + " velas até " + TimeToString(cf));
        }
      return;
     }
  }

//--- Tempo real ------------------------------------------------------------------
void AddPart(OhlcPart &p)
  {
   int k = ArraySize(g_parts);
   ArrayResize(g_parts, k + 1);
   g_parts[k] = p;
  }

/** Registra chamadas do MT5 que demoram (diagnóstico de ciclos lentos). */
void Slow(const ulong since, const string what, const OhlcSeries &s)
  {
   ulong ms = GetTickCount64() - since;
   if(ms > 300)
      Log(StringFormat("%s %s %s demorou %I64u ms", what, s.symbol, OhlcTfName(s.tf), ms));
  }

/** Velas novas/alteradas de uma série → pedaços (ainda não enviados). */
void CollectSeries(const int i)
  {
   OhlcSeries s = g_series[i];
   int digits = g_syms[s.sym].digits;
   int count = MathMax(1, InpHistoryBars);
   bool snapshot = !s.has;
   if(s.has)
     {
      ulong w = GetTickCount64();
      int shift = iBarShift(s.symbol, s.tf, s.last.time, false);
      Slow(w, "iBarShift", s);
      if(shift < 0)
         return;   // série ainda não carregada
      count = shift + 1;
     }
   bool gap = count > MathMax(1, InpHistoryBars);
   if(gap)
      count = MathMax(1, InpHistoryBars);
   // Só o que o terminal já tem: pedir mais trava o EA até ~30 s esperando o
   // download (ex.: MN1 com menos de InpHistoryBars velas) e atrasa o tempo real
   ulong w0 = GetTickCount64();
   int avail = Bars(s.symbol, s.tf);
   Slow(w0, "Bars", s);
   if(avail <= 0)
      return;   // série ainda sendo montada: tenta no próximo ciclo
   count = MathMin(count, avail);
   MqlRates rates[];
   ulong w1 = GetTickCount64();
   int n = CopyRates(s.symbol, s.tf, 0, count, rates);
   Slow(w1, "CopyRates", s);
   if(n <= 0)
      return;
   if(snapshot && s.savedTime > 0 && s.savedTime < rates[0].time)
     {
      // Reinício: o que ficou entre a última vela enviada e o snapshot vai como histórico
      AddCatchUpBars(s.symbol, s.tf, s.savedTime, rates[0].time - 1);
      g_series[i].savedTime = 0;
     }
   else
      if(gap && s.has && !HasCatchUp(s.symbol, s.tf))
         AddCatchUpBars(s.symbol, s.tf, s.last.time, rates[0].time - 1);
   int start = OhlcFirstChanged(rates, n, s.last, s.has);
   if(start >= n)
      return;
   long firstMs = 0;
   if(snapshot)
     {
      ulong w2 = GetTickCount64();
      datetime first = FirstDate(s.symbol, s.tf);
      Slow(w2, "FirstDate", s);
      firstMs = first > 0 ? OhlcMs(first, InpTimeUtc, g_offset) : 0;
     }
   int maxBars = MaxBarsPerSend();
   string rows = "";
   int inPart = 0;
   for(int k = start; k < n; k++)
     {
      string row = OhlcRateJson(rates[k], digits, InpTimeUtc, g_offset);
      rows += (inPart > 0 ? "," : "") + row;
      inPart++;
      if(k == n - 1 || StringLen(rows) > OHLC_PART_MAX || inPart >= maxBars)
        {
         OhlcPart p;
         p.isTicks = false;
         p.idx = i;
         p.snapshot = snapshot;
         p.json = OhlcSeriesJson(s.symbol, s.tf, digits, rows, false, 0, 0, firstMs);
         p.last = rates[k];
         p.tLastMsc = 0;
         p.tSentAtLast = 0;
         AddPart(p);
         rows = "";
         inPart = 0;
        }
     }
  }

bool HasCatchUp(const string symbol, const ENUM_TIMEFRAMES tf)
  {
   for(int i = 0; i < ArraySize(g_jobs); i++)
      if(g_jobs[i].requestId == "" && !g_jobs[i].ticks && g_jobs[i].symbol == symbol && g_jobs[i].tf == tf)
         return true;
   return false;
  }

/** Ticks novos de um ativo → pedaços (ainda não enviados). */
void CollectTicks(const int i)
  {
   OhlcSymbol s = g_syms[i];
   long nowMsc = (long)TimeTradeServer() * 1000;
   long from = s.tLastMsc;
   if(!s.tickInit)
      from = nowMsc - (long)MathMax(0, InpTickSnapshotMin) * 60000;
   else
      if(s.tLastMsc < nowMsc - (long)MathMax(1, InpTickSnapshotMin) * 60000 && !HasTickCatchUp(s.symbol))
        {
         // Reinício depois de muito tempo: o trecho antigo vai em segundo plano
         long cut = nowMsc - (long)MathMax(1, InpTickSnapshotMin) * 60000;
         AddCatchUpTicks(s.symbol, s.tLastMsc, s.tSentAtLast, cut - 1);
         g_syms[i].tLastMsc = cut;
         g_syms[i].tSentAtLast = 0;
         from = cut;
         s.tLastMsc = cut;
         s.tSentAtLast = 0;
        }
   // Até o último tick conhecido: com to = 0 ("até agora") o terminal pode
   // esperar a sincronização com o servidor e travar o ciclo por dezenas de segundos
   MqlTick now;
   if(!SymbolInfoTick(s.symbol, now) || now.time_msc < from)
      return;
   MqlTick ticks[];
   int n = CopyTicksRange(s.symbol, ticks, COPY_TICKS_ALL, (ulong)MathMax(0, from), (ulong)now.time_msc);
   if(n <= 0)
     {
      if(!s.tickInit && n == 0)
        {
         // Sem ticks recentes (mercado fechado): começa a partir de agora
         g_syms[i].tickInit = true;
         g_syms[i].tLastMsc = from;
         g_syms[i].tSentAtLast = 0;
        }
      return;
     }
   int skip = s.tickInit ? OhlcTickSkip(ticks, n, s.tLastMsc, s.tSentAtLast) : 0;
   int end = MathMin(n, skip + MaxTicksPerSend());
   if(end <= skip)
      return;
   if(end < n)
      g_syms[i].seenMsc = 0;   // ainda há ticks: o próximo ciclo continua
   long lastMsc = s.tickInit ? s.tLastMsc : 0;
   int sentAtLast = s.tickInit ? s.tSentAtLast : 0;
   string rows = "";
   int partStart = skip;
   for(int k = skip; k < end; k++)
     {
      rows += (k > partStart ? "," : "") + OhlcTickJson(ticks[k], s.digits, InpTimeUtc, g_offset);
      if(k == end - 1 || StringLen(rows) > OHLC_PART_MAX)
        {
         OhlcTickAdvance(ticks, partStart, k + 1, lastMsc, sentAtLast);
         OhlcPart p;
         p.isTicks = true;
         p.idx = i;
         p.snapshot = false;
         p.json = OhlcTicksJson(s.symbol, s.digits, s.chart, rows, false, 0, 0);
         p.tLastMsc = lastMsc;
         p.tSentAtLast = sentAtLast;
         AddPart(p);
         rows = "";
         partStart = k + 1;
        }
     }
  }

bool HasTickCatchUp(const string symbol)
  {
   for(int i = 0; i < ArraySize(g_jobs); i++)
      if(g_jobs[i].requestId == "" && g_jobs[i].ticks && g_jobs[i].symbol == symbol)
         return true;
   return false;
  }

/** Confirma o estado de um pedaço enviado com sucesso. */
void Commit(const OhlcPart &p)
  {
   if(p.isTicks)
     {
      g_syms[p.idx].tickInit = true;
      g_syms[p.idx].tLastMsc = p.tLastMsc;
      g_syms[p.idx].tSentAtLast = p.tSentAtLast;
      return;
     }
   g_series[p.idx].has = true;
   g_series[p.idx].last = p.last;
  }

/** Envia os pedaços em envelopes de até OHLC_BODY_MAX bytes. false se algum falhou. */
bool Flush()
  {
   int n = ArraySize(g_parts);
   int i = 0;
   int envelopes = 0;
   while(i < n)
     {
      if(envelopes >= 8)
        {
         // O resto vai no próximo ciclo (o estado não avançou)
         for(int s = 0; s < ArraySize(g_syms); s++)
            g_syms[s].seenMsc = 0;
         return true;
        }
      string series = "";
      string ticks = "";
      bool snapshot = false;
      int size = 0;
      int bars = 0;
      int j = i;
      for(; j < n; j++)
        {
         int len = StringLen(g_parts[j].json) + 1;
         if(j > i && size + len > OHLC_BODY_MAX)
            break;
         size += len;
         if(g_parts[j].isTicks)
            ticks += (ticks == "" ? "" : ",") + g_parts[j].json;
         else
           {
            series += (series == "" ? "" : ",") + g_parts[j].json;
            snapshot = snapshot || g_parts[j].snapshot;
            bars++;
           }
        }
      string type = snapshot ? "snapshot" : (bars > 0 ? "update" : "ticks");
      if(!Send(type, "", series, ticks, ""))
         return false;
      for(int k = i; k < j; k++)
         Commit(g_parts[k]);
      envelopes++;
      i = j;
     }
   return true;
  }

void Cycle()
  {
   g_lastCycle = GetTickCount64();
   if(!Ready())
      return;
   g_offset = OhlcOffsetSec(TimeTradeServer(), TimeGMT());
   ArrayResize(g_parts, 0);
   bool changed[];
   ArrayResize(changed, ArraySize(g_syms));
   for(int s = 0; s < ArraySize(g_syms); s++)
     {
      MqlTick tk;
      changed[s] = SymbolInfoTick(g_syms[s].symbol, tk) && tk.time_msc != g_syms[s].seenMsc;
      if(changed[s])
         g_syms[s].seenMsc = tk.time_msc;
     }
   ulong t0 = GetTickCount64();
   for(int i = 0; i < ArraySize(g_series); i++)
      if(!g_series[i].has || changed[g_series[i].sym])
         CollectSeries(i);
   ulong t1 = GetTickCount64();
   for(int s = 0; s < ArraySize(g_syms); s++)
      if(g_syms[s].ticks && (changed[s] || !g_syms[s].tickInit))
         CollectTicks(s);
   ulong t2 = GetTickCount64();
   bool sent = ArraySize(g_parts) > 0;
   bool flushed = Flush();
   ulong t3 = GetTickCount64();
   if(t3 - t0 > 1000)
      Log(StringFormat("ciclo lento: velas %I64u ms, ticks %I64u ms, envio %I64u ms", t1 - t0, t2 - t1, t3 - t2));
   if(!flushed)
     {
      // Falhou: o próximo ciclo recalcula tudo o que falta (velas e ticks)
      for(int s = 0; s < ArraySize(g_syms); s++)
         g_syms[s].seenMsc = 0;
      return;
     }
   if(!Ready())
      return;
   int jobs = ArraySize(g_jobs);
   ulong before = g_lastSend;
   RunBackground();
   sent = sent || g_lastSend != before || ArraySize(g_jobs) != jobs;
   ulong now = GetTickCount64();
   long every = InpHeartbeatSec > 0 ? (long)InpHeartbeatSec * 1000 : 0;
   if(g_pollUntil > now && g_pollMs > 0 && g_http)
      every = every > 0 ? MathMin(every, g_pollMs) : g_pollMs;
   if(!sent && every > 0 && now - g_lastSend >= (ulong)every && Ready())
      Send("heartbeat", "", "", "", "");
   if(g_dirty && now - g_lastSave > 5000)
      SaveState();
  }

//--- Configuração ------------------------------------------------------------------
bool AddSymbol(const string symbol, const bool ticks)
  {
   if(!SymbolSelect(symbol, true))
     {
      Log("ativo desconhecido na corretora: " + symbol);
      return false;
     }
   int k = ArraySize(g_syms);
   ArrayResize(g_syms, k + 1);
   g_syms[k].symbol = symbol;
   g_syms[k].digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
   g_syms[k].chart = SymbolInfoInteger(symbol, SYMBOL_CHART_MODE) == SYMBOL_CHART_MODE_LAST ? "last" : "bid";
   g_syms[k].seenMsc = 0;
   g_syms[k].ticks = ticks;
   g_syms[k].tickInit = false;
   g_syms[k].tLastMsc = 0;
   g_syms[k].tSentAtLast = 0;
   return true;
  }

int OnInit()
  {
   bool tester = (bool)MQLInfoInteger(MQL_TESTER);
   g_http = !tester && InpTransport != OHLC_FILE;
   g_file = tester || InpTransport != OHLC_HTTP;
   if(tester && InpTransport == OHLC_HTTP)
      Log("no testador de estratégia o WebRequest não funciona: usando o modo arquivo (" + InpFileName + ")");
   if(g_http && InpUrl == "")
     {
      Log("preencha InpUrl com a URL do webhook (.../ohlc/mt5?token=…).");
      return INIT_PARAMETERS_INCORRECT;
     }
   string symbols[];
   string list = OhlcTrim(InpSymbols);
   if(list == "")
     {
      ArrayResize(symbols, 1);
      symbols[0] = _Symbol;
     }
   else
      if(list == "*")
        {
         int total = SymbolsTotal(true);
         ArrayResize(symbols, total);
         for(int i = 0; i < total; i++)
            symbols[i] = SymbolName(i, true);
        }
      else
         OhlcSplit(list, symbols);
   string tickList[];
   if(OhlcTrim(InpTickSymbols) == "")
      ArrayCopy(tickList, symbols);
   else
      OhlcSplit(InpTickSymbols, tickList);
   for(int i = 0; i < ArraySize(symbols); i++)
      AddSymbol(symbols[i], InpTicks && OhlcHas(tickList, symbols[i]));
   ENUM_TIMEFRAMES tfs[];
   string bad;
   OhlcParseTfs(InpTimeframes, tfs, bad);
   if(bad != "")
      Log("tempos gráficos ignorados (desconhecidos): " + bad);
   if(ArraySize(g_syms) == 0 || ArraySize(tfs) == 0)
     {
      Log("nenhum ativo ou tempo gráfico válido.");
      return INIT_PARAMETERS_INCORRECT;
     }
   for(int s = 0; s < ArraySize(g_syms); s++)
      for(int t = 0; t < ArraySize(tfs); t++)
        {
         int k = ArraySize(g_series);
         ArrayResize(g_series, k + 1);
         g_series[k].symbol = g_syms[s].symbol;
         g_series[k].sym = s;
         g_series[k].tf = tfs[t];
         g_series[k].has = false;
         ZeroMemory(g_series[k].last);
         g_series[k].savedTime = 0;
         g_series[k].bfCursor = 0;
         g_series[k].bfDone = false;
        }
   g_backfillFrom = OhlcTrim(InpBackfillFrom) == "" ? 0 : StringToTime(InpBackfillFrom);
   g_account = IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN));
   g_server = AccountInfoString(ACCOUNT_SERVER);
   g_broker = AccountInfoString(ACCOUNT_COMPANY);
   g_offset = OhlcOffsetSec(TimeTradeServer(), TimeGMT());
   g_stateFile = "ohlc_export_" + g_account + (tester ? "_tester" : "") + ".state";
   if(!tester)
      LoadState();
   int ms = MathMax(100, InpIntervalMs);
   EventSetMillisecondTimer(ms);
   Log(StringFormat("v1.00 | %d ativo(s) × %d tempo(s) gráfico(s) | ticks: %s | backfill: %s | %s | a cada %d ms",
                    ArraySize(g_syms), ArraySize(tfs), InpTicks ? "sim" : "não",
                    InpBackfill == OHLC_BACKFILL_FULL ? "completo" :
                    (InpBackfill == OHLC_BACKFILL_NONE ? "nenhum" : "sob demanda"),
                    g_http ? (g_file ? "HTTP + arquivo" : "HTTP") : "arquivo", ms));
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
   if(ArraySize(g_series) > 0)
      SaveState();
  }

void OnTimer()
  {
   Cycle();
  }

void OnTick()
  {
   // O ativo do gráfico também dispara o ciclo (respeitando o mínimo de 100 ms)
   if(GetTickCount64() - g_lastCycle >= 100)
      Cycle();
  }
#endif
//+------------------------------------------------------------------+
