import type {
  StartupSnapshot,
  StartupStageId,
} from "./startup-types";

const copy = {
  en: {
    appLabel: "AHSO OCR",
    blocked: "Startup is blocked",
    blockedMessage: "Resolve the application or license error before continuing.",
    completed: "Startup checks completed",
    completedMessage: "Opening the sign-in screen.",
    current: "Current check",
    exportCanceled: "Log export was canceled.",
    exportFailed: "Cannot export the startup log.",
    exportLog: "Export log",
    exportSuccess: "Startup log was saved.",
    exporting: "Saving startup log...",
    exitCancel: "Cancel",
    exitConfirm: "Exit app",
    exitDescription:
      "Exiting will safely turn off the camera, PLC, and local services before closing the app.",
    exitFailed: "Cannot close the local app cleanly.",
    exitTitle: "Confirm exit",
    exiting: "Closing local services...",
    exitModeTitle: "Choose how to shut down",
    exitAppOnly: "App only",
    exitAppOnlyDescription: "Close the app and local services.",
    exitHardware: "App and hardware",
    exitHardwareDescription:
      "Safely stop the camera and PLC hardware before closing the app.",
    exitHardwareConfirm: "Shut down app and hardware",
    shutdownChecklist: "Shutdown checklist",
    shutdownSteps: {
      app: "Stop local services and close the app",
      camera: "Disconnect camera",
      cameraOutputs: "Turn off inspection light and camera power",
      plc: "Disconnect PLC",
      remainingSignals: "Turn off all remaining PLC outputs",
    },
    groupMachine: "Machine hardware",
    groupSystem: "Application and security",
    hardwareWarning: "Machine hardware needs attention",
    hardwareWarningMessage: "PLC-related errors were recorded. Sign-in is still allowed.",
    progress: "Startup readiness",
    retry: "Check again",
    stageDescriptions: {
      backend: "Local API and application services",
      camera: "Connect and receive a valid frame",
      cameraLight: "Configured PLC light output",
      cameraPower: "Configured PLC camera power output",
      database: "Migration, database, admin, and API",
      deviceTool: "Local hardware control service",
      frontend: "Next.js desktop renderer",
      license: "Physical USB license dongle",
      plc: "Configured PLC runtime connection",
      plcSignals: "Configured result outputs and input monitors",
    },
    stageLabels: {
      backend: "Check backend service",
      camera: "Verify camera",
      cameraLight: "Enable inspection light",
      cameraPower: "Enable camera power",
      database: "Check database and system",
      deviceTool: "Check Device Tool",
      frontend: "Initialize interface",
      license: "Check license",
      plc: "Connect PLC",
      plcSignals: "Test PLC signals",
    },
    statuses: {
      done: "Ready",
      failed: "Error",
      pending: "Pending",
      running: "Checking",
      skipped: "Skipped",
      warning: "Attention",
    },
    subtitle: "The application is validating services, security, and configured machine hardware.",
    title: "Starting the inspection station",
  },
  vi: {
    appLabel: "AHSO OCR",
    blocked: "Không thể tiếp tục khởi động",
    blockedMessage: "Hãy xử lý lỗi ứng dụng hoặc bản quyền trước khi tiếp tục.",
    completed: "Đã hoàn tất kiểm tra khởi động",
    completedMessage: "Đang mở màn hình đăng nhập.",
    current: "Mục đang kiểm tra",
    exportCanceled: "Đã hủy xuất nhật ký.",
    exportFailed: "Không thể xuất nhật ký khởi động.",
    exportLog: "Xuất nhật ký",
    exportSuccess: "Đã lưu nhật ký khởi động.",
    exporting: "Đang lưu nhật ký khởi động...",
    exitCancel: "Hủy",
    exitConfirm: "Thoát app",
    exitDescription:
      "Thoát app sẽ tắt an toàn camera, PLC và dịch vụ local trước khi đóng ứng dụng.",
    exitFailed: "Không thể đóng app local sạch sẽ.",
    exitTitle: "Xác nhận thoát app",
    exiting: "Đang đóng các dịch vụ local...",
    exitModeTitle: "Chọn cách tắt",
    exitAppOnly: "Chỉ tắt ứng dụng",
    exitAppOnlyDescription: "Đóng ứng dụng và các dịch vụ local.",
    exitHardware: "Tắt ứng dụng và phần cứng",
    exitHardwareDescription:
      "Tắt camera và phần cứng PLC an toàn trước khi đóng ứng dụng.",
    exitHardwareConfirm: "Tắt ứng dụng và phần cứng",
    shutdownChecklist: "Checklist thực hiện",
    shutdownSteps: {
      app: "Tắt dịch vụ local và đóng ứng dụng",
      camera: "Ngắt kết nối camera",
      cameraOutputs: "Tắt đèn kiểm tra và ngắt nguồn camera",
      plc: "Ngắt kết nối PLC",
      remainingSignals: "Tắt toàn bộ tín hiệu đầu ra PLC còn lại",
    },
    groupMachine: "Phần cứng máy",
    groupSystem: "Ứng dụng và bảo mật",
    hardwareWarning: "Phần cứng máy cần được kiểm tra",
    hardwareWarningMessage: "Đã ghi nhận lỗi liên quan đến PLC. Bạn vẫn có thể đăng nhập.",
    progress: "Mức sẵn sàng khởi động",
    retry: "Kiểm tra lại",
    stageDescriptions: {
      backend: "API nội bộ và dịch vụ ứng dụng",
      camera: "Kết nối và nhận một frame hợp lệ",
      cameraLight: "Ngõ ra đèn chiếu sáng trên PLC",
      cameraPower: "Ngõ ra nguồn camera trên PLC",
      database: "Migration, dữ liệu, tài khoản admin và API",
      deviceTool: "Dịch vụ điều khiển phần cứng nội bộ",
      frontend: "Giao diện desktop Next.js",
      license: "USB dongle bản quyền vật lý",
      plc: "Kết nối PLC theo cấu hình đã lưu",
      plcSignals: "Ngõ ra kết quả và ngõ vào đã cấu hình",
    },
    stageLabels: {
      backend: "Kiểm tra dịch vụ backend",
      camera: "Kiểm tra camera",
      cameraLight: "Bật đèn kiểm tra",
      cameraPower: "Bật nguồn camera",
      database: "Kiểm tra cơ sở dữ liệu và hệ thống",
      deviceTool: "Kiểm tra Device Tool",
      frontend: "Khởi tạo giao diện",
      license: "Kiểm tra bản quyền",
      plc: "Kết nối PLC",
      plcSignals: "Kiểm tra tín hiệu PLC",
    },
    statuses: {
      done: "Sẵn sàng",
      failed: "Lỗi",
      pending: "Đang chờ",
      running: "Đang kiểm tra",
      skipped: "Bỏ qua",
      warning: "Cần chú ý",
    },
    subtitle: "Ứng dụng đang kiểm tra dịch vụ, bảo mật và phần cứng máy đã cấu hình.",
    title: "Đang khởi động trạm kiểm tra",
  },
} as const;

