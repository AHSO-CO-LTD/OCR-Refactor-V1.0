export type VirtualKeyboardLayout = "numeric" | "english";
export type VirtualKeyboardTarget = HTMLInputElement | HTMLTextAreaElement;

const supportedInputTypes = new Set([
  "",
  "text",
  "search",
  "email",
  "tel",
  "url",
  "password",
  "number",
]);

const specialKeyMap: Record<string, string> = {
  "{bksp}": "__backspace",
  "{enter}": "__enter",
  "{space}": "__space",
  "{clear}": "__clear",
};

export function isVirtualKeyboardTarget(
  target: EventTarget | null | undefined,
): target is VirtualKeyboardTarget {
  if (!target) {
    return false;
  }

  if (target instanceof HTMLTextAreaElement) {
    if (target.dataset.virtualKeyboard === "off") {
      return false;
    }

    if (target.disabled || target.readOnly) {
      return false;
    }

    return true;
  }

  if (!(target instanceof HTMLInputElement)) {
    return false;
  }

  if (target.dataset.virtualKeyboard === "off") {
    return false;
  }

  if (target.disabled || target.readOnly) {
    return false;
  }

  return supportedInputTypes.has(target.type);
}

export function inferKeyboardLayoutFromTarget(
  target: VirtualKeyboardTarget | null | undefined,
): VirtualKeyboardLayout {
  if (!target) {
    return "english";
  }

  if (
    target.type === "number" ||
    target.inputMode === "numeric" ||
    target.inputMode === "decimal"
  ) {
    return "numeric";
  }

  return "english";
}

export function applyVirtualKeyboardKey(
  target: VirtualKeyboardTarget,
  key: string,
) {
  const normalizedKey = specialKeyMap[key] ?? key;
  const selectionStart = target.selectionStart ?? target.value.length;
  const selectionEnd = target.selectionEnd ?? selectionStart;

  switch (normalizedKey) {
    case "__backspace":
      applyBackspace(target, selectionStart, selectionEnd);
      return;
    case "__clear":
      updateTargetValue(target, "", 0);
      return;
    case "__space":
      insertText(target, " ", selectionStart, selectionEnd);
      return;
    case "__enter":
      if (target instanceof HTMLTextAreaElement) {
        insertText(target, "\n", selectionStart, selectionEnd);
      }
      return;
    default:
      insertText(target, normalizedKey, selectionStart, selectionEnd);
  }
}

function applyBackspace(
  target: VirtualKeyboardTarget,
  selectionStart: number,
  selectionEnd: number,
) {
  if (selectionStart !== selectionEnd) {
    const nextValue =
      target.value.slice(0, selectionStart) + target.value.slice(selectionEnd);
    updateTargetValue(target, nextValue, selectionStart);
    return;
  }

  if (selectionStart <= 0) {
    return;
  }

  const nextValue =
    target.value.slice(0, selectionStart - 1) + target.value.slice(selectionEnd);
  updateTargetValue(target, nextValue, selectionStart - 1);
}

function insertText(
  target: VirtualKeyboardTarget,
  text: string,
  selectionStart: number,
  selectionEnd: number,
) {
  const nextValue =
    target.value.slice(0, selectionStart) + text + target.value.slice(selectionEnd);
  updateTargetValue(target, nextValue, selectionStart + text.length);
}

function updateTargetValue(
  target: VirtualKeyboardTarget,
  nextValue: string,
  caretPosition: number,
) {
  const nativeValueSetter =
    target instanceof HTMLTextAreaElement
      ? Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value",
        )?.set
      : Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;

  nativeValueSetter?.call(target, nextValue);
  target.dispatchEvent(new Event("input", { bubbles: true }));
  target.focus();
  target.setSelectionRange(caretPosition, caretPosition);
}
