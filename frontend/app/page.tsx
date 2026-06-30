"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  clearOperatorStartupAutoLoginRequest,
  getPostLoginRoute,
  requestOperatorStartupAutoLogin,
  shouldAutoLoginOperator,
} from "@/lib/operator-startup-preferences";
import { getAccessToken, getStoredUser } from "@/lib/session";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const storedUser = getStoredUser();
    const hasAccessToken = Boolean(getAccessToken());
    const shouldRefreshOperatorSession =
      shouldAutoLoginOperator() && storedUser?.role !== "operator";

    if (shouldRefreshOperatorSession) {
      requestOperatorStartupAutoLogin();
    } else {
      clearOperatorStartupAutoLoginRequest();
    }

    router.replace(
      hasAccessToken && !shouldRefreshOperatorSession
        ? getPostLoginRoute(storedUser)
        : "/login",
    );
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)] text-[var(--foreground)]">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
    </main>
  );
}

