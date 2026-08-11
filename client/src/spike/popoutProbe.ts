/**
 * Issue 01's spike: does dockview's popout mechanism work inside Tauri's
 * webview on this platform?
 *
 * Throwaway by intent, but committed rather than run from a scratch file
 * because the question has to be asked on three platforms and only one of them
 * is a machine anyone is sitting at — `.github/workflows/popout-spike.yml`
 * runs exactly this against the build matrix.
 *
 * It drives dockview's *real* `addPopoutGroup` rather than a hand-rolled
 * `window.open`, because the thing in doubt is not whether the host webview
 * has the API at all but whether dockview's whole path through it survives:
 * the same-origin assertion, the adopted DOM, and the opener's stylesheets
 * arriving in another document. A replica that passed while the real path
 * failed would be worse than no spike.
 */

import type { DockviewApi } from 'dockview';

/** One question the spike asks, and what the platform answered. */
export interface ProbeFinding {
  readonly name: string;
  readonly passed: boolean;
  readonly detail: string;
}

export interface ProbeReport {
  readonly userAgent: string;
  readonly origin: string;
  readonly protocol: string;
  readonly findings: readonly ProbeFinding[];
  /** False if any finding failed — the verdict CI greps for. */
  readonly passed: boolean;
}

function finding(name: string, passed: boolean, detail: string): ProbeFinding {
  return { name, passed, detail };
}

/**
 * Whether dockview's own `assertSameOriginPopoutUrl` would accept this
 * document's origin — restated rather than imported because dockview does not
 * export it, and phase 2 of the spike is precisely the question of whether
 * this predicate holds under Tauri's production scheme.
 */
export function popoutOriginAcceptable(href: string, popoutUrl: string): boolean {
  let resolved: URL;
  try {
    resolved = new URL(popoutUrl, href);
  } catch {
    return false;
  }
  const protocolOk = resolved.protocol === 'http:' || resolved.protocol === 'https:';
  return protocolOk && resolved.origin === new URL(href).origin;
}

const POPOUT_URL = '/popout.html';

/**
 * Runs the spike against a live dock api holding at least one panel.
 *
 * Never throws: a platform that refuses at any step has to produce a *report*
 * saying so, since a thrown error on one runner of a three-way matrix reads
 * the same as a broken harness.
 */
export async function runPopoutProbe(api: DockviewApi): Promise<ProbeReport> {
  const findings: ProbeFinding[] = [];
  const href = window.location.href;

  findings.push(
    finding(
      'origin-acceptable',
      popoutOriginAcceptable(href, POPOUT_URL),
      `location=${window.location.origin} protocol=${window.location.protocol}`
    )
  );

  const panel = api.panels[0];
  if (panel === undefined) {
    findings.push(finding('probe-harness', false, 'no panel to pop out'));
    return report(findings);
  }

  let opened: boolean;
  try {
    opened = await api.addPopoutGroup(panel, {
      popoutUrl: POPOUT_URL,
      position: { left: 80, top: 80, width: 480, height: 360 },
    });
    findings.push(finding('addPopoutGroup', opened, `returned ${String(opened)}`));
  } catch (error) {
    findings.push(finding('addPopoutGroup', false, `threw: ${String(error)}`));
    return report(findings);
  }

  if (!opened) {
    // dockview returns false for a blocked `window.open` and for a host webview
    // that never creates the window at all. Both are the same verdict here.
    findings.push(finding('window-open', false, 'popout was refused by the host webview'));
    return report(findings);
  }

  const popouts = api.getPopouts();
  const popout = popouts[0];
  if (popout === undefined) {
    findings.push(finding('getPopouts', false, 'no popout enumerated after a successful open'));
    return report(findings);
  }
  findings.push(finding('getPopouts', true, `${popouts.length} popout(s)`));

  // Same-origin usability. A host that hands back an opaque `Window` — one whose
  // `document` throws or reads null — is indistinguishable from no window at all
  // for this feature's purposes, since every later step writes into that document.
  let popoutDocument: Document | null;
  try {
    popoutDocument = popout.window.document;
    findings.push(finding('same-origin-document', popoutDocument !== null, `readyState=${popoutDocument?.readyState}`));
  } catch (error) {
    findings.push(finding('same-origin-document', false, `threw: ${String(error)}`));
    return report(findings);
  }
  if (popoutDocument === null) return report(findings);

  // The adopted DOM: dockview moves the group's live element into the other
  // document rather than re-rendering it there, which is the whole basis of
  // "one React tree, one poll registry".
  const adopted = popoutDocument.querySelector('.dv-popout-window');
  findings.push(
    finding(
      'adopted-dom',
      adopted !== null && adopted.childElementCount > 0,
      adopted === null ? 'no .dv-popout-window container in the popout document' : `${adopted.childElementCount} child element(s)`
    )
  );

  // The opener's stylesheets. Copied across by dockview on load; if they do not
  // arrive the window opens as unstyled boxes, which is a fail rather than a
  // cosmetic problem — a Daughter Window has to be the same surface.
  const styleCount = popoutDocument.querySelectorAll('style, link[rel="stylesheet"]').length;
  findings.push(finding('stylesheets-copied', styleCount > 1, `${styleCount} style node(s) in the popout document`));

  // Theme variables are applied per popout document (`applyThemeVariables` takes
  // its root), so the popout's own root element has to be writable from here.
  try {
    popoutDocument.documentElement.style.setProperty('--dshub-spike', 'ok');
    const readBack = popoutDocument.documentElement.style.getPropertyValue('--dshub-spike');
    popoutDocument.documentElement.style.removeProperty('--dshub-spike');
    findings.push(finding('custom-properties-writable', readBack === 'ok', `read back "${readBack}"`));
  } catch (error) {
    findings.push(finding('custom-properties-writable', false, `threw: ${String(error)}`));
  }

  // Round-trip: the popout has to survive serialization, since a Daughter Window
  // is stored with the Workspace and restored from exactly this field.
  const serialized = api.toJSON();
  const popoutGroups = serialized.popoutGroups ?? [];
  findings.push(
    finding(
      'serializes-popout-groups',
      popoutGroups.length > 0,
      `popoutGroups=${popoutGroups.length} position=${JSON.stringify(popoutGroups[0]?.position ?? null)}`
    )
  );

  return report(findings);
}

function report(findings: readonly ProbeFinding[]): ProbeReport {
  return {
    userAgent: navigator.userAgent,
    origin: window.location.origin,
    protocol: window.location.protocol,
    findings,
    passed: findings.every(f => f.passed),
  };
}
