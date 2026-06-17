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
  type CameraProfile,
  type ProductProfile,
  type ProductProfilePayload,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { getAccessToken } from "@/lib/session";

type CameraSettingsFormProps = {
  product: ProductProfile | null;
  devices: CameraDevice[];
  disabled?: boolean;
  onSaved: (product: ProductProfile) => void;
};

export function CameraSettingsForm({
  product,
  devices,
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
    <div className="border border-slate-200 bg-slate-50 p-4 text-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-start sm:justify-between">
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

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-12">
        <label className="block space-y-1 xl:col-span-3">
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
          className="md:col-span-2 xl:col-span-9"
          onChange={(value) => updateText("rtspUrl", value)}
        />
        ) : (
          <label className="block space-y-1 md:col-span-2 xl:col-span-9">
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

        <NumberInput
          label={t("products.cameraExposure")}
          value={draft.exposure}
          min={0}
          disabled={formDisabled}
          className="xl:col-span-2"
          onChange={(value) => updateNumber("exposure", value)}
        />
        <NumberInput
          label={t("products.zoomFactor")}
          value={draft.zoomFactor}
          min={0}
          max={10}
          step={0.01}
          disabled={formDisabled}
          className="xl:col-span-2"
          onChange={(value) => updateNumber("zoomFactor", value)}
        />
        <NumberInput
          label={t("products.imageWidth")}
          value={draft.imageWidth}
          min={1}
          disabled={formDisabled}
          className="xl:col-span-2"
          onChange={(value) => updateNumber("imageWidth", value)}
        />
        <NumberInput
          label={t("products.imageHeight")}
          value={draft.imageHeight}
          min={1}
          disabled={formDisabled}
          className="xl:col-span-2"
          onChange={(value) => updateNumber("imageHeight", value)}
        />
        <NumberInput
          label={t("products.offsetX")}
          value={draft.offsetX}
          min={0}
          disabled={formDisabled}
          className="xl:col-span-2"
          onChange={(value) => updateNumber("offsetX", value)}
        />
        <NumberInput
          label={t("products.offsetY")}
          value={draft.offsetY}
          min={0}
          disabled={formDisabled}
          className="xl:col-span-2"
          onChange={(value) => updateNumber("offsetY", value)}
        />
      </div>

      {disabled ? (
        <div className="mt-3 border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
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
  min,
  max,
  step,
  disabled,
  className,
  onFocusField,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
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
    </label>
  );
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
