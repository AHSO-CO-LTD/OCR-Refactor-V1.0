import { redirect } from "next/navigation";

export default function CameraPage() {
  redirect("/dashboard/configuration?tab=camera");
}
