import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface Props {
  children?: React.ReactNode;
  maxWidth?: "6xl" | "7xl";
}

export const SITE_TITLE = "Secretary-General's Reports";

export function Header({ children, maxWidth = "7xl" }: Props) {
  const wide = maxWidth === "7xl";
  // Container math: max-w-7xl is 1280px, max-w-6xl is 1152px. The emblem
  // (47.9px wide) plus ~10px gap needs ~58px of free margin to one side.
  // Outboard kicks in once (viewport - container)/2 ≥ 58px.
  //   7xl → 1280 + 116 = 1396 → use min-[1396px]
  //   6xl → 1152 + 116 = 1268 → use min-[1268px]
  const outboardOnly = wide
    ? "hidden min-[1396px]:block"
    : "hidden min-[1268px]:block";
  const inlineOnly = wide ? "min-[1396px]:hidden" : "min-[1268px]:hidden";
  const widthClass = wide ? "max-w-7xl" : "max-w-6xl";

  return (
    <header className="relative border-b border-gray-200 bg-white py-3">
      <div
        className={cn(
          "relative mx-auto flex items-center gap-4 px-6",
          widthClass,
        )}
      >
        {/* Outboard emblem: sits in the page margin to the LEFT of the
            container's content edge so the wordmark lines up with body text.
            end-[100%] places the emblem's right edge at the container's left
            content edge; the negative me-3 nudges in a 12px visual gap. */}
        <Link
          href="/"
          aria-label="Secretary-General's Reports"
          className={cn(
            "absolute top-1/2 end-[100%] me-3 h-10 w-[47.9px] -translate-y-1/2 transition-opacity hover:opacity-75",
            outboardOnly,
          )}
        >
          <Image
            src="/images/un-emblem-colour.svg"
            alt="UN emblem"
            width={152}
            height={127}
            className="h-10 w-[47.9px] shrink-0 select-none"
            draggable={false}
          />
        </Link>
        <Link
          href="/"
          aria-label="Secretary-General's Reports"
          className="inline-flex items-center gap-2.5 transition-opacity hover:opacity-75"
        >
          <Image
            src="/images/un-emblem-colour.svg"
            alt=""
            width={152}
            height={127}
            className={cn(
              "h-10 w-[47.9px] shrink-0 select-none",
              inlineOnly,
            )}
            draggable={false}
          />
          <span className="text-[23.83px] leading-none tracking-tight text-gray-900">
            <span className="font-bold">United Nations</span>{" "}
            <span className="font-light">{SITE_TITLE}</span>
          </span>
        </Link>
        {children && (
          <div className="ms-auto flex items-center gap-4">{children}</div>
        )}
      </div>
    </header>
  );
}
