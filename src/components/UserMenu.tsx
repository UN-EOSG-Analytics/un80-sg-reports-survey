"use client";

import { logoutAction } from "@/lib/actions";

interface Props {
  email: string;
  entity?: string | null;
}

export function UserMenu({ email, entity }: Props) {
  async function handleLogout() {
    await logoutAction();
  }

  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">{email}</span>
        {entity && (
          <span
            className="rounded-full bg-un-blue/10 px-2 py-0.5 text-xs font-medium text-un-blue"
            title="Your entity"
          >
            {entity}
          </span>
        )}
      </div>
      <div className="h-4 w-px bg-gray-200" />
      <button onClick={handleLogout} className="text-sm text-gray-500 transition-colors hover:text-gray-900">
        Logout
      </button>
    </div>
  );
}
