import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { ValuationProvider } from "./context/ValuationProvider";
import { useValuations } from "./context/useValuations";
import { valuationPath } from "./basePath";
import { AppLayout } from "./components/AppLayout";
import { Dashboard } from "./components/Dashboard";
import { Register } from "./components/Register";
import { FollowUpView } from "./components/FollowUpView";
import { Analytics } from "./components/Analytics";
import { ValuationDetail } from "./components/ValuationDetail";
import { ValuerManagement } from "./components/ValuerManagement";
import { QuickSearchModal } from "./components/QuickSearchModal";
import { canManageValuers } from "./constants";
import "./valuationRegister.css";

function ValuationShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { state } = useValuations();
  const [searchOpen, setSearchOpen] = useState(false);

  const openValuation = (id) => {
    navigate(valuationPath(`valuation/${id}`), { state: { from: location.pathname } });
  };

  function runQuickSearch(query) {
    navigate(valuationPath(`register?q=${encodeURIComponent(query)}`));
  }

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!state.ready) {
    return (
      <div className="valuation-module-root quotation-module-root" style={{ padding: 24 }}>
        <p>Loading motor valuations…</p>
      </div>
    );
  }

  return (
    <div className="valuation-module-root quotation-module-root">
      {state.loadError ? (
        <div role="status" style={{ margin: "0 0 12px", padding: "10px 14px", background: "#FEF3C7", borderRadius: 8 }}>
          {state.loadError}
        </div>
      ) : null}
      <AppLayout onOpenSearch={() => setSearchOpen(true)}>
        <Routes>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard onOpenValuation={openValuation} />} />
          <Route
            path="register"
            element={
              <Register
                onView={openValuation}
                onCreate={() => navigate(valuationPath("valuation/new"))}
              />
            }
          />
          <Route path="followup" element={<FollowUpView onOpenValuation={openValuation} />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="valuation/:id" element={<ValuationDetail />} />
          <Route
            path="valuers"
            element={
              canManageValuers(user?.role) ? (
                <ValuerManagement />
              ) : (
                <Navigate to={valuationPath("dashboard")} replace />
              )
            }
          />
          <Route path="*" element={<Navigate to="dashboard" replace />} />
        </Routes>
      </AppLayout>
      <QuickSearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSearch={runQuickSearch}
      />
    </div>
  );
}

export default function ValuationRegisterModule() {
  return (
    <ValuationProvider>
      <ValuationShell />
    </ValuationProvider>
  );
}
