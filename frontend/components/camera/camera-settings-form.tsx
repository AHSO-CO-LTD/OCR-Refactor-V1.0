"use client";

import { Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { formatCameraApiError } from "@/components/camera/camera-error";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  updateProductProfile,
  type CameraDevice,
  type CameraHardwareRange,
  type CameraHardwareRanges,
  type CameraProfile,
  type ProductProfile,
  type ProductProfilePayload,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { getAccessToken } from "@/lib/session";

type CameraSettingsFormProps = {
  product: ProductProfile | null;
  devices: CameraDevice[];
  hardwareRanges: CameraHardwareRanges | null;
  disabled?: boolean;
  onSaved: (product: ProductProfile) => void;
};

export function CameraSettingsForm({
  product,
  devices,
  hardwareRanges,
  disabled = false,
  onSaved,
}: CameraSettingsFormProps) {
  const { apiError, t } = useI18n();
  const [draft, setDraft] = useState<CameraProfile | null>(() =>
    product ? normalizeCamera(product.camera) : null,
  );
  const [saving, setSaving] = useState(false);

  if (!product || !draft) {
    return (
      <div className="border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
        {t("camera.selectProductFirst")}
      </div>
    );
  }

  async function handleSave() {
    if (!product || !draft) {
      toast.warning(t("camera.selectProductFirst"));
      return;
    }

    const accessToken = getAccessToken();

    if (!accessToken) {
      toast.error(t("users.missingSession"));
      return;
    }

    setSaving(true);
    const toastId = toast.loading(t("camera.savingSettings"));

    try {
      const response = await updateProductProfile(
        accessToken,
        product.id,
        buildProductPayload(product, draft),
      );
      setDraft(normalizeCamera(response.data.camera));
      onSaved(response.data);
      toast.success(t("camera.settingsSaved"), { id: toastId });
    } catch (cause) {
      toast.error(formatCameraApiError(cause, apiError, t, "camera.settingsSaveError"), {
        id: toastId,
      });
    } finally {
      setSaving(false);
    }
  }

  function updateText(field: keyof CameraProfile, value: string) {
    setDraft((current) => (current ? { ...current, [field]: value } : current));
  }

  function updateNumber(field: keyof CameraProfile, value: string) {
    setDraft((current) =>
      current ? { ...current, [field]: Number(value) } : current,
    );
  }

  function selectCameraDevice(value: string) {
    const selectedDevice = devices.find(
      (device) => cameraDeviceValue(device) === value,
    );

    setDraft((current) =>
      current
        ? {
            ...current,
            sourceType: "usb",
            deviceName: selectedDevice?.friendly_name ?? value,
          }
        : current,
    );
  }

  const formDisabled = disabled || saving;

  return (
    <div className="border border-slate-200 bg-white text-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="font-semibold text-slate-900">{t("camera.settings")}</div>
          <div className="mt-1 text-xs text-slate-500">{t("camera.settingsHint")}</div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={formDisabled}
            className="h-10 px-4"
          >
            <Save className="h-4 w-4" />
            {saving ? t("camera.savingSettings") : t("camera.saveSettings")}
          </Button>
        </div>
      </div>

      <div className="space-y-5 px-5 py-5">
        <section className="space-y-3 border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm font-semibold text-slate-900">
            {t("products.sourceType")}
          </div>
          <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-[0.02em] text-slate-600">
                {t("products.sourceType")}
              </span>
              <Select
                value={draft.sourceType}
                onChange={(event) => updateText("sourceType", event.target.value)}
                className="h-10 w-full border border-slate-300 bg-white px-3 text-sm outline-none focus:border-cyan-600"
                disabled={formDisabled}
              >
                <option value="usb">{t("products.cameraSourceUsb")}</option>
                <option value="rtsp">{t("products.cameraSourceRtsp")}</option>
              </Select>
            </label>

            {draft.sourceType === "rtsp" ? (
              <TextInput
                label={t("products.rtspUrl")}
                value={draft.rtspUrl ?? ""}
                disabled={formDisabled}
                onChange={(value) => updateText("rtspUrl", value)}
              />
            ) : (
              <label className="block space-y-1">
                <span className="text-xs font-medium uppercase tracking-[0.02em] text-slate-600">
                  {t("products.deviceName")}
                </span>
                <Select
                  value={draft.deviceName ?? ""}
                  onChange={(event) => selectCameraDevice(event.target.value)}
                  className="h-10 w-full border border-slate-300 bg-white px-3 text-sm outline-none focus:border-cyan-600"
                  disabled={formDisabled}
                >
                  <option value="">{t("products.selectCameraDevice")}</option>
                  {devices.map((device) => (
                    <option
                      key={`${device.index}-${device.serial_number ?? device.friendly_name}`}
                      value={cameraDeviceValue(device)}
                    >
                      #{device.index} {device.friendly_name}
                    </option>
                  ))}
                  {draft.deviceName &&
                  !devices.some(
                    (device) => cameraDeviceValue(device) === draft.deviceName,
                  ) ? (
                    <option value={draft.deviceName}>{draft.deviceName}</option>
                  ) : null}
                </Select>
              </label>
            )}
          </div>
        </section>

        <section className="space-y-3 border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm font-semibold text-slate-900">
            {t("camera.settings")}
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <NumberInput
              label={t("products.cameraExposure")}
              value={draft.exposure}
              range={hardwareRanges?.ranges.exposure}
              disabled={formDisabled}
              onChange={(value) => updateNumber("exposure", value)}
            />
            <NumberInput
              label={t("products.zoomFactor")}
              value={draft.zoomFactor}
              fallbackMin={0}
              fallbackMax={10}
              fallbackStep={0.01}
              disabled={formDisabled}
              onChange={(value) => updateNumber("zoomFactor", value)}
            />
            <NumberInput
              label={t("products.imageWidth")}
              value={draft.imageWidth}
              range={hardwareRanges?.ranges.width}
              fallbackMin={1}
              disabled={formDisabled}
              onChange={(value) => updateNumber("imageWidth", value)}
            />
            <NumberInput
              label={t("products.imageHeight")}
              value={draft.imageHeight}
              range={hardwareRanges?.ranges.height}
              fallbackMin={1}
              disabled={formDisabled}
              onChange={(value) => updateNumber("imageHeight", value)}
            />
            <NumberInput
              label={t("products.offsetX")}
              value={draft.offsetX}
              range={hardwareRanges?.ranges.offset_x}
              fallbackMin={0}
              disabled={formDisabled}
              onChange={(value) => updateNumber("offsetX", value)}
            />
            <NumberInput
              label={t("products.offsetY")}
              value={draft.offsetY}
              range={hardwareRanges?.ranges.offset_y}
              fallbackMin={0}
              disabled={formDisabled}
              onChange={(value) => updateNumber("offsetY", value)}
            />
          </div>
        </section>
      </div>

      {disabled ? (
        <div className="mx-5 mb-5 border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {t("camera.stopLiveBeforeEdit")}
        </div>
      ) : null}
    </div>
  );
}

function TextInput({
  label,
  value,
  disabled,
  className,
  onFocusField,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  className?: string;
  onFocusField?: (event: React.FocusEvent<HTMLInputElement>) => void;
  onChange: (value: string) => void;
}) {
  return (
    <label className={`block space-y-1 ${className ?? ""}`}>
      <span className="text-xs font-medium uppercase tracking-[0.02em] text-slate-600">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocusField}
        className="h-10 w-full border border-slate-300 bg-white px-3 text-sm outline-none focus:border-cyan-600"
        disabled={disabled}
      />
    </label>
  );
}

