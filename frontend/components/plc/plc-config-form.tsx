"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  type PlcConfiguration,
  type PlcConfigurationPayload,
  type PlcKeyOperation,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";

type PlcConfigFormProps = {
  config: PlcConfiguration | null;
  loading: boolean;
  onSave: (payload: PlcConfigurationPayload) => Promise<void>;
};

type AddressField =
  | "captureTriggerAddress"
  | "stopTriggerAddress"
  | "startTriggerAddress"
  | "cameraPowerAddress"
  | "cameraLightAddress"
  | "errorPulseAddress"
  | "okResultAddress"
  | "waitingCheckingAddress";

type CustomKeyDraft = {
  clientId: string;
  name: string;
  address: string;
  operation: PlcKeyOperation;
  enabled: boolean;
};

type PlcFormState = {
  ipAddress: string;
  port: string;
  protocol: PlcConfiguration["protocol"];
  captureTriggerAddress: string;
  stopTriggerAddress: string;
  startTriggerAddress: string;
  cameraPowerAddress: string;
  cameraLightAddress: string;
  errorPulseAddress: string;
  okResultAddress: string;
  waitingCheckingAddress: string;
  errorPulseDurationMs: string;
  sleepTimeSeconds: string;
  customKeys: CustomKeyDraft[];
};

