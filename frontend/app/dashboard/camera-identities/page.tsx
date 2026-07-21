import { redirect } from "next/navigation";

export default function CameraIdentitiesPage() {
  redirect("/dashboard/configuration?tab=identities");
}
