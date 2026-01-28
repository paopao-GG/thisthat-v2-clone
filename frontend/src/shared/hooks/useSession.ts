import { useContext } from 'react';
import { SessionContext } from '@shared/contexts/SessionContext.impl';
import type { SessionContextType } from '@shared/contexts/SessionContext.types';

/**
 * Custom hook for session management
 * Must be used within a SessionProvider
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { showSessionExpired } = useSession();
 * 
 *   return <button onClick={showSessionExpired}>Show Session Expired</button>;
 * }
 * ```
 */
export function useSession(): SessionContextType {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}

