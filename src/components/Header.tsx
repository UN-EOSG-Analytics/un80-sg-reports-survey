import Image from "next/image";
import Link from "next/link";
import { UserMenu } from "./UserMenu";

interface Props {
  user?: { email: string; entity?: string | null } | null;
  children?: React.ReactNode;
}

export const SITE_TITLE = "SG Reports Survey";
export const SITE_SUBTITLE = "Streamlining reports of the UN Secretary-General";

export function Header({ user, children }: Props) {
  return (
    <div className="mb-6 flex items-center justify-between">
      <Link href="/" className="flex items-center gap-4 hover:opacity-90">
        <Image src="/images/UN_Logo_Stacked_Colour_English.svg" alt="UN Logo" width={60} height={60} className="h-14 w-auto select-none" draggable={false} />
        <div>
          <h1 className="text-2xl font-bold text-foreground">{SITE_TITLE}</h1>
          <p className="text-sm text-gray-500">{SITE_SUBTITLE}</p>
        </div>
      </Link>
      <div className="flex items-center gap-4">
        {user ? (
          <>
            {user.entity && <span className="rounded bg-gray-100 px-2 py-1 text-sm text-gray-600">{user.entity}</span>}
            <UserMenu email={user.email} />
          </>
        ) : (
          <Link href="/login" className="text-sm text-un-blue hover:underline">Login</Link>
        )}
        {children}
      </div>
    </div>
  );
}
