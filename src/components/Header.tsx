import Image from "next/image";
import Link from "next/link";
import { UserMenu } from "./UserMenu";

interface Props {
  user?: { email: string; entity?: string | null } | null;
  children?: React.ReactNode;
  maxWidth?: "6xl" | "7xl";
  hideAbout?: boolean;
}

export const SITE_TITLE = "SG Reports Survey";
export const SITE_SUBTITLE = "Initial feedback collection from entities authoring SG reports";

// Beta badge component
function BetaBadge() {
  return (
    <span className="ml-2 inline-flex items-center rounded-full border border-gray-300 bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
      Beta
    </span>
  );
}

export function Header({ user, children, maxWidth = "7xl", hideAbout = false }: Props) {
  const isLoggedIn = !!user;
  const widthClass = maxWidth === "6xl" ? "max-w-6xl" : "max-w-7xl";

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className={`mx-auto flex ${widthClass} items-center justify-between px-3 py-4 sm:px-4`}>
        <Link href={isLoggedIn ? "/" : "/about"} className="flex items-center gap-3 hover:opacity-90">
          <Image
            src="/images/UN_Logo_Stacked_Colour_English.svg"
            alt="UN Logo"
            width={50}
            height={50}
            priority
            className="h-12 w-auto select-none"
            draggable={false}
          />
          <div>
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">{SITE_TITLE}</h1>
              <BetaBadge />
            </div>
            <p className="text-xs text-gray-500">{SITE_SUBTITLE}</p>
          </div>
        </Link>
        <div className="flex items-center gap-4">
          {isLoggedIn && user?.entity && (
            <Link href="/" className="text-sm font-medium text-gray-700 transition-colors hover:text-un-blue">
              {user.entity} Reports
            </Link>
          )}
          {isLoggedIn && (
            <Link href="/reports" className="text-sm font-medium text-gray-700 transition-colors hover:text-un-blue">
              All Reports
            </Link>
          )}
          {!hideAbout && (
            <Link href="/about" className="text-sm font-medium text-gray-700 transition-colors hover:text-un-blue">
              About
            </Link>
          )}
          {isLoggedIn ? (
            <UserMenu email={user.email} entity={user.entity} />
          ) : (
            <Link href="/login" className="rounded-lg bg-un-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-un-blue/90">
              Sign In
            </Link>
          )}
          {children}
        </div>
      </div>
    </header>
  );
}
