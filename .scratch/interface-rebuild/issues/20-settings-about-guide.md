# 20 — Settings, About and Guide

**What to build:** The three surfaces that are not working tools, as dialogs rather than destinations — they occupied permanent navigation slots in the old interface for no better reason than that everything did.

Settings covers theme choice, connection behaviour including auto-scan and auto-connect with its retry policy, plot defaults, and Activity Log filtering and retention. About reports application and Device identity. The Guide explains the workflow and is reachable from the chrome.

Settings is where the application's own preferences live, not where Profile content is edited — that belongs to Profile management. Keeping that boundary clean is part of this ticket.

**Blocked by:** 05

**Status:** done

- [x] Settings, About and the Guide open as dialogs from the chrome
- [x] Settings covers theme, connection behaviour, plot defaults and log filtering and retention
- [x] Changing a setting takes effect without a restart
- [x] Settings contains no Profile content
- [x] A storage failure when saving preferences is reported rather than silently dropped
- [x] All three are fully operable by keyboard and trap focus correctly
