/**
 * Injection point for the {@link BackendPort}.
 *
 * The port is supplied at the application root rather than imported as a
 * singleton, so a test or a browser session can substitute a fake without any
 * consumer knowing which implementation it holds.
 *
 * There is no default value on purpose. A component that reads this outside the
 * provider is misplaced, and failing loudly at mount is better than silently
 * issuing calls into nothing.
 */

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { BackendPort } from '../services/backendPort';

const BackendPortContext = createContext<BackendPort | null>(null);

interface BackendPortProviderProps {
  readonly port: BackendPort;
  readonly children: ReactNode;
}

export function BackendPortProvider({ port, children }: BackendPortProviderProps): React.JSX.Element {
  return <BackendPortContext.Provider value={port}>{children}</BackendPortContext.Provider>;
}

export function useBackendPort(): BackendPort {
  const port = useContext(BackendPortContext);
  if (port === null) {
    throw new Error('useBackendPort must be used within a BackendPortProvider');
  }
  return port;
}
