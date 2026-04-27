import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import DashboardPage from "./pages/DashboardPage";
import ClaimDetailPage from "./pages/ClaimDetailPage";
import ClaimsRegisterPage from "./pages/ClaimsRegisterPage";
import ForcePasswordChangePage from "./pages/ForcePasswordChangePage";
import LoginPage from "./pages/LoginPage";
import UserManagementPage from "./pages/UserManagementPage";
import ShellLayout from "./ui/ShellLayout";

function ProtectedRoute({ children }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function AdminRoute({ children }) {
  const { user } = useAuth();
  if (user?.role !== "Admin") return <Navigate to="/dashboard" replace />;
  return children;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <ShellLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="claims" element={<ClaimsRegisterPage />} />
        <Route path="claims/new" element={<ClaimDetailPage mode="create" />} />
        <Route path="claims/:id" element={<ClaimDetailPage mode="edit" />} />
        <Route path="change-password" element={<ForcePasswordChangePage />} />
        <Route
          path="users"
          element={
            <AdminRoute>
              <UserManagementPage />
            </AdminRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
