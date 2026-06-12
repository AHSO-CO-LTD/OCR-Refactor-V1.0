"use client";

import { useState } from "react";
import { Keyboard } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ApiError, openWindowsVirtualKeyboard } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { getAccessToken } from "@/lib/session";

export function UserVirtualKeyboardButton() {
  const { apiError, t } = useI18n();
  const [opening, setOpening] = useState(false);

  async function handleOpenKeyboard() {
    const token = getAccessToken();

    if (!token) {
      toast.error(t("users.missingSession"));
      return;
    }

    setOpening(true);
    const toastId = toast.loading(t("users.virtualKeyboardOpening"));

    try {
      await openWindowsVirtualKeyboard(token);
      toast.success(t("users.virtualKeyboardOpenSuccess"), { id: toastId });
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? apiError(cause.message, "users.virtualKeyboardOpenError")
          : t("users.virtualKeyboardOpenError");
      toast.error(message, { id: toastId });
    } finally {
      setOpening(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleOpenKeyboard}
      disabled={opening}
    >
      <Keyboard className="h-4 w-4" aria-hidden="true" />
      {opening ? t("users.virtualKeyboardOpening") : t("users.virtualKeyboard")}
    </Button>
  );
}
