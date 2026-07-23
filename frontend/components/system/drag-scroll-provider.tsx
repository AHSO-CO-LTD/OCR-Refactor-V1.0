"use client";

import { ReactNode, useEffect } from "react";

type ScrollTarget = {
  element: HTMLElement;
  canScrollHorizontally: boolean;
  canScrollVertically: boolean;
};

type DragSession = {
  pointerId: number;
  pointerTarget: HTMLElement;
  startX: number;
  startY: number;
  scrollTargets: ScrollTarget[];
  activeTarget: ScrollTarget | null;
  startScrollLeft: number;
  startScrollTop: number;
  dragging: boolean;
};

const dragThresholdPx = 6;
const dragScrollIgnoreSelector = [
  "input",
  "textarea",
  "select",
  "option",
  "[contenteditable='true']",
  "[role='slider']",
  "[role='spinbutton']",
  "[data-drag-scroll-ignore]",
  ".touch-none",
].join(",");

function getScrollTargets(startElement: HTMLElement) {
  const targets: ScrollTarget[] = [];
  let currentElement: HTMLElement | null = startElement;

  while (currentElement && currentElement !== document.documentElement) {
    const styles = window.getComputedStyle(currentElement);
    const canScrollVertically =
      /(auto|scroll)/.test(styles.overflowY) &&
      currentElement.scrollHeight > currentElement.clientHeight + 1;
    const canScrollHorizontally =
      /(auto|scroll)/.test(styles.overflowX) &&
      currentElement.scrollWidth > currentElement.clientWidth + 1;

    if (canScrollHorizontally || canScrollVertically) {
      targets.push({
        element: currentElement,
        canScrollHorizontally,
        canScrollVertically,
      });
    }

    currentElement = currentElement.parentElement;
  }

  return targets;
}

function releasePointerCapture(session: DragSession) {
  if (!session.pointerTarget.hasPointerCapture(session.pointerId)) {
    return;
  }

  try {
    session.pointerTarget.releasePointerCapture(session.pointerId);
  } catch {
    // The browser can release capture automatically when the pointer leaves.
  }
}

export function DragScrollProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    let dragSession: DragSession | null = null;
    let suppressNextClick = false;
    let suppressClickTimeout: ReturnType<typeof setTimeout> | null = null;

    const clearDraggingState = (session = dragSession) => {
      document.documentElement.classList.remove("drag-scroll-active");
      session?.activeTarget?.element.removeAttribute("data-drag-scrolling");
    };

    const endDragSession = (event?: globalThis.PointerEvent) => {
      if (!dragSession || (event && event.pointerId !== dragSession.pointerId)) {
        return;
      }

      const completedSession = dragSession;
      dragSession = null;
      clearDraggingState(completedSession);
      releasePointerCapture(completedSession);

      if (!completedSession.dragging) {
        return;
      }

      suppressNextClick = true;
      if (suppressClickTimeout) {
        clearTimeout(suppressClickTimeout);
      }
      suppressClickTimeout = setTimeout(() => {
        suppressNextClick = false;
        suppressClickTimeout = null;
      }, 0);
    };

    const handlePointerDown = (event: globalThis.PointerEvent) => {
      if (
        !event.isPrimary ||
        event.pointerType === "touch" ||
        (event.pointerType === "mouse" && event.button !== 0)
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (target.closest(dragScrollIgnoreSelector)) {
        return;
      }

      const scrollTargets = getScrollTargets(target);
      if (scrollTargets.length === 0) {
        return;
      }

      dragSession = {
        pointerId: event.pointerId,
        pointerTarget: target,
        startX: event.clientX,
        startY: event.clientY,
        scrollTargets,
        activeTarget: null,
        startScrollLeft: 0,
        startScrollTop: 0,
        dragging: false,
      };

      try {
        target.setPointerCapture(event.pointerId);
      } catch {
        // Document-level listeners still keep the drag active without capture.
      }
    };

    const handlePointerMove = (event: globalThis.PointerEvent) => {
      if (!dragSession || event.pointerId !== dragSession.pointerId) {
        return;
      }

      const deltaX = event.clientX - dragSession.startX;
      const deltaY = event.clientY - dragSession.startY;

      if (!dragSession.dragging) {
        if (Math.hypot(deltaX, deltaY) < dragThresholdPx) {
          return;
        }

        const primarilyVertical = Math.abs(deltaY) >= Math.abs(deltaX);
        const activeTarget =
          dragSession.scrollTargets.find((target) =>
            primarilyVertical
              ? target.canScrollVertically
              : target.canScrollHorizontally,
          ) ??
          dragSession.scrollTargets.find((target) =>
            primarilyVertical
              ? target.canScrollHorizontally
              : target.canScrollVertically,
          );

        if (!activeTarget) {
          endDragSession(event);
          return;
        }

        dragSession.dragging = true;
        dragSession.activeTarget = activeTarget;
        dragSession.startScrollLeft = activeTarget.element.scrollLeft;
        dragSession.startScrollTop = activeTarget.element.scrollTop;
        activeTarget.element.setAttribute("data-drag-scrolling", "true");
        document.documentElement.classList.add("drag-scroll-active");
      }

      const activeTarget = dragSession.activeTarget;
      if (!activeTarget) {
        return;
      }

      if (event.cancelable) {
        event.preventDefault();
      }

      if (activeTarget.canScrollHorizontally) {
        activeTarget.element.scrollLeft =
          dragSession.startScrollLeft - deltaX;
      }
      if (activeTarget.canScrollVertically) {
        activeTarget.element.scrollTop = dragSession.startScrollTop - deltaY;
      }
    };

    const handleClick = (event: MouseEvent) => {
      if (!suppressNextClick) {
        return;
      }

      suppressNextClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("pointermove", handlePointerMove, {
      capture: true,
      passive: false,
    });
    document.addEventListener("pointerup", endDragSession, true);
    document.addEventListener("pointercancel", endDragSession, true);
    document.addEventListener("click", handleClick, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("pointermove", handlePointerMove, true);
      document.removeEventListener("pointerup", endDragSession, true);
      document.removeEventListener("pointercancel", endDragSession, true);
      document.removeEventListener("click", handleClick, true);
      if (suppressClickTimeout) {
        clearTimeout(suppressClickTimeout);
      }
      clearDraggingState();
    };
  }, []);

  return children;
}
