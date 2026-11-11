import {
  useEffect,
  useRef,
  useState,
} from 'react';

function pixels(value: string): number {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : 0;
}

export function useTablePageSize() {
  const viewportRef =
    useRef<HTMLDivElement>(null);

  const [pageSize, setPageSize] = useState(1);

  useEffect(() => {
    const viewport = viewportRef.current;

    const page =
      viewport?.closest<HTMLElement>(
        '.runs-page',
      );

    if (!viewport || !page) {
      return;
    }

    let active = true;
    let animation: number | null = null;

    function measure() {
      if (
        !active ||
        !viewport ||
        !page ||
        page.clientHeight === 0
      ) {
        return;
      }

      const pageStyle = getComputedStyle(page);

      const children = Array.from(
        page.children,
      ).filter(
        (element): element is HTMLElement =>
          element instanceof HTMLElement &&
          getComputedStyle(element).display !==
            'none',
      );

      const occupiedHeight = children.reduce(
        (total, child) => {
          if (child === viewport) {
            return total;
          }

          const style = getComputedStyle(child);

          return (
            total +
            child.getBoundingClientRect().height +
            pixels(style.marginTop) +
            pixels(style.marginBottom)
          );
        },
        0,
      );

      const padding =
        pixels(pageStyle.paddingTop) +
        pixels(pageStyle.paddingBottom);

      const gaps =
        pixels(pageStyle.rowGap) *
        Math.max(0, children.length - 1);

      const scroller =
        viewport.querySelector<HTMLElement>(
          '.runs-table-scroll',
        );

      const header =
        viewport.querySelector<HTMLElement>(
          'thead',
        );

      const chrome = scroller
        ? Math.max(
            0,
            scroller.offsetHeight -
              scroller.clientHeight,
          )
        : 2;

      const headerHeight =
        header?.getBoundingClientRect().height ??
        46;

      const rowHeight =
        pixels(
          getComputedStyle(viewport)
            .getPropertyValue(
              '--runs-row-height',
            ),
        ) || 72;

      const available = Math.max(
        0,
        page.clientHeight -
          padding -
          gaps -
          occupiedHeight -
          chrome -
          headerHeight -
          2,
      );

      const nextSize = Math.max(
        1,
        Math.floor(available / rowHeight),
      );

      setPageSize((previous) =>
        previous === nextSize
          ? previous
          : nextSize,
      );
    }

    function schedule() {
      if (animation !== null) {
        cancelAnimationFrame(animation);
      }

      animation = requestAnimationFrame(
        measure,
      );
    }

    const resize = new ResizeObserver(
      schedule,
    );

    function observeChildren() {
      if (!page) {
        return;
      }

      resize.disconnect();
      resize.observe(page);

      for (const child of Array.from(
        page.children,
      )) {
        resize.observe(child);
      }
    }

    const mutations = new MutationObserver(
      () => {
        observeChildren();
        schedule();
      },
    );

    mutations.observe(page, {
      childList: true,
    });

    observeChildren();
    schedule();

    return () => {
      active = false;
      resize.disconnect();
      mutations.disconnect();

      if (animation !== null) {
        cancelAnimationFrame(animation);
      }
    };
  }, []);

  return {
    viewportRef,
    pageSize,
    rowHeight: 72,
  };
}