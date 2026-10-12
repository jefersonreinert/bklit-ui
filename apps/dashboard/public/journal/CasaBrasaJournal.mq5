//+------------------------------------------------------------------+
//|                                             CasaBrasaJournal.mq5 |
//| Sends every deal of this MT5 account to the Casa Brasa trading   |
//| journal (Gráficos → Diário). Trades opened by hand, by other EAs |
//| or copied from TradingView (tv2mt5) are all recorded.            |
//|                                                                  |
//| Setup:                                                           |
//|  1. Tools → Options → Expert Advisors → "Allow WebRequest for    |
//|     listed URL" → add https://<deployment>.convex.site           |
//|  2. Paste the MT5 webhook URL (with ?token=…) in InpUrl.         |
//|  3. Attach the EA to any one chart and keep the terminal open.   |
//+------------------------------------------------------------------+
#property copyright "Casa Brasa"
#property version   "1.00"
#property strict

input string InpUrl          = "";   // MT5 webhook URL (from the journal)
input int    InpHistoryDays  = 90;   // Days of history to send on start
input int    InpRetrySeconds = 15;   // Retry interval for failed sends

#define BATCH 100

string g_pending[];

//--- JSON helpers ---------------------------------------------------
string Esc(const string s)
  {
   string r = s;
   StringReplace(r, "\\", "\\\\");
   StringReplace(r, "\"", "\\\"");
   StringReplace(r, "\n", " ");
   StringReplace(r, "\r", " ");
   StringReplace(r, "\t", " ");
   return r;
  }

string Num(const double v, const int digits = 8)
  {
   return DoubleToString(v, digits);
  }

string TypeName(const long t)
  {
   if(t == DEAL_TYPE_BUY)
      return "buy";
   if(t == DEAL_TYPE_SELL)
      return "sell";
   return "";
  }

string EntryName(const long e)
  {
   if(e == DEAL_ENTRY_IN)
      return "in";
   if(e == DEAL_ENTRY_OUT)
      return "out";
   if(e == DEAL_ENTRY_INOUT)
      return "inout";
   if(e == DEAL_ENTRY_OUT_BY)
      return "out_by";
   return "";
  }

//--- One deal as JSON, or "" when it is not a trade ----------------
string DealJson(const ulong ticket)
  {
   string side = TypeName(HistoryDealGetInteger(ticket, DEAL_TYPE));
   string entry = EntryName(HistoryDealGetInteger(ticket, DEAL_ENTRY));
   if(side == "" || entry == "")
      return "";
   string j = "{";
   j += "\"account\":\"" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + "\",";
   j += "\"ticket\":\"" + IntegerToString((long)ticket) + "\",";
   j += "\"position\":\"" + IntegerToString(HistoryDealGetInteger(ticket, DEAL_POSITION_ID)) + "\",";
   j += "\"symbol\":\"" + Esc(HistoryDealGetString(ticket, DEAL_SYMBOL)) + "\",";
   j += "\"type\":\"" + side + "\",";
   j += "\"entry\":\"" + entry + "\",";
   j += "\"volume\":" + Num(HistoryDealGetDouble(ticket, DEAL_VOLUME), 4) + ",";
   j += "\"price\":" + Num(HistoryDealGetDouble(ticket, DEAL_PRICE)) + ",";
   j += "\"sl\":" + Num(HistoryDealGetDouble(ticket, DEAL_SL)) + ",";
   j += "\"tp\":" + Num(HistoryDealGetDouble(ticket, DEAL_TP)) + ",";
   j += "\"profit\":" + Num(HistoryDealGetDouble(ticket, DEAL_PROFIT), 2) + ",";
   j += "\"commission\":" + Num(HistoryDealGetDouble(ticket, DEAL_COMMISSION), 2) + ",";
   j += "\"swap\":" + Num(HistoryDealGetDouble(ticket, DEAL_SWAP), 2) + ",";
   j += "\"fee\":" + Num(HistoryDealGetDouble(ticket, DEAL_FEE), 2) + ",";
   j += "\"magic\":" + IntegerToString(HistoryDealGetInteger(ticket, DEAL_MAGIC)) + ",";
   j += "\"comment\":\"" + Esc(HistoryDealGetString(ticket, DEAL_COMMENT)) + "\",";
   j += "\"time_msc\":" + IntegerToString(HistoryDealGetInteger(ticket, DEAL_TIME_MSC));
   j += "}";
   return j;
  }

