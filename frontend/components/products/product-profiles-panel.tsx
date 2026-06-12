"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { ApplyProductProfilePanel } from "@/components/products/apply-product-profile-panel";
import { ProductProfileForm } from "@/components/products/product-profile-form";
import { ProductProfilesTable } from "@/components/products/product-profiles-table";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import type { ProductProfile, ProductProfilePayload } from "@/lib/api";
import {
  ApiError,
  applyProductProfile,
  createProductProfile,
  deleteProductProfile,
  listProductProfiles,
  updateProductProfile,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { getAccessToken } from "@/lib/session";

export function ProductProfilesPanel() {
  const { apiError, t } = useI18n();
  const [products, setProducts] = useState<ProductProfile[]>([]);
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);
  const [sourceProductId, setSourceProductId] = useState("");
  const [editingProduct, setEditingProduct] = useState<ProductProfile | null>(
    null,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [deletingProduct, setDeletingProduct] =
    useState<ProductProfile | null>(null);
  const [pendingApply, setPendingApply] = useState(false);
  const [applyToAll, setApplyToAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");

  const loadProducts = useCallback(async () => {
    const token = getAccessToken();

    if (!token) {
      return;
    }

    try {
      const response = await listProductProfiles(token);
      setProducts(response.data);
      setError("");
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? apiError(cause.message, "products.loadError")
          : t("products.loadError");
      setError(message);
      toast.error(message);
    }
  }, [apiError, t]);

  useEffect(() => {
    const token = getAccessToken();

    if (!token) {
      return;
    }

    listProductProfiles(token)
      .then((response) => {
        setProducts(response.data);
        setError("");
      })
      .catch((cause) => {
        const message =
          cause instanceof ApiError
            ? apiError(cause.message, "products.loadError")
            : t("products.loadError");
        setError(message);
        toast.error(message);
      })
      .finally(() => setLoading(false));
  }, [apiError, t]);

  async function handleSubmit(payload: ProductProfilePayload) {
    const token = getAccessToken();

    if (!token) {
      toast.error(t("users.missingSession"));
      return;
    }

    setSaving(true);
    const toastId = toast.loading(t("products.saving"));

    try {
      if (editingProduct) {
        await updateProductProfile(token, editingProduct.id, payload);
        toast.success(t("products.updateSuccess"), { id: toastId });
      } else {
        await createProductProfile(token, payload);
        toast.success(t("products.createSuccess"), { id: toastId });
      }

      setCreateOpen(false);
      setEditingProduct(null);
      await loadProducts();
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? apiError(cause.message, "products.saveError")
          : t("products.saveError");
      toast.error(message, { id: toastId });
      throw cause;
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const token = getAccessToken();

    if (!token || !deletingProduct) {
      toast.error(t("users.missingSession"));
      return;
    }

    setSaving(true);
    const toastId = toast.loading(t("products.deleting"));

    try {
      await deleteProductProfile(token, deletingProduct.id);
      toast.success(t("products.deleteSuccess"), { id: toastId });
      setDeletingProduct(null);
      setSelectedTargetIds((current) =>
        current.filter((id) => id !== deletingProduct.id),
      );
      await loadProducts();
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? apiError(cause.message, "products.deleteError")
          : t("products.deleteError");
      toast.error(message, { id: toastId });
    } finally {
      setSaving(false);
    }
  }

  async function handleApplyProfile() {
    const token = getAccessToken();

    if (!token) {
      toast.error(t("users.missingSession"));
      return;
    }

    setApplying(true);
    const toastId = toast.loading(t("products.applying"));

    try {
      const response = await applyProductProfile(token, {
        sourceProductId,
        targetProductIds: selectedTargetIds.filter(
          (id) => id !== sourceProductId,
        ),
        applyToAll,
      });
      toast.success(
        `${t("products.applySuccess")} ${response.data.updatedCount}`,
        { id: toastId },
      );
      setPendingApply(false);
      await loadProducts();
    } catch (cause) {
      const message =
        cause instanceof ApiError
          ? apiError(cause.message, "products.applyError")
          : t("products.applyError");
      toast.error(message, { id: toastId });
    } finally {
      setApplying(false);
    }
  }

  function toggleSelected(productId: string) {
    setSelectedTargetIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId],
    );
  }

  return (
    <div className="min-w-0 space-y-4">
      {createOpen || editingProduct ? (
        <ProductProfileForm
          key={editingProduct?.id ?? "create"}
          product={editingProduct}
          products={products}
          saving={saving}
          onCancel={() => {
            setCreateOpen(false);
            setEditingProduct(null);
          }}
          onSubmit={handleSubmit}
        />
      ) : (
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="h-12 px-5 text-base"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("products.createProfile")}
          </Button>
        </div>
      )}

      <ApplyProductProfilePanel
        products={products}
        sourceProductId={sourceProductId}
        selectedTargetIds={selectedTargetIds}
        applyToAll={applyToAll}
        applying={applying}
        onSourceChange={setSourceProductId}
        onApplyToAllChange={setApplyToAll}
        onApply={() => setPendingApply(true)}
      />

      {error ? (
        <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <ProductProfilesTable
        loading={loading}
        products={products}
        selectedIds={selectedTargetIds}
        busyProductId={saving ? deletingProduct?.id : undefined}
        onToggleSelected={toggleSelected}
        onEdit={(product) => {
          setCreateOpen(false);
          setEditingProduct(product);
        }}
        onDelete={setDeletingProduct}
      />

      <ConfirmModal
        open={deletingProduct !== null}
        title={t("products.confirmDeleteTitle")}
        description={
          deletingProduct
            ? `${t("products.confirmDeleteDescription")} ${deletingProduct.code}`
            : t("products.confirmDeleteDescription")
        }
        confirmLabel={
          saving ? t("products.deleting") : t("products.confirmDelete")
        }
        cancelLabel={t("common.cancel")}
        loading={saving}
        destructive
        onConfirm={handleDelete}
        onCancel={() => setDeletingProduct(null)}
      />

      <ConfirmModal
        open={pendingApply}
        title={t("products.confirmApplyTitle")}
        description={t("products.confirmApplyDescription")}
        confirmLabel={
          applying ? t("products.applying") : t("products.confirmApply")
        }
        cancelLabel={t("common.cancel")}
        loading={applying}
        onConfirm={handleApplyProfile}
        onCancel={() => setPendingApply(false)}
      />
    </div>
  );
}
