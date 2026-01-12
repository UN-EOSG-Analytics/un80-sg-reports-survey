"use client";
import Image from "next/image";
import { SITE_TITLE } from "@/components/Header";
import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-xs">
        <div className="mb-8 flex flex-col items-center">
          <Image src="/images/UN_Logo_Stacked_Colour_English.svg" alt="UN Logo" width={80} height={80} className="mb-4" />
          <h1 className="text-xl font-semibold text-foreground">{SITE_TITLE}</h1>
          <p className="text-sm text-gray-500">Sign in with your UN email</p>
        </div>
        <LoginForm centered />
      </div>
    </div>
  );
}
