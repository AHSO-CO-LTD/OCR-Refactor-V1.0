import { redirect } from "next/navigation";

export default function CameraDebugPage() {
  redirect("/dashboard/configuration?tab=debug");
}
