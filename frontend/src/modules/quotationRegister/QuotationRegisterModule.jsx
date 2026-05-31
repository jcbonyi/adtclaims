import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { QuotationProvider } from "./context/QuotationProvider";
import { UiProvider } from "./context/UiProvider";
import { AppLayout } from "./components/AppLayout";
import { Dashboard } from "./components/Dashboard";
import { Register } from "./components/Register";
import { FollowUpView } from "./components/FollowUpView";
import { Analytics } from "./components/Analytics";
import { ClientDetail } from "./components/ClientDetail";
import { useQuotations } from "./context/useQuotations";
import { useUi } from "./context/uiContext";
import { quotationPath } from "./basePath";
import { QuickSearchModal } from "./components/QuickSearchModal";
import "./quotationRegister.css";

function QuotationShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { state } = useQuotations();
  const { notify } = useUi();
  const [searchOpen, setSearchOpen] = useState(false);

  const openClient = (id) => {
    navigate(quotationPath(`client/${id}`), { state: { from: location.pathname } });
  };

  function runQuickSearch(query) {
    const found = state.quotations.find((q) =>
      q.clientName.toLowerCase().includes(query.toLowerCase())
    );
    if (found) {
      navigate(quotationPath(`client/${found.id}`), { state: { from: location.pathname } });
    } else {
      notify("No client matched that search.");
    }
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

  return (
    <div className="quotation-module-root">
      <AppLayout onOpenSearch={() => setSearchOpen(true)}>
        <Routes>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard onOpenClient={openClient} />} />
          <Route path="register" element={<Register onView={openClient} />} />
          <Route path="followup" element={<FollowUpView onOpenClient={openClient} />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="client/:id" element={<ClientDetail />} />
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

export default function QuotationRegisterModule() {
  return (
    <QuotationProvider>
      <UiProvider>
        <QuotationShell />
      </UiProvider>
    </QuotationProvider>
  );
}
