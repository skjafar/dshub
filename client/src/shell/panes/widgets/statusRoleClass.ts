import type { StatusRole } from '../../../design/status';

/**
 * Every bound-value kind maps a `StatusRole` to one of its own CSS module's
 * `.roleOk`/`.roleWarn`/`.roleError`/`.roleInfo`/`.roleIdle` classes — the
 * same five-entry lookup, rebuilt per file because CSS Modules scope each
 * class name to the file that declares it. This is the one place that shape
 * is written; each Widget supplies only its own generated class names.
 *
 * Typed as a plain string-keyed record, matching Vite's own `CSSModuleClasses`
 * (`{ readonly [key: string]: string }`) rather than an interface naming the
 * five keys — a `.module.css` import's generated type is exactly that index
 * signature, which TypeScript does not treat as satisfying specific required
 * properties, however string-valued.
 */
export function roleClassMap(names: Readonly<Record<string, string>>): Readonly<Record<StatusRole, string>> {
  return {
    ok: names.roleOk,
    warn: names.roleWarn,
    error: names.roleError,
    info: names.roleInfo,
    idle: names.roleIdle,
  };
}

/** The same mapping for a Widget that colours an inline SVG stroke rather than a class — Gauge's arc. */
export function roleCssVar(role: StatusRole): string {
  return `var(--status-${role})`;
}
