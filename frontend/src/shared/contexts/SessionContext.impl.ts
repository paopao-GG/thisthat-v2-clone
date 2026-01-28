import { createContext } from 'react';
import type { SessionContextType } from './SessionContext.types';

export const SessionContext = createContext<SessionContextType | undefined>(undefined);

