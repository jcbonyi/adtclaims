import { useCallback, useEffect, useMemo, useReducer } from "react";
import { ValuationContext } from "./valuationContext";
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

  const syncDispatch = useCallback(
    async (action) => {
      switch (action.type) {
        case "ADD": {
          await createValuation(action.payload);
          await reloadFromServer();
          return;
        }
        case "UPDATE": {
          const { id, patch } = action.payload;
          const current = state.valuations.find((v) => v.id === id);
          if (!current) throw new Error("Valuation not found");
          await updateValuation(id, { ...current, ...patch });
          await reloadFromServer();
          return;
        }
        case "LOG_FOLLOW_UP": {
          const { id, ...payload } = action.payload;
          await logValuationFollowUp(id, payload);
          await reloadFromServer();
          return;
        }
        default:
          dispatch(action);
      }
    },
    [reloadFromServer, state.valuations]
  );

  const value = useMemo(
    () => ({ state, dispatch: syncDispatch, reloadFromServer }),
    [state, syncDispatch, reloadFromServer]
  );

  return <ValuationContext.Provider value={value}>{children}</ValuationContext.Provider>;
}
