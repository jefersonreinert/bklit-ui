import { parseYtLink, type YtChannel } from "@/lib/youtube-types";
import { ytGet } from "../youtube/use-youtube";

/** Accepts @handle, a channel link or a channel id; looks the channel up. */
export async function resolveChannel(input: string) {
  const value = input.trim();
  const link = parseYtLink(value);
  let params: Record<string, string>;
  if (link?.kind === "channel") {
    params = { id: link.id };
  } else if (link?.kind === "handle") {
    params = { handle: link.handle };
  } else if (value.startsWith("UC")) {
    params = { id: value };
  } else {
    params = { handle: value.startsWith("@") ? value : `@${value}` };
  }
  const { channel } = await ytGet<{ channel: YtChannel }>("channel", params);
  return channel;
}
