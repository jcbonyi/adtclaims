import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { ValuationDispatchContext, ValuationStateContext } from "./valuationContext";
import { getInitialReducerState, valuationReducer } from "../valuationReducer";
import {
  createValuation,
  fetchValuations,
  fetchValuers,
  logValuationFollowUp,
  updateValuation,
} from "../api/valuationsApi";

export function ValuationProvider({ children }) {
  const [state, dispatch] = useReducer(valuationReducer, undefined, getInitialReducerState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const reloadFromServer = useCallback(async () => {
    const [data, valuers] = await Promise.all([fetchValuations(), fetchValuers()]);
    dispatch({ type: "HYDRATE", payload: { ...data, valuers } });
    return data;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [data, valuers] = await Promise.all([fetchValuations(), fetchValuers()]);
        if (!cancelled) {
          dispatch({ type: "HYDRATE", payload: { ...data, valuers } });
        }
      } catch (err) {
        console.warn("Valuation API load failed:", err);
        if (!cancelled) {
          dispatch({
            type: "SET_LOAD_ERROR",
            payload: "Could not reach server — please check your connection.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const syncDispatch = useCallback(async (action) => {
    switch (action.type) {
      case "ADD": {
        const created = await createValuation(action.payload);
        dispatch({ type: "UPSERT_VALUATION", payload: created });
        return created;
      }
      case "UPDATE": {
        const { id, patch } = action.payload;
        const current = stateRef.current.valuations.find((v) => v.id === id);
        if (!current) throw new Error("Valuation not found");
        const updated = await updateValuation(id, { ...current, ...patch });
        dispatch({ type: "UPSERT_VALUATION", payload: updated });
        return updated;
      }
      case "LOG_FOLLOW_UP": {
        const { id, ...payload } = action.payload;
        const updated = await logValuationFollowUp(id, payload);
        dispatch({ type: "UPSERT_VALUATION", payload: updated });
        return updated;
      }
      default:
        dispatch(action);
    }
  }, []);

  const dispatchValue = useMemo(
    () => ({ dispatch: syncDispatch, reloadFromServer }),
    [syncDispatch, reloadFromServer]
  );

  return (
    <ValuationDispatchContext.Provider value={dispatchValue}>
      <ValuationStateContext.Provider value={state}>{children}</ValuationStateContext.Provider>
    </ValuationDispatchContext.Provider>
  );
}
