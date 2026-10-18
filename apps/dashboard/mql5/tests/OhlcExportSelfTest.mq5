//+------------------------------------------------------------------+
//|                                           OhlcExportSelfTest.mq5 |
//| Autoteste das funções puras do CasaBrasaOHLCExport.mq5.           |
//|                                                                  |
//| Rodar: copie esta pasta e public/journal/ mantendo a estrutura   |
//| (o #include é relativo), compile e arraste o script num gráfico. |
//| Resultado em MQL5/Files/ohlc_selftest.txt ("PASS n" ou as        |
//| falhas). Também grava os fixtures usados pelos testes TS:        |
//| ohlc_fixture_snapshot.json, ohlc_fixture_ticks.json,             |
//| ohlc_fixture_history.json e ohlc_fixture_heartbeat.json.         |
//+------------------------------------------------------------------+
#property copyright "Casa Brasa"
#property version   "1.00"
#property strict
#property script_show_inputs false

#define OHLC_NO_EVENTS
#include "../../public/journal/CasaBrasaOHLCExport.mq5"

int    g_pass = 0;
string g_fail = "";

void Check(const bool ok, const string name)
  {
   if(ok)
      g_pass++;
   else
      g_fail += "FAIL " + name + "\n";
  }

void Eq(const string got, const string want, const string name)
  {
   if(got == want)
      g_pass++;
   else
      g_fail += "FAIL " + name + "\n  got:  " + got + "\n  want: " + want + "\n";
  }

void EqL(const long got, const long want, const string name)
  {
   Eq(IntegerToString(got), IntegerToString(want), name);
  }

MqlRates Rate(const datetime t, const double o, const double h, const double l, const double c,
              const long tv, const long rv, const int sp)
  {
   MqlRates r;
   r.time = t;
   r.open = o;
   r.high = h;
   r.low = l;
   r.close = c;
   r.tick_volume = tv;
   r.real_volume = rv;
   r.spread = sp;
   return r;
  }

MqlTick Tick(const long msc, const double bid, const double ask, const double last,
             const ulong vol, const uint flags)
  {
   MqlTick t;
   ZeroMemory(t);
   t.time = (datetime)(msc / 1000);
   t.time_msc = msc;
   t.bid = bid;
   t.ask = ask;
   t.last = last;
   t.volume = vol;
   t.volume_real = (double)vol;
   t.flags = flags;
   return t;
  }

void WriteFile(const string name, const string text)
  {
   int h = FileOpen(name, FILE_WRITE | FILE_TXT | FILE_ANSI, 0, CP_UTF8);
   if(h == INVALID_HANDLE)
     {
      g_fail += "FAIL write " + name + "\n";
      return;
     }
   FileWriteString(h, text);
   FileClose(h);
  }

//--- Tempos gráficos -------------------------------------------------
void TestTimeframes()
  {
   int ok = 0;
   for(int i = 0; i < OHLC_TF_COUNT; i++)
     {
      ENUM_TIMEFRAMES tf;
      if(OhlcTfParse(OhlcTfName(OHLC_TFS[i]), tf) && tf == OHLC_TFS[i])
         ok++;
     }
   EqL(ok, 21, "21 tf ida e volta");
   ENUM_TIMEFRAMES tf;
   Check(OhlcTfParse("h4", tf) && tf == PERIOD_H4, "alias h4");
   Check(OhlcTfParse(" MN ", tf) && tf == PERIOD_MN1, "alias MN");
   Check(OhlcTfParse("mn1", tf) && tf == PERIOD_MN1, "alias mn1");
   Check(OhlcTfParse("D", tf) && tf == PERIOD_D1, "alias D");
   Check(!OhlcTfParse("M7", tf), "tf desconhecido M7");
   Check(!OhlcTfParse("", tf), "tf vazio");
   EqL(OhlcTfSeconds(PERIOD_M1), 60, "M1 = 60 s");
   EqL(OhlcTfSeconds(PERIOD_H4), 14400, "H4 = 14400 s");
   EqL(OhlcTfSeconds(PERIOD_W1), 604800, "W1 = 604800 s");
   EqL(OhlcTfSeconds(PERIOD_MN1), 2592000, "MN1 = 30 dias");
   Eq(OhlcTfName(PERIOD_M12), "M12", "nome M12");
  }

