function findClippingAncestor(element: HTMLElement): HTMLElement | null {
  let node = element.parentElement;
  while (node) {
    if (getComputedStyle(node).overflowY !== 'visible') return node;
    node = node.parentElement;
  }
  return null;
}

export function flipMenuIfClipped(menu: HTMLElement | null): void {
  const anchor = menu?.parentElement;
  if (!menu || !anchor) return;

  const clip = findClippingAncestor(anchor);
  const clipRect = clip?.getBoundingClientRect();
  const top = Math.max(clipRect?.top ?? 0, 0);
  const bottom = Math.min(clipRect?.bottom ?? window.innerHeight, window.innerHeight);
  const anchorRect = anchor.getBoundingClientRect();
  const spaceBelow = bottom - anchorRect.bottom;
  const spaceAbove = anchorRect.top - top;

  menu.classList.toggle('up', menu.offsetHeight > spaceBelow && spaceAbove > spaceBelow);
}
