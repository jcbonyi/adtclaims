import { createContext } from "react";

export const ValuationStateContext = createContext(null);
export const ValuationDispatchContext = createContext(null);

/** @deprecated use ValuationStateContext — kept for compatibility */
export const ValuationContext = ValuationStateContext;
