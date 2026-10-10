import { Api } from "telegram/tl/index.js";
import { classifyMedia, type MediaKind, type MediaShape } from "./media";

/**
 * Reads a GramJS message's media (photo or document) as plain data for the
 * gallery. Polls, locations, contacts, web previews and dice return null.
 */

export interface MediaInfo {
  kind: MediaKind;
  mime: string;
  fileName?: string;
  size: number;
}

const toNumber = (n: unknown) => {
  if (typeof n === "number") {
    return n;
  }
  const v = Number((n as { toString(): string } | undefined)?.toString());
  return Number.isFinite(v) ? v : 0;
};

/** Size of the biggest photo variant (what downloadMedia fetches). */
function photoSize(photo: Api.Photo) {
  let size = 0;
  for (const s of photo.sizes) {
    if (s instanceof Api.PhotoSize) {
      size = Math.max(size, s.size);
    } else if (s instanceof Api.PhotoSizeProgressive) {
      size = Math.max(size, ...s.sizes);
    }
  }
  return size;
}

function documentShape(doc: Api.Document): MediaShape {
  const shape: MediaShape = { mimeType: doc.mimeType };
  for (const attr of doc.attributes) {
    if (attr instanceof Api.DocumentAttributeFilename) {
      shape.fileName = attr.fileName;
    } else if (attr instanceof Api.DocumentAttributeAudio) {
      shape.audio = true;
      shape.voice = Boolean(attr.voice);
    } else if (attr instanceof Api.DocumentAttributeVideo) {
      shape.video = true;
      shape.round = Boolean(attr.roundMessage);
    } else if (attr instanceof Api.DocumentAttributeSticker) {
      shape.sticker = true;
    } else if (attr instanceof Api.DocumentAttributeAnimated) {
      shape.animated = true;
    }
  }
  return shape;
}

export function describeMedia(
  media: Api.TypeMessageMedia | undefined | null
): MediaInfo | null {
  if (
    media instanceof Api.MessageMediaPhoto &&
    media.photo instanceof Api.Photo
  ) {
    return {
      kind: "photo",
      mime: "image/jpeg",
      size: photoSize(media.photo),
    };
  }
  if (
    media instanceof Api.MessageMediaDocument &&
    media.document instanceof Api.Document
  ) {
    const doc = media.document;
    const shape = documentShape(doc);
    return {
      kind: classifyMedia(shape),
      mime: doc.mimeType || "application/octet-stream",
      ...(shape.fileName ? { fileName: shape.fileName } : {}),
      size: toNumber(doc.size),
    };
  }
  return null;
}
