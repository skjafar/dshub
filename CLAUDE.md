# TypeScript Project

This project uses TypeScript with strict configuration.

## TypeScript Configuration
- Strict mode enabled
- No implicit any
- Strict null checks
- ES modules

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
