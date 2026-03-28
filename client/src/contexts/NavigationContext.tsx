import { createContext, useContext } from 'react';

interface NavigationContextValue {
  navigate: (view: string) => void;
}

export const NavigationContext = createContext<NavigationContextValue>({ navigate: () => {} });

export function useNavigation(): NavigationContextValue {
  return useContext(NavigationContext);
}