//--- Listas -----------------------------------------------------------
void TestLists()
  {
   string out[];
   EqL(OhlcSplit(" EURUSD, XAUUSD;US30  EURUSD,, ", out), 3, "split conta");
   Eq(out[0] + "|" + out[1] + "|" + out[2], "EURUSD|XAUUSD|US30", "split ordem e sem repetidos");
   EqL(OhlcSplit("US30.cash,us30.cash", out), 2, "split diferencia maiúsculas");
   ENUM_TIMEFRAMES tfs[];
   string bad;
   EqL(OhlcParseTfs("ALL", tfs, bad), 21, "ALL = 21");
   EqL(OhlcParseTfs("", tfs, bad), 21, "vazio = 21");
   EqL(OhlcParseTfs("h1, M1,M5,m1,X9,H1", tfs, bad), 3, "lista sem repetidos");
   Check(tfs[0] == PERIOD_M1 && tfs[1] == PERIOD_M5 && tfs[2] == PERIOD_H1, "lista na ordem do MT5");
   Eq(bad, "X9", "desconhecidos reportados");
  }

//--- JSON, horários e envelope --------------------------------------------
void TestJson()
  {
   Eq(OhlcEsc("a\"b\\c\nd"), "a\\\"b\\\\c d", "escape");
   Eq(OhlcNum(3), "3", "num inteiro");
   Eq(OhlcNum(0.5), "0.5", "num decimal");
   Eq(OhlcNum(0), "0", "num zero");
   // Corretora UTC+3: 2026.10.14 12:00 da corretora = 09:00 UTC
   EqL(OhlcOffsetSec(D'2026.10.14 12:00:07', D'2026.10.14 09:00:00'), 10800, "offset arredondado a 15 min");
   EqL(OhlcOffsetSec(D'2026.10.14 05:30:00', D'2026.10.14 09:00:00'), -12600, "offset negativo");
   datetime t = D'2026.10.14 12:00:00';
   long utcMs = 1791968400000;   // 2026-10-14T09:00:00Z
   EqL(OhlcMs(t, true, 10800), utcMs, "UTC");
   EqL(OhlcMs(t, false, 10800), utcMs + 10800000, "horário da corretora");
   Check(OhlcFromMs(utcMs, true, 10800) == t, "ms → corretora");
   EqL(OhlcMscMs((long)t * 1000 + 123, true, 10800), utcMs + 123, "time_msc em UTC");
   EqL(OhlcMscFromMs(utcMs + 123, true, 10800), (long)t * 1000 + 123, "ms → time_msc");
   MqlRates r = Rate(t, 1.16001, 1.1601, 1.15995, 1.16008, 42, 0, 7);
   Eq(OhlcRateJson(r, 5, true, 10800), "[1791968400000,1.16001,1.16010,1.15995,1.16008,42,0,7]", "RateJson");
   Eq(OhlcSeriesJson("EURUSD", PERIOD_M1, 5, "[1]", false, 0, 0, 0),
      "{\"symbol\":\"EURUSD\",\"tf\":\"M1\",\"sec\":60,\"digits\":5,\"bars\":[[1]]}", "SeriesJson");
   Eq(OhlcSeriesJson("EURUSD", PERIOD_H1, 5, "", true, 10, 20, 5),
      "{\"symbol\":\"EURUSD\",\"tf\":\"H1\",\"sec\":3600,\"digits\":5,\"from_ms\":10,\"to_ms\":20,\"first_ms\":5,\"bars\":[]}",
      "SeriesJson history com from/to");
   MqlTick k = Tick((long)t * 1000 + 250, 1.16001, 1.16003, 0, 0, 6);
   Eq(OhlcTickJson(k, 5, true, 10800), "[1791968400250,1.16001,1.16003,0.00000,0,6]", "TickJson");
   Eq(OhlcTicksJson("EURUSD", 5, "bid", "[1]", false, 0, 0),
      "{\"symbol\":\"EURUSD\",\"digits\":5,\"chart\":\"bid\",\"rows\":[[1]]}", "TicksJson");
   string hb = OhlcEnvelopeJson("heartbeat", "12345", "Demo-Server", "Casa \"Brasa\"", 10800, true,
                                1791968400000, 7, "", "", "", "");
   Eq(hb, "{\"v\":1,\"type\":\"heartbeat\",\"source\":\"mt5-ohlc\",\"account\":\"12345\",\"server\":\"Demo-Server\","
      "\"broker\":\"Casa \\\"Brasa\\\"\",\"offset_sec\":10800,\"time_utc\":true,\"sent_ms\":1791968400000,\"seq\":7}",
      "EnvelopeJson heartbeat");
   string done = OhlcEnvelopeJson("history", "1", "S", "B", 0, true, 1, 2, "req1", "", "", ",\"done\":true");
   Check(StringFind(done, "\"request_id\":\"req1\"") > 0 && StringFind(done, "\"done\":true}") > 0, "envelope com request_id e done");
  }

