import { AppShell } from "@/components/app-shell";
import { UserManagementPanel } from "@/components/users/user-management-panel";

export default function UsersPage() {
  return (
    <AppShell titleKey="users.title" descriptionKey="users.description">
      <UserManagementPanel />
    </AppShell>
  );
}
