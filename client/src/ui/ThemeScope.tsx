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
 * The Main Window publishes to its own document root and does not need this
 * — it exists because the primitives page shows both themes at once, which is
 * the case that proved the portals were escaping their theme. A Daughter
 * Window needs the same escape-proofing for a different reason: see
 * {@link PortalContainerScope}.
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

export interface PortalContainerScopeProps {
  readonly container: HTMLElement | null;
  readonly children: ReactNode;
}

/**
 * Supplies the portal container directly, for a subtree whose theme is
 * already correct but whose floating primitives must still portal into a
 * specific document rather than default to `document.body`.
 *
 * This is the other half of what a Pane rendered inside a Daughter Window
 * needs. Its theme comes from that popout document's own root, applied once
 * directly (`applyThemeVariables`, called against the whole document rather
 * than through `ThemeScope`, since a Daughter Window has no un-themed
 * surface to scope around) — but a Radix menu or dialog it opens still
 * portals to `document.body` by default, which without this would be the
 * *Main* Window's `document.body` on another monitor, not the Window the
 * click happened in. `Workspace.tsx` wraps every docked Pane in this,
 * resolving `container` from the Pane's own rendered DOM node rather than
 * from which Window it opened in, since dockview relocates that DOM by drag
 * without remounting the Pane that owns it.
 */
export function PortalContainerScope({ container, children }: PortalContainerScopeProps): React.JSX.Element {
  return <PortalContainerContext.Provider value={container}>{children}</PortalContainerContext.Provider>;
}