//--- Detecção de mudança ----------------------------------------------------
void TestFirstChanged()
  {
   datetime t0 = D'2026.10.14 12:00:00';
   MqlRates rates[3];
   rates[0] = Rate(t0, 1.1, 1.2, 1.0, 1.15, 10, 0, 5);
   rates[1] = Rate(t0 + 60, 1.15, 1.16, 1.14, 1.155, 4, 0, 5);
   rates[2] = Rate(t0 + 120, 1.155, 1.156, 1.155, 1.156, 1, 0, 5);
   MqlRates last = rates[2];
   EqL(OhlcFirstChanged(rates, 3, last, false), 0, "sem estado: tudo");
   EqL(OhlcFirstChanged(rates, 3, last, true), 3, "nada mudou");
   last.close = 1.1555;
   EqL(OhlcFirstChanged(rates, 3, last, true), 2, "vela em formação mudou");
   last = rates[0];
   EqL(OhlcFirstChanged(rates, 3, last, true), 1, "velas novas (antiga igual)");
   last.close = 1.149;
   last.tick_volume = 9;
   EqL(OhlcFirstChanged(rates, 3, last, true), 0, "vela antiga fechou com valor diferente");
   last = Rate(t0 + 180, 1, 1, 1, 1, 1, 0, 0);
   EqL(OhlcFirstChanged(rates, 3, last, true), 3, "nada depois da última enviada");
   Check(OhlcSameRate(rates[1], rates[1]), "SameRate igual");
   MqlRates b = rates[1];
   b.spread = 6;
   Check(!OhlcSameRate(rates[1], b), "SameRate spread diferente");
  }

