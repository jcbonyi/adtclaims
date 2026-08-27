import { Link } from "react-router-dom";
import { AppLayout as SharedLayout } from "../../quotationRegister/components/AppLayout";
import { renewalsPath } from "../basePath";

export function AppLayout({ children, failureCount = 0 }) {
  return (
    <SharedLayout
      title="Policy Renewals"
      subtitle="Reminders at 60, 30, 15, 7 and 1 day before expiry"
      extra={
        failureCount > 0 ? (
          <Link to={renewalsPath("failures")} className="adt-workspace-alert">
            {failureCount} open delivery failure{failureCount === 1 ? "" : "s"}
          </Link>
        ) : null
      }
    >
      {children}
    </SharedLayout>
  );
}
