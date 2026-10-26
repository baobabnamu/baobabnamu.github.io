export type Box = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type Size = {
  width: number;
  height: number;
};

export type MenuPlacement = {
  top: number;
  left: number;
  maxHeight: number;
};

const GAP = 6;
const PAD = 8;

/**
 * Place a popover menu inside the viewport.
 * It opens below the trigger, and above it when the list would not fit there.
 * `maxHeight` is the space on the chosen side, so a long list scrolls in the menu.
 */
export function placeLanguageMenu({
  trigger,
  menu,
  viewport,
  gap = GAP,
  pad = PAD,
}: {
  trigger: Box;
  menu: Size;
  viewport: Size;
  gap?: number;
  pad?: number;
}): MenuPlacement {
  const spaceBelow = viewport.height - trigger.bottom - gap - pad;
  const spaceAbove = trigger.top - gap - pad;
  const openUp = spaceBelow < menu.height && spaceAbove > spaceBelow;
  const available = Math.max(0, openUp ? spaceAbove : spaceBelow);
  const maxHeight = Math.min(menu.height, available);

  let top = openUp ? trigger.top - gap - maxHeight : trigger.bottom + gap;
  const maxTop = Math.max(pad, viewport.height - pad - maxHeight);
  top = Math.min(Math.max(top, pad), maxTop);

  let left = trigger.left;
  if (left + menu.width > viewport.width - pad) left = trigger.right - menu.width;
  const maxLeft = Math.max(pad, viewport.width - pad - menu.width);
  left = Math.min(Math.max(left, pad), maxLeft);

  return { top, left, maxHeight };
}
