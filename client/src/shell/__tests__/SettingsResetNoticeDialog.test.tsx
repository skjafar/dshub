// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsResetNoticeDialog } from '../SettingsResetNoticeDialog';

afterEach(cleanup);

describe('SettingsResetNoticeDialog — Profiles carried over', () => {
  it('names what reset and states plainly that Profiles did not', () => {
    render(
      <SettingsResetNoticeDialog open onOpenChange={() => {}} profilesCarriedOver onOpenProfiles={() => {}} />
    );

    expect(
      screen.getByRole('dialog', { name: 'This is the rebuilt interface' })
    ).toBeInTheDocument();
    expect(screen.getByText(/your profiles.*carried across untouched/i)).toBeInTheDocument();
  });

  it('opens Profiles and closes itself on the export pointer', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onOpenProfiles = vi.fn();
    render(
      <SettingsResetNoticeDialog
        open
        onOpenChange={onOpenChange}
        profilesCarriedOver
        onOpenProfiles={onOpenProfiles}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Open Profiles' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onOpenProfiles).toHaveBeenCalled();
  });
});

describe('SettingsResetNoticeDialog — a corrupt blob, Profiles included', () => {
  /**
   * Pins the Spec-review finding for ticket 21: a corrupt or unreadable
   * settings blob resets Profiles too, not just Dashboards/Workspaces. The
   * notice must not claim Profiles "carried across untouched" here — that
   * would read as reassurance while data was actually lost, worse than the
   * plain data-loss reading the ticket exists to prevent.
   */
  it('does not claim Profiles survived', () => {
    render(
      <SettingsResetNoticeDialog
        open
        onOpenChange={() => {}}
        profilesCarriedOver={false}
        onOpenProfiles={() => {}}
      />
    );

    expect(screen.queryByText(/carried across untouched/i)).not.toBeInTheDocument();
    expect(screen.getByText(/could not be read/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing could be carried forward, including profiles/i)).toBeInTheDocument();
  });
});
