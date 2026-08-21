import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { fetchRenewals, fetchRenewalsDashboard } from "./api/renewalsApi";
import { renewalsPath } from "./basePath";
import { canManageRenewalSettings } from "./constants";
import { AppLayout } from "./components/AppLayout";
import { Analytics } from "./components/Analytics";
import { Dashboard } from "./components/Dashboard";
import { Failures } from "./components/Failures";
import { Financiers } from "./components/Financiers";
import { NotificationLog } from "./components/NotificationLog";
import { PolicyDetail } from "./components/PolicyDetail";
import { Register } from "./components/Register";
import { Settings } from "./components/Settings";
import { AlertBanner, LoadingState } from "./components/ui";
import "./renewals.css";

function RenewalsShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [policies, setPolicies] = useState([]);
  const [failureCount, setFailureCount] = useState(0);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");

  const reload = useCallback(async () => {
    const [list, dash] = await Promise.all([fetchRenewals(), fetchRenewalsDashboard()]);
    setPolicies(list.policies || []);
    setFailureCount(dash.kpis?.open_failures || 0);
    return list;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await reload();
      } catch (err) {
        console.warn("Renewals API load failed:", err);
        if (!cancelled) setLoadError("Could not reach server — please check your connection.");
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const openPolicy = (id) => {
    navigate(renewalsPath(`policy/${id}`), { state: { from: location.pathname } });
  };

  if (!ready) {
    return (
      <div className="renewals-module-root quotation-module-root val-module-loading">
        <LoadingState label="Loading renewals…" />
      </div>
    );
  }

  return (
    <div className="renewals-module-root quotation-module-root">
      {loadError ? <AlertBanner tone="warning">{loadError}</AlertBanner> : null}
      <AppLayout failureCount={failureCount}>
        <Routes>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard onOpenPolicy={openPolicy} />} />
          <Route path="analytics" element={<Analytics />} />
          <Route
            path="register"
            element={
              <Register
                policies={policies}
                onView={openPolicy}
                onCreate={() => navigate(renewalsPath("policy/new"))}
                onReload={reload}
              />
            }
          />
          <Route path="failures" element={<Failures onChanged={reload} />} />
          <Route path="log" element={<NotificationLog />} />
          <Route path="financiers" element={<Financiers />} />
          <Route path="policy/:id" element={<PolicyDetail />} />
          <Route
            path="settings"
            element={
              canManageRenewalSettings(user?.role) ? <Settings /> : <Navigate to={renewalsPath("dashboard")} replace />
            }
          />
          <Route path="*" element={<Navigate to="dashboard" replace />} />
        </Routes>
      </AppLayout>
    </div>
  );
}

export default function RenewalsModule() {
  return <RenewalsShell />;
}
