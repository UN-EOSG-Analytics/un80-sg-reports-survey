import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface Props {
  children?: React.ReactNode;
  maxWidth?: "6xl" | "7xl";
}

export const SITE_TITLE = "Secretary-General's Report Portfolio";

export function Header({ children, maxWidth = "7xl" }: Props) {
  const wide = maxWidth === "7xl";
  // Breakpoint above which the emblem moves outboard into the page margin.
  // Mirrors the un-transcribed formula: container-width + ~128px of gutter
  // (≈ emblem width × 2 + breathing room).
  //   max-w-7xl (1280) → 1408px
  //   max-w-6xl (1152) → 1280px
  const outboardOnly = wide
    ? "hidden min-[1408px]:block"
    : "hidden min-[1280px]:block";
  const inlineOnly = wide ? "min-[1408px]:hidden" : "min-[1280px]:hidden";
  const widthClass = wide ? "max-w-7xl" : "max-w-6xl";

  return (
    <header className="relative border-b border-gray-200 bg-white py-3">
      <div
        className={cn(
          "relative mx-auto flex items-center gap-4 px-4 sm:px-8",
          widthClass,
        )}
      >
        {/* Outboard emblem: at wide viewports it sits in the page margin
            immediately to the left of the centered container. The 24.74px
            offset overshoots into the container's px-8 padding so the
            visible gap between the emblem and "United Nations" matches the
            original UN horizontal logo's emblem-wordmark proportion. */}
        <Link
          href="/"
          aria-label="Secretary-General's Report Portfolio"
          className={cn(
            "absolute top-1/2 end-[calc(100%-24.74px)] h-10 w-[47.9px] -translate-y-1/2 transition-opacity hover:opacity-75",
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
          aria-label="Secretary-General's Report Portfolio"
          className="inline-flex items-center gap-2.5 transition-opacity hover:opacity-75"
        >
          <Image
            src="/images/un-emblem-colour.svg"
            alt=""
            width={152}
            height={127}
            className={cn("h-10 w-[47.9px] shrink-0 select-none", inlineOnly)}
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
