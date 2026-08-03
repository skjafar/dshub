import { describe, it, expect } from 'vitest';
import { PANES, isKnownPaneKind, kindOfPaneId, paneDefinition, paneId } from '../paneRegistry';

/**
 * The registry is the single list three things read: what the Workspace can
 * restore from a saved layout, what the reopen menu offers, and what the default
 * arrangement asks for. They drift silently if any of them keeps its own copy,
 * and the symptom is a Pane that can be closed and never reopened.
 */
describe('pane registry', () => {
  it('gives every Pane kind a title and a description for the reopen menu', () => {
    for (const pane of PANES) {
      expect(pane.title, pane.kind).toMatch(/\S/);
      expect(pane.description, pane.kind).toMatch(/\S/);
      expect(pane.component, pane.kind).toBeTypeOf('function');
    }
  });

  it('holds each kind exactly once', () => {
    const kinds = PANES.map(p => p.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it('finds a definition by kind', () => {
    for (const pane of PANES) {
      expect(paneDefinition(pane.kind)).toBe(pane);
    }
  });

  it('rejects a kind it does not have, rather than guessing', () => {
    // A stored layout can name a Pane kind this build no longer has — after a
    // downgrade, or a kind retired between versions. Restoring has to skip it
    // rather than fail, which is what keeps a stale layout usable instead of
    // opening an empty window.
    expect(paneDefinition('registers-from-the-future')).toBeUndefined();
    expect(isKnownPaneKind('registers-from-the-future')).toBe(false);
  });

  it('recognises every kind it holds', () => {
    for (const pane of PANES) {
      expect(isKnownPaneKind(pane.kind), pane.kind).toBe(true);
    }
  });
});

/**
 * Panel ids. Dockview rejects a duplicate id by throwing, and `openPane` runs
 * from a menu click in the chrome — outside every Pane's own error boundary — so
 * a collision would take the whole application down rather than one surface.
 */
describe('pane ids', () => {
  it('gives a singleton its bare kind, so a saved layout keeps naming it', () => {
    expect(paneId('overview')).toBe('overview');
  });

  it('numbers further instances', () => {
    expect(paneId('overview', 1)).toBe('overview#1');
    expect(paneId('overview', 2)).toBe('overview#2');
  });

  it('reads the kind back off any instance id', () => {
    expect(kindOfPaneId('overview')).toBe('overview');
    expect(kindOfPaneId('overview#3')).toBe('overview');
  });

  it('refuses an id whose kind this build does not have', () => {
    expect(kindOfPaneId('plot#1')).toBeUndefined();
    expect(kindOfPaneId('')).toBeUndefined();
  });
});