export function PlcConfigForm({ config, loading, onSave }: PlcConfigFormProps) {
  const { t } = useI18n();
  const [form, setForm] = useState<PlcFormState>(() => toFormState(config));
  const [validationError, setValidationError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateForm(form, t);
    if (typeof result === "string") {
      setValidationError(result);
      return;
    }

    setValidationError("");
    await onSave(result);
  }

  function updateAddress(field: AddressField, value: string) {
    setForm((current) => ({ ...current, [field]: numericText(value) }));
  }

  function updateCustomKey(
    clientId: string,
    patch: Partial<Omit<CustomKeyDraft, "clientId">>,
  ) {
    setForm((current) => ({
      ...current,
      customKeys: current.customKeys.map((key) =>
        key.clientId === clientId ? { ...key, ...patch } : key,
      ),
    }));
  }

  return (
    <form className="grid gap-5" onSubmit={handleSubmit} noValidate>
      <Card>
        <CardHeader className="border-b border-slate-200">
          <CardTitle className="text-lg">{t("plc.connection")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 pt-5 md:grid-cols-[minmax(260px,1fr)_160px_minmax(240px,1fr)]">
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            <span>{t("plc.ipAddress")} *</span>
            <Input
              value={form.ipAddress}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  ipAddress: event.target.value.trim(),
                }))
              }
              placeholder={t("plc.ipPlaceholder")}
              inputMode="decimal"
              autoComplete="off"
              disabled={loading}
              className="h-11"
              aria-invalid={Boolean(validationError)}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            <span>{t("plc.port")} *</span>
            <Input
              value={form.port}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  port: numericText(event.target.value),
                }))
              }
              placeholder={String(defaultPlcPort(form.protocol))}
              inputMode="numeric"
              autoComplete="off"
              disabled={loading}
              className="h-11"
              aria-invalid={Boolean(validationError)}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            <span>{t("plc.protocol")} *</span>
            <Select
              value={form.protocol}
              onChange={(event) => {
                const protocol = event.target
                  .value as PlcConfiguration["protocol"];
                setForm((current) => ({
                  ...current,
                  protocol,
                  port: String(defaultPlcPort(protocol)),
                }));
              }}
              disabled={loading}
              className="h-11"
              aria-label={t("plc.protocol")}
            >
              <option value="modbus_tcp">{t("plc.modbusTcp")}</option>
              <option value="slmp">{t("plc.mitsubishiSlmp")}</option>
            </Select>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-slate-200">
          <CardTitle className="text-lg">{t("plc.requiredSignals")}</CardTitle>
          <p className="mt-1 text-sm text-slate-500">{t("plc.requiredHint")}</p>
        </CardHeader>
        <CardContent className="pt-5">
          <div className="overflow-x-auto border border-slate-200">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">
                    {t("plc.signalName")}
                  </th>
                  <th className="w-48 px-4 py-3 font-semibold">
                    {t("plc.logicalMAddress")}
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    {t("plc.direction")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {fixedSignals(t).map((signal) => (
                  <tr key={signal.field}>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {signal.label}
                    </td>
                    <td className="px-4 py-2">
                      <Input
                        value={form[signal.field]}
                        onChange={(event) =>
                          updateAddress(signal.field, event.target.value)
                        }
                        inputMode="numeric"
                        placeholder={t("plc.optionalAddress")}
                        disabled={loading}
                        className="h-11"
                        aria-label={`${signal.label} - ${t("plc.address")}`}
                      />
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {signal.direction}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              <span>{t("plc.pulseDuration")}</span>
              <Input
                value={form.errorPulseDurationMs}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    errorPulseDurationMs: numericText(event.target.value),
                  }))
                }
                inputMode="numeric"
                disabled={loading}
                className="h-11"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              <span>{t("plc.sleepTime")}</span>
              <Input
                value={form.sleepTimeSeconds}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    sleepTimeSeconds: numericText(event.target.value),
                  }))
                }
                inputMode="numeric"
                disabled={loading}
                className="h-11"
              />
              <span className="text-xs font-normal text-slate-500">
                {t("plc.sleepTimeHint")}
              </span>
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-slate-200">
          <div>
            <CardTitle className="text-lg">{t("plc.customKeys")}</CardTitle>
            <p className="mt-1 text-sm text-slate-500">{t("plc.customHint")}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() =>
              setForm((current) => ({
                ...current,
                customKeys: [...current.customKeys, newCustomKey()],
              }))
            }
            disabled={loading || form.customKeys.length >= 64}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("plc.addCustomKey")}
          </Button>
        </CardHeader>
        <CardContent className="pt-5">
          {form.customKeys.length === 0 ? (
            <p className="border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
              {t("plc.noCustomKeys")}
            </p>
          ) : (
            <div className="overflow-x-auto border border-slate-200">
              <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-3 py-3 font-semibold">
                      {t("plc.customName")}
                    </th>
                    <th className="w-40 px-3 py-3 font-semibold">
                      {t("plc.logicalMAddress")}
                    </th>
                    <th className="w-64 px-3 py-3 font-semibold">
                      {t("plc.operation")}
                    </th>
                    <th className="w-28 px-3 py-3 text-center font-semibold">
                      {t("plc.enabled")}
                    </th>
                    <th className="w-24 px-3 py-3 text-right font-semibold">
                      {t("common.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {form.customKeys.map((key) => (
                    <tr key={key.clientId}>
                      <td className="px-3 py-2">
                        <Input
                          value={key.name}
                          onChange={(event) =>
                            updateCustomKey(key.clientId, {
                              name: event.target.value,
                            })
                          }
                          maxLength={64}
                          disabled={loading}
                          className="h-11"
                          aria-label={t("plc.customName")}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={key.address}
                          onChange={(event) =>
                            updateCustomKey(key.clientId, {
                              address: numericText(event.target.value),
                            })
                          }
                          inputMode="numeric"
                          disabled={loading}
                          className="h-11"
                          aria-label={t("plc.address")}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          value={key.operation}
                          onChange={(event) =>
                            updateCustomKey(key.clientId, {
                              operation: event.target.value as PlcKeyOperation,
                            })
                          }
                          disabled={loading}
                          className="h-11"
                          aria-label={t("plc.operation")}
                        >
                          <option value="watch_boolean">
                            {t("plc.watchBoolean")}
                          </option>
                          <option value="write_boolean">
                            {t("plc.writeBoolean")}
                          </option>
                          <option value="pulse">{t("plc.pulse")}</option>
                        </Select>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={key.enabled}
                          onChange={(event) =>
                            updateCustomKey(key.clientId, {
                              enabled: event.target.checked,
                            })
                          }
                          disabled={loading}
                          className="h-5 w-5 accent-cyan-700"
                          aria-label={`${key.name || t("plc.customName")} - ${t("plc.enabled")}`}
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-11 w-11 text-red-700 hover:bg-red-50"
                          onClick={() =>
                            setForm((current) => ({
                              ...current,
                              customKeys: current.customKeys.filter(
                                (item) => item.clientId !== key.clientId,
                              ),
                            }))
                          }
                          disabled={loading}
                          aria-label={t("plc.remove")}
                          title={t("plc.remove")}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {validationError ? (
        <p
          className="border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
          role="alert"
        >
          {validationError}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" className="h-12 min-w-56" disabled={loading}>
          <Save className="h-4 w-4" aria-hidden="true" />
          {loading ? t("plc.saving") : t("plc.save")}
        </Button>
      </div>
    </form>
  );
}

function fixedSignals(t: (key: string) => string) {
  return [
    {
      field: "captureTriggerAddress" as const,
      label: t("plc.captureTrigger"),
      direction: t("plc.plcToApp"),
    },
    {
      field: "stopTriggerAddress" as const,
      label: t("plc.stopTrigger"),
      direction: t("plc.plcToApp"),
    },
    {
      field: "startTriggerAddress" as const,
      label: t("plc.startTrigger"),
      direction: t("plc.plcToApp"),
    },
    {
      field: "cameraPowerAddress" as const,
      label: t("plc.cameraPower"),
      direction: t("plc.appToPlcWrite"),
    },
    {
      field: "cameraLightAddress" as const,
      label: t("plc.cameraLight"),
      direction: t("plc.appToPlcWrite"),
    },
    {
      field: "errorPulseAddress" as const,
      label: t("plc.errorPulse"),
      direction: t("plc.appToPlcPulse"),
    },
    {
      field: "okResultAddress" as const,
      label: t("plc.okResult"),
      direction: t("plc.appToPlcWrite"),
    },
    {
      field: "waitingCheckingAddress" as const,
      label: t("plc.waitingChecking"),
      direction: t("plc.appToPlcWrite"),
    },
  ];
}

function toFormState(config: PlcConfiguration | null): PlcFormState {
  return {
    ipAddress: config?.ipAddress ?? "",
    protocol: config?.protocol ?? "modbus_tcp",
    port: valueText(
      config?.port ?? defaultPlcPort(config?.protocol ?? "modbus_tcp"),
    ),
    captureTriggerAddress: valueText(config?.captureTriggerAddress),
    stopTriggerAddress: valueText(config?.stopTriggerAddress),
    startTriggerAddress: valueText(config?.startTriggerAddress),
    cameraPowerAddress: valueText(config?.cameraPowerAddress),
    cameraLightAddress: valueText(config?.cameraLightAddress),
    errorPulseAddress: valueText(config?.errorPulseAddress),
    okResultAddress: valueText(config?.okResultAddress),
    waitingCheckingAddress: valueText(config?.waitingCheckingAddress),
    errorPulseDurationMs: valueText(config?.errorPulseDurationMs ?? 500),
    sleepTimeSeconds: valueText(config?.sleepTimeSeconds ?? 300),
    customKeys: (config?.customKeys ?? []).map((key) => ({
      clientId: key.id ?? createClientId(),
      name: key.name,
      address: String(key.address),
      operation: key.operation,
      enabled: key.enabled,
    })),
  };
}

function newCustomKey(): CustomKeyDraft {
  return {
    clientId: createClientId(),
    name: "",
    address: "",
    operation: "watch_boolean",
    enabled: true,
  };
}

function createClientId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

function numericText(value: string) {
  return value.replace(/\D/g, "");
}

function valueText(value: number | null | undefined) {
  return value === undefined || value === null ? "" : String(value);
}

function validateForm(
  form: PlcFormState,
  t: (key: string) => string,
): PlcConfigurationPayload | string {
  if (!isValidIpv4(form.ipAddress)) return t("plc.validationIp");

  const port = Number(form.port);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    return t("plc.validationPort");
  }

  const addressFields: AddressField[] = [
    "captureTriggerAddress",
    "stopTriggerAddress",
    "startTriggerAddress",
    "cameraPowerAddress",
    "cameraLightAddress",
    "errorPulseAddress",
    "okResultAddress",
    "waitingCheckingAddress",
  ];
  const addresses = addressFields.map((field) =>
    form[field] === "" ? null : Number(form[field]),
  );
  if (
    addresses.some(
      (address) =>
        address !== null &&
        (!Number.isSafeInteger(address) || address < 0),
    )
  ) {
    return t("plc.validationAddress");
  }
  const configuredAddresses = addresses.filter(
    (address): address is number => address !== null,
  );
  if (new Set(configuredAddresses).size !== configuredAddresses.length) {
    return t("plc.validationUnique");
  }
  if (form.customKeys.some((key) => !key.name.trim())) {
    return t("plc.validationCustomName");
  }
  if (
    form.customKeys.some(
      (key) =>
        key.address === "" ||
        !Number.isSafeInteger(Number(key.address)) ||
        Number(key.address) < 0,
    )
  ) {
    return t("plc.validationAddress");
  }

  const duration = Number(form.errorPulseDurationMs);
  if (!Number.isSafeInteger(duration) || duration < 50 || duration > 10000) {
    return t("plc.validationAddress");
  }

  const sleepTimeSeconds = Number(form.sleepTimeSeconds);
  if (
    !Number.isSafeInteger(sleepTimeSeconds) ||
    sleepTimeSeconds < 1 ||
    sleepTimeSeconds > 86400
  ) {
    return t("plc.validationSleepTime");
  }

  return {
    ipAddress: form.ipAddress,
    protocol: form.protocol,
    port,
    captureTriggerAddress: addresses[0],
    stopTriggerAddress: addresses[1],
    startTriggerAddress: addresses[2],
    cameraPowerAddress: addresses[3],
    cameraLightAddress: addresses[4],
    errorPulseAddress: addresses[5],
    okResultAddress: addresses[6],
    waitingCheckingAddress: addresses[7],
    errorPulseDurationMs: duration,
    sleepTimeSeconds,
    customKeys: form.customKeys.map(
      ({ name, address, operation, enabled }) => ({
        name: name.trim(),
        address: Number(address),
        operation,
        enabled,
      }),
    ),
  };
}

function defaultPlcPort(protocol: PlcConfiguration["protocol"]) {
  return protocol === "slmp" ? 5000 : 502;
}

function isValidIpv4(value: string) {
  const segments = value.split(".");
  return (
    segments.length === 4 &&
    segments.every(
      (segment) =>
        /^\d{1,3}$/.test(segment) &&
        Number(segment) >= 0 &&
        Number(segment) <= 255,
    )
  );
}
