import { AppLayout as SharedLayout } from "../../quotationRegister/components/AppLayout";

export function AppLayout({ children, onOpenSearch }) {
  return (
    <SharedLayout
      title="Motor Valuation Tracker"
      subtitle="2-day valuation report turnaround"
      onOpenSearch={onOpenSearch}
    >
      {children}
    </SharedLayout>
  );
}
