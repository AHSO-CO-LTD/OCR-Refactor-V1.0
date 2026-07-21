"use client";

import { useEffect, type RefObject } from "react";
import type { VirtualKeyboardTarget } from "@/lib/virtual-keyboard";

const KEYBOARD_GAP_PX = 16;
const VIEWPORT_TOP_GAP_PX = 16;

type KeyboardAvoidanceOptions = {
  activeTarget: VirtualKeyboardTarget | null;
  enabled: boolean;
  panelRef: RefObject<HTMLDivElement | null>;
};

export function useKeyboardAvoidance({
  activeTarget,
  enabled,
  panelRef,
}: KeyboardAvoidanceOptions) {
  useEffect(() => {
    if (!enabled || !activeTarget) {
      return;
    }

    const target = activeTarget;
    let firstFrameId = 0;
    let secondFrameId = 0;
    let restoreReservedSpace: () => void = () => undefined;

    function updatePosition() {
      window.cancelAnimationFrame(firstFrameId);
      window.cancelAnimationFrame(secondFrameId);

      firstFrameId = window.requestAnimationFrame(() => {
        const panel = panelRef.current;

        if (!panel || !target.isConnected) {
          return;
        }

        restoreReservedSpace();
        const scrollContainer = findScrollContainer(target);
        restoreReservedSpace = reserveKeyboardSpace(
          scrollContainer,
          panel.getBoundingClientRect().height + KEYBOARD_GAP_PX,
        );

        secondFrameId = window.requestAnimationFrame(() => {
          moveTargetAboveKeyboard(target, panel, scrollContainer);
        });
      });
    }

    updatePosition();
    const resizeObserver = new ResizeObserver(updatePosition);
    const panel = panelRef.current;

    if (panel) {
      resizeObserver.observe(panel);
    }
    window.addEventListener("resize", updatePosition);

    return () => {
      window.cancelAnimationFrame(firstFrameId);
      window.cancelAnimationFrame(secondFrameId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", updatePosition);
      restoreReservedSpace();
    };
  }, [activeTarget, enabled, panelRef]);
}

function findScrollContainer(target: HTMLElement) {
  let current = target.parentElement;

  while (current && current !== document.body) {
    const overflowY = window.getComputedStyle(current).overflowY;

    if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") {
      return current;
    }

    current = current.parentElement;
  }

  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

function reserveKeyboardSpace(scrollContainer: HTMLElement, reservedHeight: number) {
  const spaceContainer = isDocumentScrollContainer(scrollContainer)
    ? document.body
    : scrollContainer;
  const originalInlinePaddingBottom = spaceContainer.style.paddingBottom;
  const computedPaddingBottom = Number.parseFloat(
    window.getComputedStyle(spaceContainer).paddingBottom,
  );
  const basePaddingBottom = Number.isFinite(computedPaddingBottom)
    ? computedPaddingBottom
    : 0;

  spaceContainer.style.paddingBottom = `${basePaddingBottom + reservedHeight}px`;

  return () => {
    spaceContainer.style.paddingBottom = originalInlinePaddingBottom;
  };
}

function moveTargetAboveKeyboard(
  target: VirtualKeyboardTarget,
  panel: HTMLElement,
  scrollContainer: HTMLElement,
) {
  const targetRect = target.getBoundingClientRect();
  const panelTop = panel.getBoundingClientRect().top;
  const visibleBottom = panelTop - KEYBOARD_GAP_PX;
  let scrollDelta = 0;

  if (targetRect.bottom > visibleBottom) {
    scrollDelta = targetRect.bottom - visibleBottom;
  } else if (targetRect.top < VIEWPORT_TOP_GAP_PX) {
    scrollDelta = targetRect.top - VIEWPORT_TOP_GAP_PX;
  }

  if (Math.abs(scrollDelta) < 1) {
    return;
  }

  if (isDocumentScrollContainer(scrollContainer)) {
    window.scrollBy({ top: scrollDelta, behavior: "auto" });
    return;
  }

  scrollContainer.scrollBy({ top: scrollDelta, behavior: "auto" });
}

function isDocumentScrollContainer(element: HTMLElement) {
  return element === document.body || element === document.documentElement;
}
