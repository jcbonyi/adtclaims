import { useContext } from "react";
import { ValuationContext } from "./valuationContext";

export function useValuations() {
  const ctx = useContext(ValuationContext);
  if (!ctx) throw new Error("useValuations must be used within ValuationProvider");
  return ctx;
}
