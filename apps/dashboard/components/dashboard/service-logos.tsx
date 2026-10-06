import { cn } from "@/lib/utils";

/**
 * Official full-color marks of the connected services (from the brands'
 * published assets, via svgl.app). Kept as inline SVG so they render
 * offline and stay sharp at any size.
 */

export type ServiceBrand = "gmail" | "drive" | "youtube" | "notion";

const TITLES: Record<ServiceBrand, string> = {
  gmail: "Gmail",
  drive: "Google Drive",
  youtube: "YouTube",
  notion: "Notion",
};

function Gmail() {
  return (
    <svg viewBox="0 49.4 512 399.42" xmlns="http://www.w3.org/2000/svg">
      <title>{TITLES.gmail}</title>
      <g fill="none" fillRule="evenodd">
        <g fillRule="nonzero">
          <path
            d="M34.91 448.818h81.454V251L0 163.727V413.91c0 19.287 15.622 34.91 34.91 34.91z"
            fill="#4285f4"
          />
          <path
            d="M395.636 448.818h81.455c19.287 0 34.909-15.622 34.909-34.909V163.727L395.636 251z"
            fill="#34a853"
          />
          <path
            d="M395.636 99.727V251L512 163.727v-46.545c0-43.142-49.25-67.782-83.782-41.891z"
            fill="#fbbc04"
          />
        </g>
        <path
          d="M116.364 251V99.727L256 204.455 395.636 99.727V251L256 355.727z"
          fill="#ea4335"
        />
        <path
          d="M0 117.182v46.545L116.364 251V99.727L83.782 75.291C49.25 49.4 0 74.04 0 117.18z"
          fill="#c5221f"
          fillRule="nonzero"
        />
      </g>
    </svg>
  );
}

function Drive() {
  return (
    <svg viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
      <title>{TITLES.drive}</title>
      <path
        d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L27.5 53H0c0 1.55.4 3.1 1.2 4.5z"
        fill="#0066da"
      />
      <path
        d="M43.65 25 29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44A9.06 9.06 0 0 0 0 53h27.5z"
        fill="#00ac47"
      />
      <path
        d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75L86.1 57.5c.8-1.4 1.2-2.95 1.2-4.5H59.798l5.852 11.5z"
        fill="#ea4335"
      />
      <path
        d="M43.65 25 57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z"
        fill="#00832d"
      />
      <path
        d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"
        fill="#2684fc"
      />
      <path
        d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.8 53h27.45c0-1.55-.4-3.1-1.2-4.5z"
        fill="#ffba00"
      />
    </svg>
  );
}

function Youtube() {
  return (
    <svg viewBox="0 0 256 180" xmlns="http://www.w3.org/2000/svg">
      <title>{TITLES.youtube}</title>
      <path
        d="M250.346 28.075A32.18 32.18 0 0 0 227.69 5.418C207.824 0 127.87 0 127.87 0S47.912.164 28.046 5.582A32.18 32.18 0 0 0 5.39 28.24c-6.009 35.298-8.34 89.084.165 122.97a32.18 32.18 0 0 0 22.656 22.657c19.866 5.418 99.822 5.418 99.822 5.418s79.955 0 99.82-5.418a32.18 32.18 0 0 0 22.657-22.657c6.338-35.348 8.291-89.1-.164-123.134Z"
        fill="#ff0000"
      />
      <path d="m102.421 128.06 66.328-38.418-66.328-38.418z" fill="#fff" />
    </svg>
  );
}

function Notion() {
  return (
    <svg viewBox="0 0 256 268" xmlns="http://www.w3.org/2000/svg">
      <title>{TITLES.notion}</title>
      <path
        d="M16.092 11.538 164.09.608c18.179-1.56 22.85-.508 34.28 7.801l47.243 33.282C253.406 47.414 256 48.975 256 55.207v182.527c0 11.439-4.155 18.205-18.696 19.24L65.44 267.378c-10.913.517-16.11-1.043-21.825-8.327L8.826 213.814C2.586 205.487 0 199.254 0 191.97V29.726c0-9.352 4.155-17.153 16.092-18.188Z"
        fill="#fff"
      />
      <path
        d="M164.09.608 16.092 11.538C4.155 12.573 0 20.374 0 29.726v162.245c0 7.284 2.585 13.516 8.826 21.843l34.789 45.237c5.715 7.284 10.912 8.844 21.825 8.327l171.864-10.404c14.532-1.035 18.696-7.801 18.696-19.24V55.207c0-5.911-2.336-7.614-9.21-12.66l-1.185-.856L198.37 8.409C186.94.1 182.27-.952 164.09.608ZM69.327 52.22c-14.033.945-17.216 1.159-25.186-5.323L23.876 30.778c-2.06-2.086-1.026-4.69 4.163-5.207l142.274-10.395c11.947-1.043 18.17 3.12 22.842 6.758l24.401 17.68c1.043.525 3.638 3.637.517 3.637L71.146 52.095l-1.819.125Zm-16.36 183.954V81.222c0-6.767 2.077-9.887 8.3-10.413L230.02 60.93c5.724-.517 8.31 3.12 8.31 9.879v153.917c0 6.767-1.044 12.49-10.387 13.008l-161.487 9.361c-9.343.517-13.489-2.594-13.489-10.921ZM212.377 89.53c1.034 4.681 0 9.362-4.681 9.897l-7.783 1.542v114.404c-6.758 3.637-12.981 5.715-18.18 5.715-8.308 0-10.386-2.604-16.609-10.396l-50.898-80.079v77.476l16.1 3.646s0 9.362-12.989 9.362l-35.814 2.077c-1.043-2.086 0-7.284 3.63-8.318l9.351-2.595V109.823l-12.98-1.052c-1.044-4.68 1.55-11.439 8.826-11.965l38.426-2.585 52.958 81.113v-71.76l-13.498-1.552c-1.043-5.733 3.111-9.896 8.3-10.404l35.84-2.087Z"
        fill="#000"
      />
    </svg>
  );
}

const MARKS: Record<ServiceBrand, () => React.JSX.Element> = {
  gmail: Gmail,
  drive: Drive,
  youtube: Youtube,
  notion: Notion,
};

/** A service's official logo, sized by `className` (defaults to 1rem). */
export function ServiceLogo({
  brand,
  className,
}: {
  brand: ServiceBrand;
  className?: string;
}) {
  const Mark = MARKS[brand];
  return (
    <span
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center [&>svg]:max-h-full [&>svg]:max-w-full",
        className
      )}
    >
      <Mark />
    </span>
  );
}

/** Official logo on a white tile (like an app icon) for cards. */
export function ServiceTile({
  brand,
  className,
}: {
  brand: ServiceBrand;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-xl border border-black/5 bg-white shadow-sm",
        className
      )}
    >
      <ServiceLogo brand={brand} className="size-[55%]" />
    </span>
  );
}