//--- Ticks no mesmo milissegundo ------------------------------------------------
void TestTickCut()
  {
   // 5 ticks: 1000, 1000, 1001, 1001, 1001
   MqlTick all[5];
   all[0] = Tick(1000, 1, 1, 0, 0, 2);
   all[1] = Tick(1000, 2, 2, 0, 0, 2);
   all[2] = Tick(1001, 3, 3, 0, 0, 2);
   all[3] = Tick(1001, 4, 4, 0, 0, 2);
   all[4] = Tick(1001, 5, 5, 0, 0, 2);
   // 1º ciclo viu só os 4 primeiros (o 5º chegou depois, no mesmo ms)
   MqlTick first[4];
   for(int i = 0; i < 4; i++)
      first[i] = all[i];
   long lastMsc = 0;
   int sent = 0;
   int skip = OhlcTickSkip(first, 4, lastMsc, sent);
   EqL(skip, 0, "1º ciclo não pula nada");
   OhlcTickAdvance(first, skip, 4, lastMsc, sent);
   EqL(lastMsc, 1001, "estado: último ms");
   EqL(sent, 2, "estado: 2 ticks nesse ms");
   // 2º ciclo: CopyTicksRange(from = 1001) devolve os 3 ticks de 1001
   MqlTick second[3];
   for(int i = 0; i < 3; i++)
      second[i] = all[i + 2];
   skip = OhlcTickSkip(second, 3, lastMsc, sent);
   EqL(skip, 2, "pula só os 2 já enviados");
   Check(second[skip].bid == 5, "envia o 5º tick (mesmo ms, sem perder)");
   OhlcTickAdvance(second, skip, 3, lastMsc, sent);
   EqL(sent, 3, "agora 3 enviados em 1001");
   skip = OhlcTickSkip(second, 3, lastMsc, sent);
   EqL(skip, 3, "nada novo: não duplica");
   // Envio parcial dentro do mesmo ms (limite por envio)
   long l2 = 0;
   int s2 = 0;
   OhlcTickAdvance(all, 0, 3, l2, s2);
   EqL(l2 * 10 + s2, 10011, "parcial: 1001 com 1 enviado");
   EqL(OhlcTickSkip(all, 5, l2, s2), 3, "parcial: retoma no 4º");
  }

//--- Divisão do backfill ---------------------------------------------------------
void TestChunks()
  {
   datetime first = D'2026.10.01 00:00:00';
   datetime cursor = D'2026.10.01 10:59:00';   // 660 velas M1 até aqui
   datetime from, to;
   int count = 0;
   int bars = 0;
   bool overlap = false;
   datetime prevFrom = cursor + 1;
   while(OhlcChunk(cursor, first, 60, 200, from, to))
     {
      count++;
      overlap = overlap || to != prevFrom - 1 || from > to;
      bars += (int)((to - from) / 60) + 1;
      prevFrom = from;
      cursor = from - 1;
      if(count > 100)
         break;
     }
   EqL(count, 4, "4 blocos de até 200 velas");
   Check(!overlap, "blocos contíguos sem sobreposição");
   EqL(bars, 660, "todas as velas cobertas");
   Check(prevFrom == first, "termina no início do histórico");
   Check(!OhlcChunk(first - 1, first, 60, 200, from, to), "cursor antes do início = fim");
  }

//--- Resposta com pedidos --------------------------------------------------------------
void TestRequests()
  {
   string body = "{\"ok\":true,\"next_ms\":1000,\"requests\":[" +
                 "{\"id\":\"k1\",\"kind\":\"bars\",\"symbol\":\"EURUSD\",\"tf\":\"M1\",\"from_ms\":100,\"to_ms\":200}," +
                 "{\"id\":\"k2\",\"kind\":\"ticks\",\"symbol\":\"US30.cash\",\"from_ms\":5,\"to_ms\":9}," +
                 "{\"id\":\"k3\",\"kind\":\"oops\",\"symbol\":\"X\",\"from_ms\":1,\"to_ms\":2}]}";
   OhlcRequest reqs[];
   long nextMs;
   EqL(OhlcParseRequests(body, reqs, nextMs), 2, "2 pedidos válidos");
   EqL(nextMs, 1000, "next_ms");
   Eq(reqs[0].id + "|" + reqs[0].kind + "|" + reqs[0].symbol + "|" + reqs[0].tf, "k1|bars|EURUSD|M1", "pedido de velas");
   EqL(reqs[0].fromMs + reqs[0].toMs, 300, "from/to");
   Eq(reqs[1].kind + "|" + reqs[1].symbol + "|" + reqs[1].tf, "ticks|US30.cash|", "pedido de ticks");
   EqL(OhlcParseRequests("{\"ok\":true,\"requests\":[]}", reqs, nextMs), 0, "lista vazia");
   EqL(nextMs, 0, "sem next_ms");
  }

