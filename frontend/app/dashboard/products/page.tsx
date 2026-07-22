import { redirect } from "next/navigation";

export default function ProductsPage() {
  redirect("/dashboard/configuration?tab=products");
}
