import type { IconName } from "@bklitui/icons";
import { type CSSProperties, memo, type SVGProps } from "react";
import data from "./icon-data.json";

/**
 * Same API as `@bklitui/icons`' <Icon>, but backed by only the icons this app
 * uses (scripts/gen-icons.mjs) instead of every icon in every style.
 */

const ICONS = data as Record<string, string>;

export type { IconName } from "@bklitui/icons";

export interface IconProps
  extends Omit<SVGProps<SVGSVGElement>, "name" | "color"> {
  name: IconName;
  size?: number | string;
  color?: string;
  ariaLabel?: string;
  ariaHidden?: boolean;
  style?: CSSProperties;
}

export const Icon = memo(function Icon({
  name,
  size = 24,
  color,
  ariaLabel,
  ariaHidden = true,
  style,
  ...props
}: IconProps) {
  const px = typeof size === "number" ? `${size}px` : size;
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative by default; a <title> is added when ariaHidden is false
    <svg
      {...props}
      aria-hidden={ariaHidden}
      fill="none"
      height={px}
      role={ariaHidden ? undefined : "img"}
      style={{ color, ...style }}
      viewBox="0 0 24 24"
      width={px}
      xmlns="http://www.w3.org/2000/svg"
    >
      {ariaHidden ? null : <title>{ariaLabel ?? name}</title>}
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static SVG paths from the icon set */}
      <g dangerouslySetInnerHTML={{ __html: ICONS[name] ?? "" }} />
    </svg>
  );
});
