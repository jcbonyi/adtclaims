import { valuationForList } from "./utils/valuationListItem";

export function getInitialReducerState() {
  return {
    ready: false,
    loadError: null,
    valuations: [],
    valuers: [],
    nextId: 1,
    dashboard: null,
  };
}

export function valuationReducer(state, action) {
  switch (action.type) {
    case "HYDRATE":
      return {
        ...state,
        ready: true,
        loadError: null,
        valuations: action.payload.valuations || [],
        valuers: action.payload.valuers || state.valuers,
        nextId: action.payload.nextId || 1,
      };
    case "UPSERT_VALUATION": {
      const item = valuationForList(action.payload);
      const idx = state.valuations.findIndex((v) => v.id === item.id);
      const valuations =
        idx >= 0
          ? state.valuations.map((v) => (v.id === item.id ? { ...v, ...item } : v))
          : [...state.valuations, item];
      return {
        ...state,
        valuations,
        nextId: Math.max(state.nextId, Number(item.id) + 1),
      };
    }
    case "SET_VALUERS":
      return { ...state, valuers: action.payload };
    case "SET_DASHBOARD":
      return { ...state, dashboard: action.payload };
    case "SET_LOAD_ERROR":
      return { ...state, loadError: action.payload, ready: true };
    default:
      return state;
  }
}
