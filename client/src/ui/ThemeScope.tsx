import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { AppTheme } from '../appThemes';
import { applyThemeVariables } from '../design/themeVariables';

/**
 * Where floating primitives render.
 *
 * Dialogs, menus, selects, popovers and tooltips portal out of the React tree so
 * an ancestor's `overflow: hidden` cannot clip them. That escape is also how
 * they leave a themed subtree: tokens are inherited custom properties, and
 * content portalled to `document.body` inherits from the document, not from the
 * element the theme was applied to. An overlay opened inside a scoped theme then
 * renders with every token unresolved — no surface, no border, transparent text.
 *
 * `null` means the default, which is `document.body` and is correct whenever the
 * theme is applied to the document root — the ordinary case for the application.
 */
const PortalContainerContext = createContext<HTMLElement | null>(null);

/** The element floating primitives should portal into, or `undefined` for the default. */
export function usePortalContainer(): HTMLElement | undefined {
  return useContext(PortalContainerContext) ?? undefined;
}

export interface ThemeScopeProps {
  readonly theme: AppTheme;
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * Applies a theme to a subtree rather than to the whole document.
 *
 * Anything portalled from inside is rendered into this element too, so an
 * overlay opened here carries this theme rather than the document's.
 *
 * The application itself publishes to the document root and does not need this;
 * it exists because the primitives page shows both themes at once, which is the
 * case that proved the portals were escaping their theme.
 */
export function ThemeScope({ theme, children, className }: ThemeScopeProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  // State rather than the ref itself, so the first render after mount re-runs
  // with a container to hand out — a ref alone would still read null.
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    applyThemeVariables(theme, ref.current);
    setContainer(ref.current);
  }, [theme]);

  return (
    <div ref={ref} className={className}>
      <PortalContainerContext.Provider value={container}>
        {children}
      </PortalContainerContext.Provider>
    </div>
  );
}
