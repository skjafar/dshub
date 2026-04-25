# TypeScript Project

This project uses TypeScript with strict configuration.

## TypeScript Configuration
- Strict mode is currently **off** (`"strict": false` in `client/tsconfig.json` — relaxed during ongoing migration). New code should still be written as if strict were on: no implicit any, explicit null handling, no unchecked indexed access.
- ES modules (`"type": "module"` in `client/package.json`)
- `noFallthroughCasesInSwitch: true`

## Type Conventions
- Prefer interfaces for object shapes
- Use type aliases for unions/intersections
- Export types alongside implementations
- Avoid `any` - use `unknown` if type is truly unknown

## Patterns
- Use discriminated unions for state
- Prefer readonly arrays and objects where applicable
- Use generics for reusable type-safe functions
- Leverage utility types (Partial, Required, Pick, Omit)

## Code Style
- Use explicit return types for exported functions
- Use const assertions for literal types
- Prefer nullish coalescing (??) over OR (||)
- Use optional chaining (?.) for safe property access

## File Organization
- One export per file when possible
- Co-locate types with implementations
- Use barrel exports (index.ts) for public APIs

## Commands
- `npm run build` - Compile TypeScript
- `npm run typecheck` - Check types without emitting
- `npm run lint` - Run ESLint with TypeScript rules
- `npm run dev` - Start both server (port 3002) and Vite client (port 3000) via concurrently

## Playwright / Browser Screenshots

The MCP Playwright plugin expects Chrome at `/opt/google/chrome/chrome` which doesn't exist on this system. Instead, use the Playwright-core Chromium binary directly via a Node script:

```bash
CHROMIUM="/home/sofian/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core/.local-browsers/chromium-1208/chrome-linux64/chrome"

# Simple single-page screenshot:
$CHROMIUM --headless --no-sandbox --screenshot=/tmp/screenshot.png --window-size=1440,900 http://localhost:3000

# Multi-view screenshots with navigation (use Playwright API):
node -e "
const { chromium } = require('/home/sofian/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: '$CHROMIUM', args: ['--no-sandbox'] });
  // Use colorScheme: 'dark' for dark mode
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');
  await page.click('text=Settings', { timeout: 3000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/dshub-settings.png' });
  await browser.close();
})();
"
```

If the Chromium binary is missing, reinstall with: `npx -y playwright install chromium`
Firefox is also installed at: `/home/sofian/.cache/ms-playwright/firefox-1509/`

## Design Context

### Users
DSHub serves two overlapping personas with equal weight:

1. **The Engineer** — Embedded or firmware developer at a workstation. Uses DSHub during active hardware development to read/write registers, inspect parameters, and debug live device behavior. Wants precise control, raw data access, and zero friction.

2. **The Operator** — Industrial technician or engineer monitoring live equipment. Uses DSHub as a primary interface to watch system health, react to states, and execute commands. Needs clarity at a glance and trustworthy status feedback.

Both need the UI to get out of the way and surface what matters.

### Brand Personality
**Three words:** Calm. Precise. Capable.

DSHub is an expert co-pilot — smart, composed, always showing you what matters. Emotional goals: **confidence, clarity, focus**.

### Aesthetic Direction
Dark-first. Industrial precision with editorial restraint. Minimal surface, maximum information density.

**Existing system:** 5-level surface hierarchy (tonal, not shadow-based), cyan/lime/gold accents, ghost borders at 15–40% opacity, 2–4px radius, Inter + Space Grotesk, tabular numerics.

**Avoid:** Generic enterprise SaaS, consumer/app-store roundness, retro terminal pastiche, gamer RGB neon excess.

### Design Principles
1. **Information first** — Every element must carry information or guide attention. Remove decoration that doesn't communicate.
2. **Hierarchy through tone, not noise** — Surface levels and ghost borders create depth. Avoid heavy shadows and competing visual weights.
3. **Precision at every scale** — Exact spacing, consistent geometry, tabular alignment on numeric data.
4. **Calm confidence** — No excessive animations, no status ambiguity, no cluttered panels. Communicate changes clearly and once.
5. **Serve both modes** — Detail-rich for debugging, scannable at a glance for monitoring.
