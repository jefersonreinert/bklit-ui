import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { aiAccess } from "@/lib/server/ai/access";
import { recognize } from "@/lib/server/ai/service";

/**
 * Identifies a product in a photo with the configured AI providers
 * (primary first, automatic fallback). Barcodes are read on the device;
 * this is only called when the user asks for AI recognition.
 */

export const dynamic = "force-dynamic";

/** ~3 MB of base64: plenty for a 1600 px JPEG. */
const MAX_IMAGE = 4_000_000;

const Body = z.object({
  requestId: z.string().min(8).max(80).regex(/^[\w-]+$/),
  image: z.string().max(MAX_IMAGE),
  barcode: z.string().max(64).nullable().optional(),
  categories: z
    .array(
      z.object({
        name: z.string().max(60),
        subs: z.array(z.string().max(60)).max(60),
      })
    )
    .max(120)
    .default([]),
});

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

export async function POST(request: NextRequest) {
  if (!(await aiAccess(request, "use"))) {
    return NextResponse.json({ ok: false, attempts: [], error: "Sem acesso." }, { status: 401 });
  }
  const parsed = Body.safeParse(await request.json().catch(() => null));
  const match = parsed.success ? DATA_URL.exec(parsed.data.image) : null;
  if (!(parsed.success && match)) {
    return NextResponse.json(
      { ok: false, attempts: [], error: "Foto inválida ou grande demais." },
      { status: 400 }
    );
  }
  try {
    const result = await recognize({
      requestId: parsed.data.requestId,
      image: match[2] as string,
      mediaType: match[1] as "image/jpeg" | "image/png" | "image/webp",
      categories: parsed.data.categories,
      barcode: parsed.data.barcode ?? null,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (err) {
    console.error("[ai/recognize]", err);
    return NextResponse.json(
      { ok: false, attempts: [], error: "Erro interno ao reconhecer a imagem." },
      { status: 500 }
    );
  }
}
