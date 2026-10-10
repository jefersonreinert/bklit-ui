import { computeCheck } from "telegram/Password.js";
import { Api } from "telegram/tl/index.js";

/**
 * Telegram login in steps that survive between serverless calls. Each call
 * rebuilds the client from the temporary StringSession saved after the
 * previous step (the auth key lives in it), so the QR code and the phone
 * code work without a long-running process.
 */

/** The bit of TelegramClient the steps use (mocked in tests). */
export interface LoginClient {
  invoke(request: unknown): Promise<unknown>;
  /** Moves to another data center (QR logins of accounts on another DC). */
  switchDc(dcId: number): Promise<void>;
}

export type LoginStep =
  | { kind: "qr"; url: string; expiresAt: number }
  | { kind: "success" }
  | { kind: "password"; hint: string | null };

const tokenUrl = (token: Buffer | Uint8Array) =>
  `tg://login?token=${Buffer.from(token).toString("base64url")}`;

export const rpcCode = (err: unknown) => {
  const e = err as { errorMessage?: string; message?: string } | null;
  return e?.errorMessage ?? e?.message ?? String(err);
};

async function passwordStep(client: LoginClient): Promise<LoginStep> {
  let hint: string | null = null;
  try {
    const info = (await client.invoke(
      new Api.account.GetPassword()
    )) as Api.account.Password;
    hint = info.hint ?? null;
  } catch {
    // The hint is a nicety; the password check fetches it again
  }
  return { kind: "password", hint };
}

/**
 * Asks for (or refreshes) the QR login token. Once the code was scanned in
 * Telegram (Settings → Devices → Link Desktop Device) the same call returns
 * success, a DC migration to finish, or SESSION_PASSWORD_NEEDED (2FA).
 */
export async function qrStep(
  client: LoginClient,
  apiId: number,
  apiHash: string
): Promise<LoginStep> {
  try {
    const r = await client.invoke(
      new Api.auth.ExportLoginToken({ apiId, apiHash, exceptIds: [] })
    );
    if (r instanceof Api.auth.LoginToken) {
      return {
        kind: "qr",
        url: tokenUrl(r.token),
        expiresAt: r.expires * 1000,
      };
    }
    if (r instanceof Api.auth.LoginTokenMigrateTo) {
      await client.switchDc(r.dcId);
      const imported = await client.invoke(
        new Api.auth.ImportLoginToken({ token: r.token })
      );
      if (imported instanceof Api.auth.LoginTokenSuccess) {
        return { kind: "success" };
      }
      if (imported instanceof Api.auth.LoginToken) {
        return {
          kind: "qr",
          url: tokenUrl(imported.token),
          expiresAt: imported.expires * 1000,
        };
      }
    }
    if (r instanceof Api.auth.LoginTokenSuccess) {
      return { kind: "success" };
    }
    throw new Error("Resposta inesperada do Telegram ao gerar o QR code.");
  } catch (err) {
    if (rpcCode(err) === "SESSION_PASSWORD_NEEDED") {
      return await passwordStep(client);
    }
    throw err;
  }
}

/** Signs in with the code Telegram sent to the app or by SMS. */
export async function codeStep(
  client: LoginClient,
  args: { phone: string; phoneCodeHash: string; code: string }
): Promise<LoginStep> {
  try {
    const r = await client.invoke(
      new Api.auth.SignIn({
        phoneNumber: args.phone,
        phoneCodeHash: args.phoneCodeHash,
        phoneCode: args.code,
      })
    );
    if (r instanceof Api.auth.AuthorizationSignUpRequired) {
      throw new Error(
        "Este número não tem conta no Telegram. Crie a conta no app primeiro."
      );
    }
    return { kind: "success" };
  } catch (err) {
    if (rpcCode(err) === "SESSION_PASSWORD_NEEDED") {
      return await passwordStep(client);
    }
    throw err;
  }
}

type Compute = (
  info: Api.account.Password,
  password: string
) => Promise<Api.TypeInputCheckPasswordSRP>;

/**
 * Two-step verification: SRP check of the cloud password. The password is
 * only used here, never stored or logged.
 */
export async function passwordCheck(
  client: LoginClient,
  password: string,
  compute: Compute = computeCheck
): Promise<LoginStep> {
  const info = (await client.invoke(
    new Api.account.GetPassword()
  )) as Api.account.Password;
  const check = await compute(info, password);
  await client.invoke(new Api.auth.CheckPassword({ password: check }));
  return { kind: "success" };
}

const FLOOD = /^FLOOD_WAIT_(\d+)$/;

const MESSAGES: Record<string, string> = {
  PHONE_CODE_INVALID: "Código errado. Confira o código que chegou no Telegram.",
  PHONE_CODE_EXPIRED:
    "O código expirou. Peça um novo código e use-o em seguida.",
  PHONE_CODE_EMPTY: "Digite o código que chegou no Telegram.",
  PHONE_NUMBER_INVALID:
    "Número inválido. Use o formato internacional, ex.: +55 11 99999-0000.",
  PHONE_NUMBER_BANNED: "Este número foi banido pelo Telegram.",
  PHONE_NUMBER_UNOCCUPIED: "Este número não tem conta no Telegram.",
  PASSWORD_HASH_INVALID: "Senha da verificação em duas etapas incorreta.",
  API_ID_INVALID:
    "api_id / api_hash inválidos. Copie de novo em my.telegram.org → API development tools.",
  API_ID_PUBLISHED_FLOOD:
    "Este api_id foi bloqueado por uso público. Crie outra app em my.telegram.org.",
  AUTH_TOKEN_EXPIRED: "O QR code expirou. Gere um novo.",
  AUTH_KEY_UNREGISTERED:
    "A sessão do Telegram foi encerrada. Conecte novamente.",
  SESSION_REVOKED:
    "A sessão foi encerrada no Telegram (Configurações → Dispositivos). Conecte novamente.",
  AUTH_KEY_DUPLICATED:
    "A mesma sessão foi usada em dois lugares ao mesmo tempo e o Telegram a invalidou. Conecte novamente.",
  USER_DEACTIVATED: "Esta conta do Telegram foi desativada.",
};

/** Telegram RPC errors → a sentence the person can act on. */
export function friendlyError(err: unknown) {
  const code = rpcCode(err);
  const e = err as { seconds?: number } | null;
  const flood = FLOOD.exec(code);
  const seconds = flood ? Number(flood[1]) : e?.seconds;
  if (seconds && (flood || code.includes("FLOOD"))) {
    const min = Math.ceil(seconds / 60);
    return `O Telegram pediu para esperar ${min > 1 ? `${min} minutos` : `${seconds} segundos`} antes de tentar de novo.`;
  }
  return MESSAGES[code] ?? code;
}

/** Errors after which the saved session is useless. */
export const SESSION_DEAD = new Set([
  "AUTH_KEY_UNREGISTERED",
  "SESSION_REVOKED",
  "AUTH_KEY_DUPLICATED",
  "USER_DEACTIVATED",
]);
