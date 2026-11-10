import {createContext, useContext, useReducer, useRef, type Dispatch, type PropsWithChildren} from 'react';
import {companionReducer, createCompanionDemoState, type CompanionAction, type CompanionState} from './companionModel';

const CompanionContext = createContext<{state: CompanionState; dispatch: Dispatch<CompanionAction>; nextTransactionId: (kind: string) => string} | null>(null);
export function CompanionProvider({children}: PropsWithChildren) {
  const [state, dispatch] = useReducer(companionReducer, undefined, createCompanionDemoState);
  const sequence = useRef(0);
  const nextTransactionId = (kind: string) => `${kind}-${++sequence.current}`;
  return <CompanionContext.Provider value={{state, dispatch, nextTransactionId}}>{children}</CompanionContext.Provider>;
}
export function useCompanions() {
  const value = useContext(CompanionContext);
  if (!value) throw new Error('CompanionProvider is required');
  return value;
}
/** Keep the unfinished economy out of store builds until the backend is connected. */
export function isCompanionPreviewEnabled() {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}
