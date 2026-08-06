/**
 * The active Profile's sanitised Dashboard collection.
 *
 * `DashboardPane`, `FocusModeView` and the shell's own resolution of which
 * Dashboard the chrome's "Focus Mode" trigger would open all read the same
 * "look up the raw collection, sanitise it if one is there" shape — kept
 * here once rather than as three copies of the same two lines free to drift
 * apart.
 */

import { useMemo } from 'react';
import { useSettings } from '../../contexts/SettingsContext';
import { sanitizeProfileDashboards } from './dashboardStore';
import type { ProfileDashboards } from './dashboardStore';

export function useProfileDashboards(profileId: string): ProfileDashboards | undefined {
  const { settings } = useSettings();
  const raw = settings.dashboardsByProfile[profileId];
  return useMemo(() => (raw === undefined ? undefined : sanitizeProfileDashboards(raw)), [raw]);
}
