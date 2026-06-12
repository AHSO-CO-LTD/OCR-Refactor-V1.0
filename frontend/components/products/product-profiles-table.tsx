"use client";

import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ProductProfile } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

type ProductProfilesTableProps = {
  loading: boolean;
  products: ProductProfile[];
  selectedIds: string[];
  busyProductId?: string;
  onToggleSelected: (productId: string) => void;
  onEdit: (product: ProductProfile) => void;
  onDelete: (product: ProductProfile) => void;
};

export function ProductProfilesTable({
  loading,
  products,
  selectedIds,
  busyProductId,
  onToggleSelected,
  onEdit,
  onDelete,
}: ProductProfilesTableProps) {
  const { t } = useI18n();

  return (
    <Card className="min-w-0 overflow-hidden shadow-none">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="font-semibold text-slate-950">
          {t("products.listTitle")}
        </h2>
        <p className="mt-1 text-sm text-slate-500">{t("products.listHint")}</p>
      </div>

      <div className="max-w-full overflow-x-auto">
        <table className="w-full min-w-[940px] table-fixed border-collapse text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            <tr>
              <th className="w-12 border-b border-slate-200 px-3 py-3">
                <span className="sr-only">{t("products.select")}</span>
              </th>
              <th className="w-[18%] border-b border-slate-200 px-3 py-3">
                {t("products.code")}
              </th>
              <th className="w-[19%] border-b border-slate-200 px-3 py-3">
                {t("products.name")}
              </th>
              <th className="w-[16%] border-b border-slate-200 px-3 py-3">
                {t("products.camera")}
              </th>
              <th className="w-[14%] border-b border-slate-200 px-3 py-3">
                {t("products.batchSize")}
              </th>
              <th className="w-[8%] border-b border-slate-200 px-3 py-3">
                {t("products.roi")}
              </th>
              <th className="w-[13%] border-b border-slate-200 px-3 py-3">
                {t("products.status")}
              </th>
              <th className="w-[12%] border-b border-slate-200 px-3 py-3 text-right">
                {t("products.actions")}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                  {t("products.loading")}
                </td>
              </tr>
            ) : null}

            {!loading && products.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center">
                  <div className="mx-auto max-w-sm">
                    <div className="text-base font-semibold text-slate-950">
                      {t("products.emptyTitle")}
                    </div>
                    <p className="mt-2 text-sm text-slate-500">
                      {t("products.emptyDescription")}
                    </p>
                  </div>
                </td>
              </tr>
            ) : null}

            {!loading
              ? products.map((product) => (
                  <tr key={product.id} className="hover:bg-slate-50">
                    <td className="border-b border-slate-100 px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(product.id)}
                        onChange={() => onToggleSelected(product.id)}
                        aria-label={`${t("products.select")} ${product.code}`}
                        className="h-5 w-5"
                      />
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3 font-semibold text-slate-950">
                      <div className="truncate" title={product.code}>
                        {product.code}
                      </div>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3">
                      <div className="truncate" title={product.name}>
                        {product.name}
                      </div>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3 text-slate-600">
                      <div
                        className="truncate"
                        title={product.camera.deviceName || product.camera.sourceType}
                      >
                        {product.camera.deviceName || product.camera.sourceType}
                      </div>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3 text-slate-600 tabular-nums">
                      {product.batchSize}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3 text-slate-600 tabular-nums">
                      {product.roiRegions.length}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3">
                      <span
                        className={
                          product.active
                            ? "border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700"
                            : "border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600"
                        }
                      >
                        {product.active
                          ? t("products.active")
                          : t("products.inactive")}
                      </span>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onEdit(product)}
                          disabled={busyProductId === product.id}
                          className="h-10 w-10 px-0 min-[1400px]:h-11 min-[1400px]:w-auto min-[1400px]:px-4 min-[1400px]:text-base"
                          aria-label={`${t("products.edit")} ${product.code}`}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                          <span className="hidden min-[1400px]:inline">
                            {t("products.edit")}
                          </span>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onDelete(product)}
                          disabled={busyProductId === product.id}
                          className="h-10 w-10 border-red-200 px-0 text-red-700 hover:bg-red-50 min-[1400px]:h-11 min-[1400px]:w-auto min-[1400px]:px-4 min-[1400px]:text-base"
                          aria-label={`${t("products.delete")} ${product.code}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          <span className="hidden min-[1400px]:inline">
                            {t("products.delete")}
                          </span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              : null}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