const systemStageIds: StartupStageId[] = [
  "deviceTool",
  "backend",
  "frontend",
  "database",
  "license",
];
const machineStageIds: StartupStageId[] = [
  "plc",
  "cameraPower",
  "cameraLight",
  "camera",
  "plcSignals",
];

export function createStartupDocument(snapshot: StartupSnapshot) {
  const serializedSnapshot = serializeForScript(snapshot);
  const serializedCopy = serializeForScript(copy);

  return `<!doctype html>
<html lang="${snapshot.language}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AHSO OCR</title>
    <style>
      * { box-sizing: border-box; }
      body {
        display: grid;
        place-items: center;
        margin: 0;
        min-height: 100vh;
        min-height: 100dvh;
        padding: 28px;
        background: #f1f5f9;
        color: #0f172a;
        font-family: "Segoe UI", Arial, sans-serif;
      }
      button { font: inherit; }
      .shell {
        width: min(1120px, 100%);
        margin: 0;
        border: 1px solid #cbd5e1;
        background: #ffffff;
      }
      .header {
        display: grid;
        grid-template-columns: 144px minmax(0, 1fr) 142px;
        gap: 28px;
        align-items: center;
        min-height: 190px;
        padding: 24px 28px;
        border-bottom: 1px solid #e2e8f0;
      }
      .radar {
        position: relative;
        display: grid;
        width: 132px;
        height: 132px;
        place-items: center;
        overflow: hidden;
        border: 1px solid #67e8f9;
        border-radius: 50%;
        color: #0e7490;
      }
      .radar::before, .radar::after {
        position: absolute;
        content: "";
        background: currentColor;
        opacity: .12;
      }
      .radar::before { width: 100%; height: 1px; }
      .radar::after { width: 1px; height: 100%; }
      .radar-ring { position: absolute; inset: 20px; border: 1px solid currentColor; border-radius: 50%; opacity: .2; }
      .radar-core { position: absolute; inset: 38px; border: 1px solid currentColor; border-radius: 50%; opacity: .85; }
      .radar-arm { position: absolute; left: 50%; top: 50%; width: 42%; height: 1px; transform-origin: left center; background: currentColor; animation: spin 1.5s linear infinite; }
      .radar-value { position: relative; font-family: Consolas, monospace; font-size: 18px; font-weight: 700; }
      .shell[data-phase="blocked"] .radar { border-color: #fca5a5; color: #b91c1c; }
      .shell[data-phase="warning"] .radar { border-color: #fcd34d; color: #b45309; }
      .shell[data-phase="finished"] .radar { border-color: #86efac; color: #047857; }
      .shell[data-phase]:not([data-phase="running"]) .radar-arm { animation: none; opacity: 0; }
      .brand { margin: 0 0 8px; color: #0e7490; font-size: 13px; font-weight: 700; }
      h1 { margin: 0; font-size: clamp(24px, 2.4vw, 32px); line-height: 1.2; letter-spacing: -.025em; }
      .subtitle { max-width: 680px; min-height: 44px; margin: 10px 0 0; color: #475569; font-size: 14px; line-height: 1.55; }
      .current { min-height: 38px; margin-top: 12px; color: #155e75; font-size: 13px; font-weight: 600; }
      .current span { display: inline-flex; min-height: 36px; align-items: center; border: 1px solid #a5f3fc; background: #ecfeff; padding: 0 12px; }
      .actions { display: grid; gap: 8px; align-self: start; }
      .languages { display: grid; grid-template-columns: 1fr 1fr; }
      .button {
        min-height: 40px;
        border: 1px solid #cbd5e1;
        background: #ffffff;
        color: #0f172a;
        padding: 0 12px;
        font-weight: 650;
        cursor: pointer;
      }
      .languages .button + .button { border-left: 0; }
      .button[aria-pressed="true"] { border-color: #0f172a; background: #0f172a; color: #ffffff; }
      .button:hover { background: #f8fafc; }
      .button[aria-pressed="true"]:hover { background: #1e293b; }
      .button:active { transform: translateY(1px); }
      .button:focus-visible { outline: 3px solid #67e8f9; outline-offset: 2px; }
      .button:disabled { cursor: wait; opacity: .6; }
      #retry-button { visibility: hidden; border-color: #fecaca; color: #b91c1c; }
      .shell[data-phase="blocked"] #retry-button { visibility: visible; }
      .content { padding: 20px 28px 28px; }
      .progress-head { display: flex; justify-content: space-between; gap: 16px; color: #475569; font-size: 12px; font-weight: 700; }
      .progress-track { height: 6px; margin-top: 9px; overflow: hidden; background: #e2e8f0; }
      .progress-value { display: block; width: 0; height: 100%; background: #0e7490; transition: width 220ms ease; }
      .shell[data-phase="blocked"] .progress-value { background: #dc2626; }
      .shell[data-phase="warning"] .progress-value { background: #d97706; }
      .shell[data-phase="finished"] .progress-value { background: #047857; }
      .groups { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 20px; }
      .group { border: 1px solid #e2e8f0; }
      .group-title { margin: 0; border-bottom: 1px solid #e2e8f0; background: #f8fafc; padding: 12px 16px; font-size: 13px; }
      .stage-list { padding: 0 16px; }
      .stage { min-height: 68px; padding: 12px 0; border-bottom: 1px solid #f1f5f9; }
      .stage:last-child { border-bottom: 0; }
      .stage-main { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 12px; align-items: center; }
      .stage-icon { display: grid; width: 32px; height: 32px; place-items: center; border: 1px solid #e2e8f0; color: #94a3b8; font-weight: 700; }
      .stage-label { color: #0f172a; font-size: 13px; font-weight: 700; }
      .stage-description { margin-top: 3px; color: #64748b; font-size: 11px; line-height: 1.35; }
      .stage-status { color: #64748b; font-size: 11px; font-weight: 700; white-space: nowrap; }
      .stage--pending { opacity: .65; }
      .stage--running .stage-icon { border-color: #a5f3fc; background: #ecfeff; color: #0e7490; animation: pulse 1.1s ease-in-out infinite; }
      .stage--running .stage-status { color: #0e7490; }
      .stage--done .stage-icon { border-color: #a7f3d0; background: #ecfdf5; color: #047857; }
      .stage--done .stage-status { color: #047857; }
      .stage--warning .stage-icon { border-color: #fde68a; background: #fffbeb; color: #b45309; }
      .stage--warning .stage-status { color: #b45309; }
      .stage--failed .stage-icon { border-color: #fecaca; background: #fef2f2; color: #b91c1c; }
      .stage--failed .stage-status { color: #b91c1c; }
      .stage-details { display: grid; gap: 5px; margin: 9px 0 0 46px; }
      .detail { display: flex; justify-content: space-between; gap: 12px; border-left: 2px solid #cbd5e1; background: #f8fafc; padding: 5px 8px; color: #475569; font-size: 10px; }
      .detail--failed { border-left-color: #ef4444; color: #b91c1c; }
      .feedback { min-height: 20px; margin: 10px 0 0; color: #475569; font-size: 11px; text-align: right; }
      .close-backdrop {
        position: fixed;
        inset: 0;
        z-index: 100;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow-y: auto;
        padding: 24px 16px;
        background: rgba(2, 6, 23, .48);
      }
      .close-backdrop[hidden] { display: none; }
      .close-dialog { width: min(680px, 100%); max-height: calc(100dvh - 48px); overflow-y: auto; border: 1px solid #cbd5e1; background: #ffffff; }
      .close-dialog__body { display: flex; gap: 12px; padding: 20px; border-bottom: 1px solid #e2e8f0; }
      .close-dialog__icon { display: grid; width: 38px; height: 38px; flex: 0 0 auto; place-items: center; border: 1px solid #fecaca; background: #fef2f2; color: #b91c1c; font-weight: 800; }
      .close-dialog h2 { margin: 0; font-size: 17px; }
      .close-dialog p { margin: 6px 0 0; color: #475569; font-size: 14px; line-height: 1.5; }
      .close-dialog__content { display: grid; gap: 18px; padding: 20px; }
      .close-dialog__content fieldset { display: grid; gap: 8px; margin: 0; padding: 0; border: 0; }
      .close-dialog__content legend, .close-checklist-title { margin: 0 0 8px; color: #0f172a; font-size: 13px; font-weight: 700; }
      .close-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
      .close-option { display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 10px; min-height: 88px; padding: 12px; border: 1px solid #cbd5e1; cursor: pointer; }
      .close-option:has(input:checked) { border-color: #06b6d4; background: #ecfeff; }
      .close-option input { width: 18px; height: 18px; margin: 2px 0 0; accent-color: #0e7490; }
      .close-option strong { display: block; color: #0f172a; font-size: 13px; }
      .close-option small { display: block; margin-top: 5px; color: #64748b; font-size: 11px; line-height: 1.45; }
      .close-checklist { display: grid; gap: 7px; margin: 0; padding: 0; list-style: none; }
      .close-checklist li { display: grid; grid-template-columns: 28px minmax(0, 1fr); align-items: center; gap: 9px; min-height: 42px; padding: 7px 10px; border: 1px solid #e2e8f0; color: #475569; font-size: 12px; }
      .close-checklist__icon { display: grid; width: 28px; height: 28px; place-items: center; border: 1px solid #cbd5e1; background: #ffffff; font-weight: 700; }
      .close-checklist li[data-status="running"] { border-color: #67e8f9; background: #ecfeff; color: #155e75; }
      .close-checklist li[data-status="done"] { border-color: #a7f3d0; background: #ecfdf5; color: #047857; }
      .close-checklist li[data-status="failed"] { border-color: #fecaca; background: #fef2f2; color: #b91c1c; }
      .close-dialog__actions { display: flex; justify-content: flex-end; gap: 8px; padding: 16px; }
      .close-dialog__confirm { border-color: #b91c1c; background: #b91c1c; color: #ffffff; }
      .close-dialog__confirm:hover { background: #991b1b; }
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes pulse { 50% { opacity: .45; } }
      @media (prefers-reduced-motion: reduce) {
        .radar-arm, .stage--running .stage-icon, .progress-value { animation: none; transition: none; }
      }
      @media (max-width: 760px) {
        body { padding: 12px; }
        .header { grid-template-columns: 86px minmax(0, 1fr); gap: 16px; min-height: 0; padding: 20px; }
        .radar { width: 80px; height: 80px; }
        .radar-ring { inset: 13px; }
        .radar-core { inset: 25px; }
        .actions { grid-column: 1 / -1; grid-template-columns: 120px 1fr 1fr; }
        .content { padding: 18px 20px 22px; }
        .groups { grid-template-columns: 1fr; }
        .close-options { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <main id="startup-shell" class="shell" data-phase="running">
      <header class="header">
        <div class="radar" aria-hidden="true">
          <span class="radar-ring"></span><span class="radar-core"></span><span class="radar-arm"></span>
          <span id="radar-value" class="radar-value">0%</span>
        </div>
        <div>
          <p id="app-label" class="brand"></p>
          <h1 id="startup-title"></h1>
          <p id="startup-subtitle" class="subtitle"></p>
          <div class="current"><span id="current-stage"></span></div>
        </div>
        <div class="actions">
          <div class="languages" aria-label="Language">
            <button id="language-vi" class="button" type="button">VI</button>
            <button id="language-en" class="button" type="button">EN</button>
          </div>
          <button id="export-button" class="button" type="button"></button>
          <button id="retry-button" class="button" type="button"></button>
        </div>
      </header>
      <section class="content">
        <div class="progress-head"><span id="progress-label"></span><span id="progress-percent">0%</span></div>
        <div id="progress-track" class="progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <span id="progress-value" class="progress-value"></span>
        </div>
        <div class="groups">
          ${createStageGroup("system-title", "system-list", systemStageIds)}
          ${createStageGroup("machine-title", "machine-list", machineStageIds)}
        </div>
        <p id="action-feedback" class="feedback" role="status" aria-live="polite"></p>
      </section>
    </main>
    <div id="close-backdrop" class="close-backdrop" hidden>
      <section id="close-dialog" class="close-dialog" role="dialog" aria-modal="true" aria-labelledby="close-title" aria-describedby="close-description">
        <div class="close-dialog__body">
          <div class="close-dialog__icon" aria-hidden="true">!</div>
          <div>
            <h2 id="close-title"></h2>
            <p id="close-description"></p>
          </div>
        </div>
        <div class="close-dialog__actions">
          <button id="close-cancel" class="button" type="button"></button>
          <button id="close-confirm" class="button close-dialog__confirm" type="button"></button>
        </div>
      </section>
    </div>
    <script>
      const copies = ${serializedCopy};
      let startupSnapshot = ${serializedSnapshot};
      const stageIds = ${serializeForScript([...systemStageIds, ...machineStageIds])};

      function getText() { return copies[startupSnapshot.language]; }
      function setText(id, value) { const element = document.getElementById(id); if (element) element.textContent = value; }
      function renderCloseDialog() {
        const text = getText();
        setText("close-title", text.exitTitle);
        setText("close-description", text.exitDescription);
        setText("close-cancel", text.exitCancel);
        setText("close-confirm", text.exitHardwareConfirm);
      }
      function symbolFor(status) {
        if (status === "done") return "✓";
        if (status === "failed") return "×";
        if (status === "warning") return "!";
        if (status === "skipped") return "-";
        if (status === "running") return "↻";
        return "";
      }
      function detailLabel(detail) {
        const labels = {
          ngResult: "NG",
          okResult: "OK",
          waitingChecking: startupSnapshot.language === "vi" ? "Chờ kiểm tra" : "Waiting",
          captureTrigger: startupSnapshot.language === "vi" ? "Tín hiệu chụp" : "Capture trigger",
          stopTrigger: startupSnapshot.language === "vi" ? "Tín hiệu dừng" : "Stop trigger",
          startTrigger: startupSnapshot.language === "vi" ? "Tín hiệu chạy" : "Start trigger",
        };
        return detail.label || labels[detail.id] || detail.id;
      }
      function renderDetails(element, stage, text) {
        element.replaceChildren();
        (stage.details || []).forEach((detail) => {
          const row = document.createElement("div");
          row.className = "detail detail--" + detail.status;
          const label = document.createElement("span");
          label.textContent = detailLabel(detail) + (detail.error ? ": " + detail.error : "");
          const status = document.createElement("strong");
          status.textContent = text.statuses[detail.status];
          row.append(label, status);
          element.append(row);
        });
      }
      function render(nextSnapshot) {
        startupSnapshot = nextSnapshot;
        const text = getText();
        document.documentElement.lang = startupSnapshot.language;
        const shell = document.getElementById("startup-shell");
        shell.dataset.phase = startupSnapshot.phase;
        setText("app-label", text.appLabel);
        setText("progress-label", text.progress);
        setText("export-button", text.exportLog);
        setText("retry-button", text.retry);
        renderCloseDialog();
        document.getElementById("language-vi").setAttribute("aria-pressed", String(startupSnapshot.language === "vi"));
        document.getElementById("language-en").setAttribute("aria-pressed", String(startupSnapshot.language === "en"));
        setText("system-title", text.groupSystem);
        setText("machine-title", text.groupMachine);

        const byId = new Map(startupSnapshot.stages.map((stage) => [stage.id, stage]));
        stageIds.forEach((id) => {
          const stage = byId.get(id) || { id, status: "pending" };
          const row = document.getElementById("stage-" + id);
          row.className = "stage stage--" + stage.status;
          setText("stage-icon-" + id, symbolFor(stage.status));
          setText("stage-label-" + id, text.stageLabels[id]);
          setText("stage-description-" + id, text.stageDescriptions[id]);
          setText("stage-status-" + id, text.statuses[stage.status]);
          renderDetails(document.getElementById("stage-details-" + id), stage, text);
        });

        const readyCount = startupSnapshot.stages.filter((stage) => stage.status === "done" || stage.status === "skipped").length;
        const progress = Math.round((readyCount / stageIds.length) * 100);
        setText("radar-value", progress + "%");
        setText("progress-percent", progress + "%");
        document.getElementById("progress-value").style.width = progress + "%";
        document.getElementById("progress-track").setAttribute("aria-valuenow", String(progress));

        const active = startupSnapshot.stages.find((stage) => stage.status === "running") ||
          startupSnapshot.stages.find((stage) => stage.status === "pending");
        setText("current-stage", active ? text.current + ": " + text.stageLabels[active.id] : "\u00a0");

        if (startupSnapshot.phase === "blocked") {
          setText("startup-title", text.blocked);
          setText("startup-subtitle", text.blockedMessage);
        } else if (startupSnapshot.phase === "warning") {
          setText("startup-title", text.hardwareWarning);
          setText("startup-subtitle", text.hardwareWarningMessage);
        } else if (startupSnapshot.phase === "finished") {
          setText("startup-title", text.completed);
          setText("startup-subtitle", text.completedMessage);
        } else {
          setText("startup-title", text.title);
          setText("startup-subtitle", text.subtitle);
        }
      }

      document.getElementById("export-button").addEventListener("click", async () => {
        const text = getText();
        const button = document.getElementById("export-button");
        button.disabled = true;
        setText("action-feedback", text.exporting);
        try {
          const result = await window.ocrDesktop.exportStartupLog({ error: startupSnapshot.error, stages: startupSnapshot.stages });
          setText("action-feedback", result.canceled ? text.exportCanceled : text.exportSuccess);
        } catch {
          setText("action-feedback", text.exportFailed);
        } finally {
          button.disabled = false;
        }
      });
      document.getElementById("retry-button").addEventListener("click", () => window.ocrDesktop.restartApp());
      document.getElementById("language-vi").addEventListener("click", () => window.ocrDesktop.setLanguagePreference("vi"));
      document.getElementById("language-en").addEventListener("click", () => window.ocrDesktop.setLanguagePreference("en"));
      const closeBackdrop = document.getElementById("close-backdrop");
      const closeCancel = document.getElementById("close-cancel");
      const closeConfirm = document.getElementById("close-confirm");
      function hideCloseConfirmation() {
        closeBackdrop.hidden = true;
        document.getElementById("startup-shell").removeAttribute("aria-hidden");
      }
      function showCloseConfirmation() {
        closeCancel.disabled = false;
        closeConfirm.disabled = false;
        document.getElementById("close-dialog").removeAttribute("aria-busy");
        renderCloseDialog();
        closeBackdrop.hidden = false;
        document.getElementById("startup-shell").setAttribute("aria-hidden", "true");
        closeConfirm.focus();
      }
      closeCancel.addEventListener("click", hideCloseConfirmation);
      closeBackdrop.addEventListener("mousedown", (event) => {
        if (
          event.target === closeBackdrop &&
          !closeConfirm.disabled &&
          !closeCancel.disabled
        ) {
          hideCloseConfirmation();
        }
      });
      closeConfirm.addEventListener("click", async () => {
        const text = getText();
        closeCancel.disabled = true;
        closeConfirm.disabled = true;
        setText("close-description", text.exiting);
        document.getElementById("close-dialog").setAttribute("aria-busy", "true");
        try {
          await window.ocrDesktop.exitApp("app-and-hardware");
        } catch {
          closeCancel.disabled = false;
          closeConfirm.disabled = false;
          setText("close-description", text.exitFailed);
          document.getElementById("close-dialog").removeAttribute("aria-busy");
        }
      });
      document.addEventListener("keydown", (event) => {
        if (
          event.key === "Escape" &&
          !closeBackdrop.hidden &&
          !closeConfirm.disabled &&
          !closeCancel.disabled
        ) {
          hideCloseConfirmation();
        }
      });
      window.ocrDesktop.onCloseRequested(showCloseConfirmation);
      window.ocrDesktop.setCloseConfirmationReady(true);
      window.ocrDesktop.getStartupSnapshot().then(render);
      window.ocrDesktop.onStartupSnapshot(render);
      render(startupSnapshot);
    </script>
  </body>
</html>`;
}

function createStageGroup(titleId: string, listId: string, ids: StartupStageId[]) {
  return `<section class="group"><h2 id="${titleId}" class="group-title"></h2><div id="${listId}" class="stage-list">${ids
    .map(
      (id) =>
        `<div id="stage-${id}" class="stage stage--pending"><div class="stage-main"><span id="stage-icon-${id}" class="stage-icon" aria-hidden="true"></span><div><div id="stage-label-${id}" class="stage-label"></div><div id="stage-description-${id}" class="stage-description"></div></div><span id="stage-status-${id}" class="stage-status"></span></div><div id="stage-details-${id}" class="stage-details"></div></div>`,
    )
    .join("")}</div></section>`;
}

function serializeForScript(value: unknown) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}