string Envelope(const string dealsJson)
  {
   string j = "{";
   j += "\"account\":\"" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + "\",";
   j += "\"server\":\"" + Esc(AccountInfoString(ACCOUNT_SERVER)) + "\",";
   j += "\"name\":\"" + Esc(AccountInfoString(ACCOUNT_COMPANY)) + "\",";
   // Broker clock - UTC: the panel converts the deal times to UTC
   long offset = (long)MathRound((double)(TimeTradeServer() - TimeGMT()) / 900.0) * 900;
   j += "\"server_offset_sec\":" + IntegerToString(offset) + ",";
   j += "\"deals\":[" + dealsJson + "]}";
   return j;
  }

//--- HTTP -----------------------------------------------------------
bool Post(const string body)
  {
   if(InpUrl == "")
     {
      Print("CasaBrasaJournal: set InpUrl (MT5 webhook URL from the journal).");
      return false;
     }
   char data[];
   char result[];
   string resultHeaders;
   int len = StringToCharArray(body, data, 0, WHOLE_ARRAY, CP_UTF8) - 1;
   ArrayResize(data, len);
   ResetLastError();
   int code = WebRequest("POST", InpUrl,
                         "Content-Type: application/json\r\n",
                         10000, data, result, resultHeaders);
   if(code == -1)
     {
      int err = GetLastError();
      if(err == 4014)
         Print("CasaBrasaJournal: add the journal URL to Tools → Options → Expert Advisors → Allow WebRequest.");
      else
         Print("CasaBrasaJournal: WebRequest error ", err);
      return false;
     }
   if(code != 200)
     {
      Print("CasaBrasaJournal: HTTP ", code, " ", CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8));
      // 4xx other than 429 will not succeed on retry
      return code >= 400 && code < 500 && code != 429;
     }
   return true;
  }

void Queue(const string body)
  {
   int n = ArraySize(g_pending);
   ArrayResize(g_pending, n + 1);
   g_pending[n] = body;
  }

void Send(const string body)
  {
   if(!Post(body))
      Queue(body);
  }

void Flush()
  {
   int n = ArraySize(g_pending);
   if(n == 0)
      return;
   string keep[];
   for(int i = 0; i < n; i++)
     {
      if(!Post(g_pending[i]))
        {
         int k = ArraySize(keep);
         ArrayResize(keep, k + 1);
         keep[k] = g_pending[i];
        }
     }
   ArrayResize(g_pending, ArraySize(keep));
   for(int i = 0; i < ArraySize(keep); i++)
      g_pending[i] = keep[i];
  }

//--- History on start (deduplicated by ticket on the server) -------
void SendHistory()
  {
   datetime to = TimeCurrent() + 86400;
   datetime from = to - (datetime)InpHistoryDays * 86400;
   if(!HistorySelect(from, to))
      return;
   int total = HistoryDealsTotal();
   string batch = "";
   int count = 0;
   for(int i = 0; i < total; i++)
     {
      ulong ticket = HistoryDealGetTicket(i);
      string j = DealJson(ticket);
      if(j == "")
         continue;
      batch += (count > 0 ? "," : "") + j;
      count++;
      if(count == BATCH)
        {
         Send(Envelope(batch));
         batch = "";
         count = 0;
        }
     }
   if(count > 0)
      Send(Envelope(batch));
   PrintFormat("CasaBrasaJournal: history of %d days sent (%d deals).", InpHistoryDays, total);
  }

//--- Events ---------------------------------------------------------
int OnInit()
  {
   EventSetTimer(MathMax(5, InpRetrySeconds));
   SendHistory();
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
  }

void OnTimer()
  {
   Flush();
  }

void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest &request,
                        const MqlTradeResult &result)
  {
   if(trans.type != TRADE_TRANSACTION_DEAL_ADD || trans.deal == 0)
      return;
   if(!HistoryDealSelect(trans.deal))
      return;
   string j = DealJson(trans.deal);
   if(j != "")
      Send(Envelope(j));
  }
//+------------------------------------------------------------------+