function NumberInput({
  label,
  value,
  range,
  fallbackMin,
  fallbackMax,
  fallbackStep,
  disabled,
  className,
  onFocusField,
  onChange,
}: {
  label: string;
  value: number;
  range?: CameraHardwareRange | null;
  fallbackMin?: number;
  fallbackMax?: number;
  fallbackStep?: number;
  disabled: boolean;
  className?: string;
  onFocusField?: (event: React.FocusEvent<HTMLInputElement>) => void;
  onChange: (value: string) => void;
}) {
  const min = toFiniteNumber(range?.min) ?? fallbackMin;
  const max = toFiniteNumber(range?.max) ?? fallbackMax;
  const step = toFiniteNumber(range?.inc) ?? fallbackStep;
  const actualValue = toFiniteNumber(range?.value);

  return (
    <label className={`block space-y-1 ${className ?? ""}`}>
      <span className="text-xs font-medium uppercase tracking-[0.02em] text-slate-600">
        {label}
      </span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocusField}
        className="h-10 w-full border border-slate-300 bg-white px-3 text-sm outline-none focus:border-cyan-600"
        disabled={disabled}
      />
      {range ? (
        <span className="block text-[11px] leading-4 text-slate-500">
          {formatRangeText(min, max, step, actualValue)}
        </span>
      ) : null}
    </label>
  );
}

function formatRangeText(
  min: number | undefined,
  max: number | undefined,
  step: number | undefined,
  actualValue: number | null,
) {
  const limits =
    typeof min === "number" || typeof max === "number"
      ? `${formatNumber(min)} - ${formatNumber(max)}`
      : "-";
  const increment = typeof step === "number" ? ` / ${formatNumber(step)}` : "";
  const actual =
    actualValue !== null ? ` / actual ${formatNumber(actualValue)}` : "";

  return `${limits}${increment}${actual}`;
}

function formatNumber(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function toFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeCamera(camera: CameraProfile): CameraProfile {
  return {
    ...camera,
    deviceName: camera.deviceName ?? "",
    rtspUrl: camera.rtspUrl ?? "",
    previewPanX: camera.previewPanX ?? 0,
    previewPanY: camera.previewPanY ?? 0,
    previewRotation: camera.previewRotation ?? 0,
  };
}

function buildProductPayload(
  product: ProductProfile,
  camera: CameraProfile,
): ProductProfilePayload {
  return {
    code: product.code,
    name: product.name,
    defaultNumber: product.defaultNumber,
    batchSize: product.batchSize,
    exposure: product.exposure,
    thresholdAccept: product.thresholdAccept,
    thresholdMns: product.thresholdMns,
    rowThreshold: product.rowThreshold,
    modelPath: product.modelPath ?? undefined,
    active: product.active,
    camera: {
      ...camera,
      deviceName: camera.deviceName?.trim() || undefined,
      rtspUrl: camera.rtspUrl?.trim() || undefined,
    },
    roiRegions: product.roiRegions,
  };
}

function cameraDeviceValue(device: CameraDevice) {
  return device.friendly_name;
}
