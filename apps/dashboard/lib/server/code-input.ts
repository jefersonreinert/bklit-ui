import { isBranchName, isRepoName } from "./code-github";
import type { ImageInput } from "./code-sessions";

/** Validation for request bodies sent by the Code page. */

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);
const MAX_IMAGES = 4;
/** ~5 MB of base64 per image. */
const MAX_IMAGE_CHARS = 7_000_000;

export function parseImages(value: unknown): ImageInput[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(
      (v): v is ImageInput =>
        typeof v?.mediaType === "string" &&
        IMAGE_TYPES.has(v.mediaType) &&
        typeof v?.data === "string" &&
        v.data.length > 0 &&
        v.data.length < MAX_IMAGE_CHARS
    )
    .slice(0, MAX_IMAGES);
}

export function parseRepos(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((v: unknown) => {
    const repo = typeof v === "string" ? v : (v as { repo?: unknown })?.repo;
    const branch =
      typeof v === "object" ? (v as { branch?: unknown })?.branch : null;
    if (typeof repo !== "string" || !isRepoName(repo)) {
      return [];
    }
    return [
      {
        repo,
        branch:
          typeof branch === "string" && isBranchName(branch) ? branch : null,
      },
    ];
  });
}
