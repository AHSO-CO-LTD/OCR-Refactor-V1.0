"use client";

import { useEffect } from "react";
import { ErrorScreen } from "@/components/system/error-screen";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorScreen
      code="500"
      titleKey="error.runtimeTitle"
      descriptionKey="error.runtimeDescription"
      detail={error.digest ? `Digest: ${error.digest}` : undefined}
      reset={reset}
    />
  );
}
