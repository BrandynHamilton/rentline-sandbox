"use client";
import { useAuth, SignIn } from "@clerk/nextjs";
import { useEffect } from "react";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoaded, userId } = useAuth();

  if (!isLoaded) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen bg-[var(--background)]">
        <div className="w-6 h-6 border-2 border-[var(--color-crimson)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="flex-1 min-h-screen flex items-center justify-center bg-[var(--background)]">
        <div className="flex flex-col items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--color-crimson)] flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="16" height="20" x="4" y="2" rx="2" ry="2"/>
                <path d="M9 22v-4h6v4"/>
              </svg>
            </div>
            <span className="text-lg font-semibold text-[var(--color-text)] tracking-tight">
              Rentline Sandbox
            </span>
          </div>
          <SignIn />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
