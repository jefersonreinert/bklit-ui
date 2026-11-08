"use client";

import { ConvexHttpClient } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import { buildContract } from "@/lib/hr/contract";
import { contractPdf, savePdf } from "@/lib/hr/contract-pdf";
import { SignaturePad } from "./signature-pad";

/**
 * Public page where an employee reads and signs a contract of employment
 * (/assinar/?t=<token>). No panel login: the secret link is the access.
 */

type Contract = NonNullable<
  FunctionReturnType<typeof api.contracts.forSigning>
>;

const TRAILING_SLASH = /\/$/;

/** HTTP actions URL (self-hosted or Convex Cloud). */
function siteUrl() {
  const site = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  if (site) {
    return site.replace(TRAILING_SLASH, "");
  }
  return (process.env.NEXT_PUBLIC_CONVEX_URL ?? "")
    .replace(".convex.cloud", ".convex.site")
    .replace(TRAILING_SLASH, "");
}

const when = (ms: number | null) =>
  ms
    ? new Date(ms).toLocaleString("en-GB", {
        dateStyle: "long",
        timeStyle: "short",
      })
    : "";

export function SignPage() {
  const [token, setToken] = useState<string | null>(null);
  const [c, setC] = useState<Contract | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [sig, setSig] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (t: string) => {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) {
      setC(null);
      return;
    }
    try {
      setC(
        await new ConvexHttpClient(url).query(api.contracts.forSigning, {
          token: t,
        })
      );
    } catch {
      setC(null);
    }
  }, []);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("t") ?? "";
    setToken(t);
    load(t);
  }, [load]);

  const submit = async () => {
    if (!(token && sig)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${siteUrl()}/hr/sign`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, name, signature: sig, agree }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? "Could not sign.");
      }
      await load(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign.");
    } finally {
      setBusy(false);
    }
  };

  if (c === undefined) {
    return <Frame>Loading…</Frame>;
  }
  if (c === null) {
    return (
      <Frame>
        <p className="font-semibold">This link is not valid.</p>
        <p className="text-muted-foreground text-sm">
          It may have been cancelled or replaced. Ask your manager for a new
          link.
        </p>
      </Frame>
    );
  }

  const doc = buildContract(c.fields);
  const pdfName = `contract-${c.fields.startDate}.pdf`;
  return (
    <Frame>
      <div>
        <p className="text-muted-foreground text-sm">
          {c.fields.employer.name}
        </p>
        <h1 className="font-semibold text-xl">Your contract of employment</h1>
      </div>
      <article className="max-h-[55dvh] overflow-y-auto rounded-xl border bg-white p-4 font-serif text-[14px] text-black leading-relaxed">
        <p className="mb-3 text-center font-bold">{doc.title}</p>
        {doc.parties.map((p) => (
          <p className="mb-2" key={p}>
            {p}
          </p>
        ))}
        {doc.sections.map((s) => (
          <div className="mt-3" key={s.heading}>
            <p className="font-bold">{s.heading}</p>
            {s.paragraphs.map((p) => (
              <p className="mb-1.5" key={p}>
                {p}
              </p>
            ))}
          </div>
        ))}
      </article>
      {c.status === "signed" ? (
        <div className="flex flex-col gap-3 rounded-xl bg-emerald-500/10 p-4">
          <p className="font-semibold">Signed on {when(c.employeeSignedAt)}.</p>
          <p className="text-sm">Thank you, {c.employeeName}. Keep a copy:</p>
          <Button onClick={async () => savePdf(await contractPdf(c), pdfName)}>
            Download signed PDF
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm" htmlFor="sign-name">
            Your full name
            <Input
              autoComplete="name"
              id="sign-name"
              onChange={(e) => setName(e.target.value)}
              placeholder={c.fields.employee.name}
              value={name}
            />
          </label>
          <SignaturePad onChange={setSig} />
          <label className="flex items-start gap-2 text-sm">
            <input
              checked={agree}
              className="mt-1"
              onChange={(e) => setAgree(e.target.checked)}
              type="checkbox"
            />
            I have read this contract and agree to sign it electronically. My
            signature, the date, time and my device will be recorded.
          </label>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <Button
            disabled={busy || !sig || !agree || name.trim().length < 3}
            onClick={submit}
          >
            {busy ? "Signing…" : "Sign contract"}
          </Button>
          <p className="text-muted-foreground text-xs">
            Document fingerprint (SHA-256): {c.hash.slice(0, 24)}…
          </p>
        </div>
      )}
    </Frame>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      {children}
    </main>
  );
}
