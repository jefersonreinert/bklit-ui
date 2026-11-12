/**
 * Browser side of the live voice conversation (GPT-Live over WebRTC).
 * The phone's microphone and the sommelier's voice travel as audio
 * tracks; the "oai-events" data channel carries transcripts and the
 * delegations (wine questions) the page answers with Claude.
 */

export interface LiveTurn {
  role: "user" | "assistant";
  content: string;
}

/** Joins transcript fragments into alternating turns. */
export function addFragment(turns: LiveTurn[], role: LiveTurn["role"], delta: string) {
  const last = turns.at(-1);
  if (last?.role === role) {
    return [...turns.slice(0, -1), { role, content: last.content + delta }];
  }
  return [...turns, { role, content: delta.trimStart() }];
}

/**
 * The conversation as Claude needs it: alternating turns, ending with
 * what the guest said (what the voice said after it, like "let me
 * think", is left out), at most 12 turns and 600 characters asked.
 */
export function questionTurns(turns: LiveTurn[]): LiveTurn[] | null {
  const clean = turns
    .map((t) => ({ role: t.role, content: t.content.replace(/\s+/g, " ").trim() }))
    .filter((t) => t.content);
  let end = clean.length;
  while (end > 0 && clean[end - 1]?.role !== "user") {
    end--;
  }
  const kept = clean.slice(0, end).slice(-12);
  while (kept[0]?.role === "assistant") {
    kept.shift();
  }
  const last = kept.at(-1);
  if (!last) {
    return null;
  }
  last.content = last.content.slice(-600);
  return kept.map((t) => ({ ...t, content: t.content.slice(-4000) }));
}

interface LiveEvents {
  onReady: () => void;
  onUser: (delta: string) => void;
  onAssistant: (delta: string) => void;
  onDelegation: (id: string) => void;
  onEnd: (reason: string) => void;
}

export class LiveCall {
  private peer: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private mic: MediaStream | null = null;
  private readonly audio: HTMLAudioElement;
  private ended = false;
  private seq = 0;

  constructor(private readonly on: LiveEvents) {
    this.audio = new Audio();
    this.audio.autoplay = true;
    this.audio.setAttribute("playsinline", "true");
  }

  static supported() {
    return (
      typeof window !== "undefined" &&
      "RTCPeerConnection" in window &&
      !!navigator.mediaDevices?.getUserMedia
    );
  }

  /**
   * Connects. `exchange` sends the SDP offer to our server and returns
   * OpenAI's answer, or null when live voice is not available.
   */
  async start(exchange: (sdp: string) => Promise<string | null>): Promise<boolean> {
    // Must run inside the tap, before any await: iPhone audio unlock
    this.audio.play().catch(() => undefined);
    const peer = new RTCPeerConnection();
    this.peer = peer;
    peer.addEventListener("track", (e) => {
      this.audio.srcObject = new MediaStream([e.track]);
      this.audio.play().catch(() => undefined);
    });
    peer.addEventListener("connectionstatechange", () => {
      if (peer.connectionState === "failed" || peer.connectionState === "closed") {
        this.finish("connection_lost");
      }
    });
    try {
      this.mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      this.ended = true;
      this.cleanup();
      throw err;
    }
    for (const track of this.mic.getAudioTracks()) {
      peer.addTrack(track, this.mic);
    }
    const channel = peer.createDataChannel("oai-events");
    this.channel = channel;
    channel.addEventListener("message", (e) => this.event(String(e.data)));
    channel.addEventListener("close", () => this.finish("closed"));

    await peer.setLocalDescription(await peer.createOffer());
    await gathered(peer);
    const offer = peer.localDescription?.sdp;
    const answer = offer ? await exchange(offer) : null;
    if (!answer || this.ended) {
      this.ended = true;
      this.cleanup();
      return false;
    }
    await peer.setRemoteDescription({ type: "answer", sdp: answer });
    return true;
  }

  /** Something GPT-Live should say aloud (in its own words). */
  say(content: string, delegationId: string | null) {
    this.send({ type: "session.commentary.append", delegation_id: delegationId, content });
  }

  /** Context it may use, without speaking it now. */
  note(content: string, delegationId: string | null) {
    this.send({ type: "session.thinking.append", delegation_id: delegationId, content });
  }

  stop() {
    if (this.channel?.readyState === "open") {
      this.send({ type: "session.close" });
      // Usage drains first; give it a moment, then hang up regardless
      setTimeout(() => this.finish("close_requested"), 4000);
    } else {
      this.finish("close_requested");
    }
  }

  private send(event: Record<string, unknown>) {
    if (this.channel?.readyState === "open") {
      this.channel.send(JSON.stringify({ event_id: `c${Date.now()}_${this.seq++}`, ...event }));
    }
  }

  private event(raw: string) {
    let e: {
      type?: string;
      delta?: string;
      reason?: string;
      delegation?: { id?: string; target?: string };
      error?: { message?: string };
    };
    try {
      e = JSON.parse(raw);
    } catch {
      return;
    }
    switch (e.type) {
      case "session.started":
        this.on.onReady();
        break;
      case "session.input_transcript.delta":
        if (e.delta) {
          this.on.onUser(e.delta);
        }
        break;
      case "session.output_transcript.delta":
        if (e.delta) {
          this.on.onAssistant(e.delta);
        }
        break;
      case "session.delegation.created":
        if (e.delegation?.id && e.delegation.target !== "responses") {
          this.on.onDelegation(e.delegation.id);
        }
        break;
      case "session.closed":
        this.finish(e.reason ?? "closed");
        break;
      case "error":
        console.warn("[sommelier] live:", e.error?.message);
        break;
      default:
        break;
    }
  }

  private finish(reason: string) {
    if (this.ended) {
      return;
    }
    this.ended = true;
    this.cleanup();
    this.on.onEnd(reason);
  }

  private cleanup() {
    for (const track of this.mic?.getTracks() ?? []) {
      track.stop();
    }
    this.mic = null;
    try {
      this.channel?.close();
    } catch {
      // closed
    }
    this.peer?.close();
    this.audio.srcObject = null;
  }
}

function gathered(peer: RTCPeerConnection) {
  if (peer.iceGatheringState === "complete") {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      peer.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    const check = () => {
      if (peer.iceGatheringState === "complete") {
        done();
      }
    };
    // Enough candidates are usually there well before "complete"
    const timer = setTimeout(done, 2500);
    peer.addEventListener("icegatheringstatechange", check);
  });
}
