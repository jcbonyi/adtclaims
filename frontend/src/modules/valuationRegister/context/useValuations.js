import { useContext, useMemo } from "react";
import { ValuationDispatchContext, ValuationStateContext } from "./valuationContext";

export function useValuations() {
  const state = useContext(ValuationStateContext);
  const actions = useContext(ValuationDispatchContext);
  if (!state || !actions) {
    throw new Error("useValuations must be used within ValuationProvider");
  }
  return useMemo(
    () => ({ state, dispatch: actions.dispatch, reloadFromServer: actions.reloadFromServer }),
    [state, actions]
  );
}

/** Subscribe only to dispatch actions — avoids re-renders when list data changes. */
export function useValuationActions() {
  const actions = useContext(ValuationDispatchContext);
  if (!actions) throw new Error("useValuationActions must be used within ValuationProvider");
  return actions;
}
