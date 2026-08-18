# 06 — A Settings/theme change in one Window applies live to every other open Window

**What to build:** changing the theme, or any other setting, in the Main Window's Settings dialog is reflected immediately in every already-open Daughter Window, with no reopen needed.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Changing the theme in the Main Window updates an already-open Daughter Window's appearance without a reopen or manual refresh
- [ ] The same holds in reverse, for any setting changeable from context available in a Daughter Window
- [ ] No Rust-relayed settings-broadcast channel is introduced for this — it rides the platform's own same-origin `storage` event, which is available for free now that every window shares one origin again
