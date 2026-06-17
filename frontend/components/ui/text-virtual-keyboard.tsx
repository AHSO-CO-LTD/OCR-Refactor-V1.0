"use client";

import { useMemo, useState } from "react";
import Keyboard from "react-simple-keyboard";
import type { KeyboardReactInterface, KeyboardOptions } from "react-simple-keyboard";
import type { VirtualKeyboardTarget } from "@/lib/virtual-keyboard";
import { applyVirtualKeyboardKey } from "@/lib/virtual-keyboard";

type TextVirtualKeyboardProps = {
  currentValue: string;
  onInputChange: (value: string) => void;
  target: VirtualKeyboardTarget | null;
  t: (key: string) => string;
};

type KeyboardLayoutName = "default" | "shift" | "symbols" | "shiftSymbols";

const keyboardLayout: KeyboardOptions["layout"] = {
  default: [
    "1 2 3 4 5 6 7 8 9 0",
    "q w e r t y u i o p",
    "a s d f g h j k l",
    "{shift} z x c v b n m {bksp}",
    "{symbols} @ . _ - / {space} {enter}",
  ],
  shift: [
    "1 2 3 4 5 6 7 8 9 0",
    "Q W E R T Y U I O P",
    "A S D F G H J K L",
    "{shift} Z X C V B N M {bksp}",
    "{symbols} @ . _ - / {space} {enter}",
  ],
  symbols: [
    "1 2 3 4 5 6 7 8 9 0",
    "! @ # $ % ^ & * ( )",
    "_ - + = / \\ : ;",
    "{shift} [ ] { } ? {bksp}",
    "{abc} , . ' \" {space} {enter}",
  ],
  shiftSymbols: [
    "1 2 3 4 5 6 7 8 9 0",
    "~ ` | < > € £ ¥ ¢",
    "_ - + = / \\ : ;",
    "{shift} [ ] ( ) ! {bksp}",
    "{abc} , . ' \" {space} {enter}",
  ],
};

export function TextVirtualKeyboard({
  currentValue,
  onInputChange,
  target,
  t,
}: TextVirtualKeyboardProps) {
  const [layoutName, setLayoutName] = useState<KeyboardLayoutName>("default");

  const display = useMemo<KeyboardOptions["display"]>(
    () => ({
      "{bksp}": t("vk.backspace"),
      "{enter}": t("vk.enter"),
      "{space}": t("vk.space"),
      "{shift}": t("vk.caps"),
      "{symbols}": "#+=",
      "{abc}": "ABC",
    }),
    [t],
  );

  function syncCurrentValue(nextTarget: VirtualKeyboardTarget | null) {
    if (!nextTarget) {
      return;
    }

    onInputChange(nextTarget.value);
  }

  function handleTextKeyPress(button: string) {
    if (!target) {
      return;
    }

    if (button === "{shift}") {
      setLayoutName((current) => {
        if (current === "default") {
          return "shift";
        }

        if (current === "shift") {
          return "default";
        }

        if (current === "symbols") {
          return "shiftSymbols";
        }

        return "symbols";
      });
      return;
    }

    if (button === "{symbols}") {
      setLayoutName("symbols");
      return;
    }

    if (button === "{abc}") {
      setLayoutName("default");
      return;
    }

    applyVirtualKeyboardKey(target, button);
    syncCurrentValue(target);

    if (layoutName === "shift") {
      setLayoutName("default");
    }

    if (layoutName === "shiftSymbols") {
      setLayoutName("symbols");
    }
  }

  return (
    <div className="virtual-text-keyboard">
      <Keyboard
        layout={keyboardLayout}
        layoutName={layoutName}
        display={display}
        mergeDisplay
        useButtonTag
        preventMouseDownDefault
        stopMouseDownPropagation
        disableCaretPositioning
        theme="simple-keyboard hg-theme-default vk-simple-keyboard"
        onKeyPress={handleTextKeyPress}
        onChange={() => undefined}
        keyboardRef={(instance: KeyboardReactInterface) => {
          instance.setInput(currentValue, undefined, true);
        }}
      />
    </div>
  );
}
