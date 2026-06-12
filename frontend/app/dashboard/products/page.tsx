"use client";

import { AppShell } from "@/components/app-shell";
import { ProductProfilesPanel } from "@/components/products/product-profiles-panel";

export default function ProductsPage() {
  return (
    <AppShell
      titleKey="products.title"
      descriptionKey="products.description"
    >
      <ProductProfilesPanel />
    </AppShell>
  );
}