//--- Fixtures (lidos pelos testes TS) ----------------------------------------------------
void WriteFixtures()
  {
   long off = 10800;   // corretora UTC+3
   datetime t = D'2026.10.14 12:00:00';
   MqlRates m1[3];
   m1[0] = Rate(t, 1.16001, 1.1601, 1.15995, 1.16008, 42, 0, 7);
   m1[1] = Rate(t + 60, 1.16008, 1.16021, 1.16004, 1.16019, 37, 0, 6);
   m1[2] = Rate(t + 120, 1.16019, 1.1602, 1.16011, 1.16014, 12, 0, 6);
   string rows = "";
   for(int i = 0; i < 3; i++)
      rows += (i > 0 ? "," : "") + OhlcRateJson(m1[i], 5, true, off);
   MqlRates h4 = Rate(D'2026.10.14 08:00:00', 2650.12, 2661.5, 2648.01, 2659.87, 18234, 0, 12);
   string series = OhlcSeriesJson("EURUSD", PERIOD_M1, 5, rows, false, 0, 0, 0) + "," +
                   OhlcSeriesJson("XAUUSD", PERIOD_H4, 2, OhlcRateJson(h4, 2, true, off), false, 0, 0, 0);
   WriteFile("ohlc_fixture_snapshot.json",
             OhlcEnvelopeJson("snapshot", "12345", "Demo-Server", "Casa Brasa Test", off, true,
                              1791968525000, 1, "", series, "", ""));
   long base = (long)t * 1000;
   MqlTick ticks[5];
   ticks[0] = Tick(base + 120, 1.16001, 1.16003, 0, 0, 6);
   ticks[1] = Tick(base + 120, 1.16002, 1.16004, 0, 0, 6);
   ticks[2] = Tick(base + 950, 1.16002, 1.16005, 0, 0, 4);
   ticks[3] = Tick(base + 2010, 1.15998, 1.16, 0, 0, 6);
   ticks[4] = Tick(base + 3500, 1.16007, 1.16009, 0, 0, 6);
   string trows = "";
   for(int i = 0; i < 5; i++)
      trows += (i > 0 ? "," : "") + OhlcTickJson(ticks[i], 5, true, off);
   WriteFile("ohlc_fixture_ticks.json",
             OhlcEnvelopeJson("ticks", "12345", "Demo-Server", "Casa Brasa Test", off, true,
                              1791968404000, 2, "", "", OhlcTicksJson("EURUSD", 5, "bid", trows, false, 0, 0), ""));
   WriteFile("ohlc_fixture_history.json",
             OhlcEnvelopeJson("history", "12345", "Demo-Server", "Casa Brasa Test", off, true,
                              1791968530000, 3, "req_123",
                              OhlcSeriesJson("EURUSD", PERIOD_M1, 5, rows, true, OhlcMs(t, true, off),
                                             OhlcMs(t + 179, true, off), OhlcMs(D'2010.01.04 00:00:00', true, off)), "", ""));
   WriteFile("ohlc_fixture_heartbeat.json",
             OhlcEnvelopeJson("heartbeat", "12345", "Demo-Server", "Casa Brasa Test", off, true,
                              1791968540000, 4, "", "", "", ""));
  }

void OnStart()
  {
   TestTimeframes();
   TestLists();
   TestJson();
   TestFirstChanged();
   TestTickCut();
   TestChunks();
   TestRequests();
   WriteFixtures();
   string result = g_fail == "" ? "PASS " + IntegerToString(g_pass) + "\n" :
                   g_fail + "PASSED " + IntegerToString(g_pass) + "\n";
   WriteFile("ohlc_selftest.txt", result);
   Print("OhlcExportSelfTest: ", g_fail == "" ? "PASS " + IntegerToString(g_pass) : "FALHOU — veja MQL5/Files/ohlc_selftest.txt");
  }
//+------------------------------------------------------------------+
