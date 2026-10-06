"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Brand mark (Bklit logo). Gradient/mask ids are scoped per instance so the
 * logo can render several times on one page (header, sidebar, mobile sheet).
 */
export function BrandLogo({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  const id = (name: string) => `${uid}-${name}`;
  const url = (name: string) => `url(#${id(name)})`;

  return (
    <svg
      aria-hidden="true"
      className={cn("size-9 shrink-0", className)}
      fill="none"
      viewBox="0 0 256 256"
    >
      <g clipPath={url("clip")}>
        <mask
          height="257"
          id={id("mask")}
          maskUnits="userSpaceOnUse"
          style={{ maskType: "alpha" }}
          width="256"
          x="0"
          y="0"
        >
          <rect fill={url("paint0")} height="257" rx="64" width="256" />
        </mask>
        <g mask={url("mask")}>
          <rect fill="#fff" height="256" rx="20" width="256" />
          <path
            d="M76.023 132.081s13.407-22.163 44.325-22.163c28.825 0 44.325 22.163 44.325 22.163s-13.552 22.163-44.325 22.162c-28.645 0-44.325-22.162-44.325-22.162"
            fill={url("paint1")}
            style={{ mixBlendMode: "luminosity" }}
          />
          <path
            d="M175.754 165.325c0 26.776-20.771 55.406-55.406 55.406v-66.487s27.811 1.377 44.325-22.163c8.421 11.265 11.081 23.025 11.081 33.244"
            fill={url("paint2")}
            style={{ mixBlendMode: "luminosity" }}
          />
          <path
            d="M64.941 165.325c0 26.776 20.771 55.406 55.407 55.406v-66.487s-25.934 1.45-44.325-22.163C67.6 143.346 64.94 155.106 64.94 165.325"
            fill={url("paint3")}
          />
          <path
            d="M64.941 98.837c0-26.776 20.771-55.406 55.407-55.406v66.488s-27.812-1.378-44.325 22.162C67.6 120.816 64.94 109.056 64.94 98.837"
            fill={url("paint4")}
          />
          <path
            d="M175.754 98.837c0-26.776-20.771-55.406-55.406-55.406v66.488s26.157-1.352 44.325 22.162c8.421-11.265 11.081-23.025 11.081-33.244"
            fill={url("paint5")}
          />
        </g>
      </g>
      <defs>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id={id("paint0")}
          x1="0"
          x2="256.998"
          y1="0"
          y2="255.998"
        >
          <stop stopColor="#ff6363" />
          <stop offset="1" stopColor="#d72a2a" />
        </linearGradient>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id={id("paint1")}
          x1="164.673"
          x2="76.023"
          y1="132.081"
          y2="132.081"
        >
          <stop />
          <stop offset=".483" stopOpacity=".8" />
          <stop offset="1" />
        </linearGradient>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id={id("paint2")}
          x1="120.348"
          x2="175.754"
          y1="220.731"
          y2="110.095"
        >
          <stop />
          <stop offset="1" stopOpacity=".5" />
        </linearGradient>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id={id("paint3")}
          x1="120.348"
          x2="64.941"
          y1="220.731"
          y2="110.095"
        >
          <stop stopColor="#787878" stopOpacity="0" />
          <stop offset=".745" stopColor="#787878" stopOpacity=".5" />
        </linearGradient>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id={id("paint4")}
          x1="120.348"
          x2="64.941"
          y1="43.431"
          y2="154.067"
        >
          <stop />
          <stop offset="1" stopOpacity=".5" />
        </linearGradient>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id={id("paint5")}
          x1="120.348"
          x2="175.754"
          y1="43.431"
          y2="154.067"
        >
          <stop stopColor="#787878" stopOpacity="0" />
          <stop offset=".75" stopColor="#787878" stopOpacity=".5" />
        </linearGradient>
        <clipPath id={id("clip")}>
          <path d="M0 0h256v256H0z" fill="#fff" />
        </clipPath>
      </defs>
    </svg>
  );
}
