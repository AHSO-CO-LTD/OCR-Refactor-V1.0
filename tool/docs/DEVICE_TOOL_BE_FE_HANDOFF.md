# Device Tool API Handoff for BE and FE

AI agent guide:
`docs/AI_AGENT_GUIDE.md`

## 1. Muc tieu refactor

Du an nay dang duoc chuyen tu ung dung PyQt desktop co UI truc tiep sang mot
local FastAPI device tool. Tool nay chi phu trach phan gan voi may hien truong:
camera, PLC, OCR runtime, va doc text theo ROI.

Sau refactor, business backend moi se la noi xu ly logic san pham, ket qua OK/NG,
batch/count/report, auth/user/session va dieu phoi FE. FE chi giao tiep voi BE,
khong goi truc tiep device tool tru khi dang debug noi bo.

Runtime bat buoc dung Python 3.9 vi cac native module hien tai la
`cp39-win_amd64`, vi du `Deep_Learning_Tool.cp39-win_amd64.pyd`.

## 2. Truoc refactor

Truoc refactor, `frontend/lib` vua la UI vua la noi chua logic thiet bi va
business:

| Khu vuc cu | File chinh | Vai tro cu |
| --- | --- | --- |
| UI PyQt | `Main_Screen.py`, `StackUI.py`, `Login_Screen.py`, `Authentication.py` | Hien thi man hinh, login, role, nut bam, trang thai OK/NG |
| Camera | `Camera_Program.py` | Connect Basler, exposure, width/height/offset, grab/live frame |
| PLC | `PLC.py` | Modbus TCP/RTU, SLMP, doc M0/M1/M2, bat den M100, pulse loi M101 |
| OCR display pipeline | `Display.py` | Crop ROI, rotate ROI, goi OCR, so khop text, ve overlay, luu anh |
| Database/config | `Database.py`, `Main_Screen.py` | MySQL user/product/current_session, product config, ROI, model path |
| API cu | `api/app.py`, `api/routers/OCR_AI_router.py`, `backend/AI/OCR.py` | FastAPI OCR load model/config/WebSocket |

Nhung logic cu bi tron trong UI:

- `Display.py` so sanh OCR text voi `current_product`.
- `Display.py` chap nhan text dao chieu nhu `R53-SI` cho `IS-35R`.
- `Display.py` tinh `ok_count`, `ng_count`, `self.result`.
- `Main_Screen.py` hien thi `Checking`, `OK`, `FAIL`.
- `Main_Screen.py` tinh counter, batch, reset counter.
- `Main_Screen.py` doc product/model/threshold/ROI tu Excel va MySQL.
- `Authentication.py` va `Login_Screen.py` xu ly user, role, login.
- `Database.py` hardcode ket noi MySQL.

## 3. Sau refactor

Da them FastAPI service moi trong:

```text
tool/
  app/
    main.py
    core/
    routers/
    schemas/
    services/
```

Entrypoint root `main.py` hien chay `tool.app.main:app`.

Sau khi don dep, source active chi con:

| Path | Vai tro hien tai |
| --- | --- |
| `AGENTS.md` | Quy tac bat buoc cho AI agent khi tiep tuc du an. |
| `main.py` | Launcher FastAPI Device Tool, guard Python 3.9, single-instance guard. |
| `config.json` | Cau hinh host/port local cho Device Tool. |
| `requirements.txt` | Python dependencies cho Device Tool va native runtime. |
| `docs/` | Handoff BE/FE va AI agent guide. |
| `tool/app/` | FastAPI app, routers, schemas, services. |
| `tool/runtime/ocr/` | OCR wrapper va native `.pyd/.dll` runtime bat buoc. |

Da loai bo khoi source active:

- `frontend/`: UI PyQt, icons, `.ui`, build artifacts, user/auth/product UI cu.
- `api/`: FastAPI legacy cu va log cu.
- `backend/`: wrapper/runtime OCR cu da duoc chuyen vao `tool/runtime/ocr`.

Device tool hien chi nen giu cac nhiem vu:

- Liet ke camera Basler.
- Connect/disconnect camera.
- Cau hinh camera: exposure, offset, width, height.
- Grab anh dang base64 hoac binary raw.
- Connect/disconnect PLC.
- Doc/ghi PLC raw coils.
- Doc tin hieu M0/M1/M2 theo ten nghia.
- Dieu khien den M100 va pulse loi M101.
- Load/cache OCR model.
- Cau hinh OCR threshold.
- OCR mot anh.
- OCR nhieu ROI va tra ve raw text tung ROI.
- Health/runtime status.

Device tool khong nen lam:

- Khong login/auth/user/session.
- Khong doc product list.
- Khong quyet dinh expected text.
- Khong quyet dinh OK/NG.
- Khong tinh batch/count/report.
- Khong audit nguoi dung.
- Khong hien thi UI state.

### English Ownership Matrix

| Layer | Owns | Must Not Own | Primary Interfaces | Notes |
| --- | --- | --- | --- | --- |
| Device Tool | Camera, PLC, OCR runtime, ROI cropping, raw OCR text, device health | Auth, users, sessions, product rules, OK/NG decisions, counters, reports, frontend state | `/api/v1/camera/*`, `/api/v1/plc/*`, `/api/v1/ocr/*`, `/api/v1/health` | Runs locally with Python 3.9 and native hardware/OCR dependencies. |
| Main Backend | Product config, expected text, matching rules, reversed-text acceptance, inspection orchestration, OK/NG, quantity, count, batch, reports, audit, permissions | Direct camera driver code, direct PLC driver code, direct OCR engine code, UI rendering | BE endpoints for FE, internal calls to the Device Tool | This is the business source of truth. |
| Frontend | Operator screens, product selection UI, preview display, ROI overlay display, loading/error states, OK/NG presentation | Direct calls to Device Tool, final matching logic, counter math, permission decisions | Calls only the Main Backend | FE displays BE decisions; it does not create inspection truth. |
| Packaging/Launcher | Starts Device Tool, Main Backend, and FE shell in one app/exe; resolves runtime paths | Business rules, OCR matching, camera/PLC logic | Local process management and health checks | Must include Python 3.9 runtime and required `.pyd/.dll` files. |
| AI Agent | Continue refactor inside the correct layer, preserve boundaries, verify with tests, update docs | Moving BE/FE logic back into Device Tool, reviving UI, silently changing stable code | Read `docs/AI_AGENT_GUIDE.md` first | Treat this repository as the hardware/OCR tool, not the final product app. |

## 4. API hien tai cua Device Tool

Base URL mac dinh:

```text
http://localhost:8000
```

Swagger:

```text
http://localhost:8000/api/docs
```

### Health

```http
GET /
GET /api/v1/health
```

Dung de BE kiem tra service co dang chay hay khong, camera/PLC/OCR da san sang
chua.

### Camera

```http
GET  /api/v1/camera/devices
GET  /api/v1/camera/status
POST /api/v1/camera/connect
POST /api/v1/camera/disconnect
POST /api/v1/camera/settings
POST /api/v1/camera/grab
POST /api/v1/camera/grab/raw
```

`GET /api/v1/camera/devices` tra ve danh sach camera:

```json
[
  {
    "index": 0,
    "friendly_name": "Beau (22002125)",
    "model_name": "acA2500-14gm",
    "serial_number": "22002125",
    "device_class": "BaslerGigE"
  }
]
```

`GET /api/v1/camera/status` tra ve trang thai service camera va ca thong tin
camera dang co tren may. `connected=false` khong co nghia la khong thay camera;
no chi co nghia la Device Tool chua mo ket noi camera bang `/camera/connect`.

```json
{
  "success": true,
  "data": {
    "connected": false,
    "is_grabbing": false,
    "has_last_frame": false,
    "active_device_index": null,
    "active_device": null,
    "available_device_count": 1,
    "available_devices": [
      {
        "index": 0,
        "friendly_name": "Beau (22002125)",
        "model_name": "acA2500-14gm",
        "serial_number": "22002125",
        "device_class": "BaslerGigE"
      }
    ],
    "device_scan_error": null
  }
}
```

`POST /api/v1/camera/connect`:

```json
{
  "device_index": 0,
  "exposure": 3500,
  "offset_x": 0,
  "offset_y": 0,
  "width": 3000,
  "height": 1000
}
```

Tat ca field tru `device_index` co the bo trong.

`POST /api/v1/camera/grab` tra anh base64:

```json
{
  "encode_format": ".jpg",
  "jpeg_quality": 95
}
```

`POST /api/v1/camera/grab/raw` tra binary image truc tiep, phu hop khi BE muon
proxy anh cho FE hoac debug nhanh.

### OCR

```http
GET  /api/v1/ocr/status
POST /api/v1/ocr/load-model
POST /api/v1/ocr/config
POST /api/v1/ocr/predict
POST /api/v1/ocr/predict-file
POST /api/v1/ocr/rois
WS   /api/v1/ocr/ws
```

`POST /api/v1/ocr/load-model`:

```json
{
  "model_path": "C:/duyhai/AHSO/model/IS35R_100_E35.pt"
}
```

Device tool da cache model. Neu load lai cung path, response co `cached: true`.

`POST /api/v1/ocr/config`:

```json
{
  "acceptance_threshold_ocr": 0.5,
  "duplication_threshold_ocr": 0.5,
  "row_threshold": 20
}
```

`POST /api/v1/ocr/predict` dung anh base64 full image.

`POST /api/v1/ocr/predict-file` dung multipart upload.

Khuyen dung chinh cho BE:

```http
POST /api/v1/ocr/rois
```

Request:

```json
{
  "model_path": "C:/duyhai/AHSO/model/IS35R_100_E35.pt",
  "image_base64": "<optional base64 image>",
  "grab_from_camera": false,
  "roi_list": [
    {
      "label": "slot-1",
      "x": 410,
      "y": 260,
      "width": 300,
      "height": 440,
      "rotate_clockwise": true
    },
    {
      "label": "slot-2",
      "x": 890,
      "y": 260,
      "width": 300,
      "height": 440,
      "rotate_clockwise": true
    }
  ],
  "encode_format": ".jpg",
  "jpeg_quality": 95,
  "acceptance_threshold_ocr": 0.5,
  "duplication_threshold_ocr": 0.5,
  "row_threshold": 20
}
```

Neu BE muon device tu grab camera, gui:

```json
{
  "model_path": "C:/duyhai/AHSO/model/IS35R_100_E35.pt",
  "grab_from_camera": true,
  "roi_list": [
    { "label": "slot-1", "x": 410, "y": 260, "width": 300, "height": 440 }
  ]
}
```

Response:

```json
{
  "success": true,
  "image_width": 3000,
  "image_height": 1000,
  "cycle_time_ms": 293.3,
  "results": [
    {
      "index": 0,
      "label": "slot-1",
      "text": "IS-35R",
      "x": 410,
      "y": 260,
      "width": 300,
      "height": 440,
      "error": null
    },
    {
      "index": 1,
      "label": "slot-2",
      "text": "R53-SI",
      "x": 890,
      "y": 260,
      "width": 300,
      "height": 440,
      "error": null
    }
  ],
  "error": null
}
```

Response nay la raw OCR result. Khong co `ok`, `ng_count`, `matched` hay
`expected_text`.

### Legacy OCR compatibility

Tam giu de khong lam dut cac client cu:

```http
POST /api/v1/ai/ocr_ai/load_model
POST /api/v1/ai/ocr_ai/input_config
WS   /api/v1/ai/ocr_ai/ws
```

BE moi nen uu tien endpoint moi `/api/v1/ocr/*`.

### PLC

```http
GET  /api/v1/plc/status
POST /api/v1/plc/connect
POST /api/v1/plc/disconnect
POST /api/v1/plc/read
GET  /api/v1/plc/signals
POST /api/v1/plc/write
POST /api/v1/plc/light
POST /api/v1/plc/pulse
POST /api/v1/plc/error-pulse
```

Signal mapping tu app cu:

| Tin hieu | Dia chi | Y nghia |
| --- | --- | --- |
| M0 | `0` | trigger chup anh |
| M1 | `1` | dung may |
| M2 | `2` | chay may |
| M100 | `100` | bat/tat den |
| M101 | `101` | pulse bao loi |

`GET /api/v1/plc/signals` tra:

```json
{
  "success": true,
  "grab_image": true,
  "machine_stop": false,
  "machine_start": false,
  "raw": [true, false, false]
}
```

`POST /api/v1/plc/light`:

```json
{
  "enabled": true
}
```

`POST /api/v1/plc/error-pulse`:

```json
{
  "duration_ms": 500
}
```

PLC chua test that theo yeu cau hien tai. Endpoint da co, se test sau.

## 5. Backend can lam gi

Backend moi la noi giu business truth.

### 5.1 Quan ly product config

BE nen luu nhung thong tin sau trong database cua BE:

- Product code/name.
- Expected text theo product.
- Model path hoac model identifier.
- ROI list theo product.
- Camera config theo product: exposure, offset, width, height.
- OCR thresholds: acceptance, duplication, row threshold.
- Matching rules: co chap nhan dao chieu khong, co regex/normalize khong.
- So slot bat buoc.
- Batch size/default number.
- Report policy va image retention policy.

Vi du product config:

```json
{
  "productCode": "IS-35R",
  "modelPath": "C:/duyhai/AHSO/model/IS35R_100_E35.pt",
  "expectedText": "IS-35R",
  "slotCount": 5,
  "allowReverseText": true,
  "camera": {
    "exposure": 3500,
    "offsetX": 0,
    "offsetY": 0,
    "width": 3000,
    "height": 1000
  },
  "ocr": {
    "acceptanceThreshold": 0.5,
    "duplicationThreshold": 0.5,
    "rowThreshold": 20
  },
  "rois": [
    { "label": "slot-1", "x": 410, "y": 260, "width": 300, "height": 440 },
    { "label": "slot-2", "x": 890, "y": 260, "width": 300, "height": 440 },
    { "label": "slot-3", "x": 1370, "y": 260, "width": 300, "height": 440 },
    { "label": "slot-4", "x": 1850, "y": 260, "width": 300, "height": 440 },
    { "label": "slot-5", "x": 2330, "y": 260, "width": 300, "height": 440 }
  ]
}
```

### 5.2 Dieu phoi inspection

Flow BE nen lam:

1. FE/operator chon product hoac may dang co product active.
2. BE lay product config tu database.
3. BE dam bao device tool dang healthy qua `/api/v1/health`.
4. BE connect/config camera neu can.
5. BE goi `/api/v1/ocr/rois` voi `model_path`, `roi_list`, thresholds va `grab_from_camera=true`.
6. BE nhan raw OCR texts.
7. BE chay matching rules cua product.
8. BE tinh OK/NG, ok count, ng count, quantity.
9. BE cap nhat batch/count/report/audit.
10. BE tra response cho FE.

### 5.3 Matching logic nen nam o BE

Logic cu trong `Display.py` chap nhan ca text xuoi va text dao. BE nen convert
logic nay thanh ham ro rang, co test rieng.

Pseudo TypeScript:

```ts
function buildAcceptedTexts(expected: string): string[] {
  const values = new Set<string>();
  values.add(expected);
  values.add(expected.split("").reverse().join(""));

  if (expected.includes("-")) {
    const [left, right] = expected.split("-");
    if (left && right) {
      const revLeft = left.split("").reverse().join("");
      const revRight = right.split("").reverse().join("");
      values.add(`${revRight}-${revLeft}`);
      values.add(`${revRight}${revLeft[0]}-${revLeft.slice(1)}`);
      values.add(`${revRight.slice(0, -1)}-${revRight.slice(-1)}${revLeft}`);
    }
  }

  return [...values];
}

function normalizeText(value: string): string {
  return value.trim().toUpperCase();
}

function matchesExpected(rawText: string, expected: string): boolean {
  const text = normalizeText(rawText);
  return buildAcceptedTexts(normalizeText(expected)).some((candidate) => {
    const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[-_])${escaped}($|[-_])`);
    return pattern.test(text);
  });
}
```

BE inspection result shape goi y:

```json
{
  "success": true,
  "productCode": "IS-35R",
  "result": "OK",
  "quantity": 5,
  "okCount": 5,
  "ngCount": 0,
  "cycleTimeMs": 293.3,
  "slots": [
    {
      "label": "slot-1",
      "expectedText": "IS-35R",
      "rawText": "IS-35R",
      "matched": true
    },
    {
      "label": "slot-2",
      "expectedText": "IS-35R",
      "rawText": "R53-SI",
      "matched": true
    }
  ]
}
```

### 5.4 Counter, batch va report

Nhung logic nay khong nam trong device tool:

- `count += quantity`
- `counter = count % defaultNumber`
- `batch = count // defaultNumber`
- reset counter
- luu report theo ca/ngay/user/product
- luu audit ai thay doi config
- luu anh OK/NG neu can

BE nen luu thanh transaction sau moi lan inspection:

```json
{
  "productId": "...",
  "rawOcr": "...",
  "result": "OK",
  "quantity": 5,
  "okCount": 5,
  "ngCount": 0,
  "operatorId": "...",
  "timestamp": "2026-06-16T15:30:00+07:00"
}
```

### 5.5 Backend endpoints goi y

Trong BE chinh nen co cac endpoint rieng cho FE:

```http
GET  /api/device/health
POST /api/device/camera/connect
POST /api/device/camera/grab
POST /api/inspection/run
GET  /api/inspection/current
POST /api/inspection/reset-counter
GET  /api/products
GET  /api/products/:id
PATCH /api/products/:id/inspection-config
GET  /api/reports
```

FE chi goi BE. BE goi device tool noi bo.

## 6. Frontend can lam gi

FE moi khong nen goi `http://localhost:8000/api/v1/ocr/rois` truc tiep. FE nen
goi backend chinh, de backend giu auth, permission, product config va audit.

FE nen hien thi:

- Trang thai device: API running, camera connected, PLC connected, OCR model loaded.
- Product active.
- Camera preview neu BE proxy anh tu device.
- ROI overlay theo config BE.
- Ket qua raw OCR tung slot.
- Ket qua BE da xu ly: OK/NG, ok count, ng count, quantity.
- Counter/batch/report.
- Loading state khi dang inspection.
- Error state neu camera/PLC/OCR fail.

FE khong nen tu tinh:

- Text nao dung/sai.
- Dao chieu co hop le khong.
- Result OK/NG.
- Batch/counter.
- Permission cho thao tac quan trong.

UI state goi y:

| State | Y nghia |
| --- | --- |
| `idle` | San sang |
| `checking` | BE dang goi device va xu ly |
| `ok` | BE tra result OK |
| `ng` | BE tra result NG |
| `device_error` | Device API/camera/PLC/OCR loi |
| `config_error` | Product config thieu model/ROI/expected text |

FE action goi y:

- `Start inspection`: goi `POST /api/inspection/run` cua BE.
- `Connect camera`: goi BE endpoint, BE goi device.
- `Preview/grab`: goi BE endpoint, BE proxy image tu device.
- `Reset counter`: goi BE, BE validate role va audit.
- `Change product`: goi BE, BE cap nhat active config.

## 7. Tich hop de xuat

### Phase 1: Device tool chay doc lap

Chay:

```powershell
py -3.9 main.py
```

Kiem tra:

```text
http://localhost:8000/api/docs
GET http://localhost:8000/api/v1/health
GET http://localhost:8000/api/v1/camera/devices
```

### Phase 2: BE goi device tool

BE them device client:

```ts
const DEVICE_BASE_URL = process.env.DEVICE_BASE_URL ?? "http://localhost:8000";
```

BE goi:

```http
POST ${DEVICE_BASE_URL}/api/v1/ocr/rois
```

BE xu ly matching va tra result cho FE.

### Phase 3: FE chi goi BE

FE khong can biet device tool port. FE chi biet BE API.

### Phase 4: Dong goi chung exe

Khi dong goi chung:

- Start device tool FastAPI local.
- Start BE local.
- Start FE/Electron shell.
- Dam bao Python runtime la 3.9.
- Dam bao native `.pyd/.dll` duoc include.
- Dam bao `tool/runtime/ocr/RunTime_Sofware` duoc include.
- Dam bao model path va runtime folders duoc resolve dung.

## 8. Ket qua test hien tai

Da test voi:

```text
C:\duyhai\AHSO\model\IS35R_100_E35.pt
C:\duyhai\AHSO\model\True_IS-35R_2025_11_12_10_28_25_885.bmp
C:\duyhai\AHSO\model\False_SL-37_2025_11_21_15_08_36_191.bmp
```

Camera:

- Python 3.9 thay camera `Beau (22002125)`.
- Model `acA2500-14gm`.
- Device class `BaslerGigE`.
- Connect camera OK.
- Grab raw JPEG OK.

OCR ROI:

- Anh true tra texts: `IS-35R`, `R53-SI`, `IS-35R`, `R53-SI`, `IS-35R`.
- Anh false tra texts khong match product true, vi du `RR`, rong, va ROI ngoai width o slot cuoi.
- `/api/v1/ocr/rois` chi tra raw text va error, khong tu quyet dinh OK/NG.

PLC:

- Da them endpoint.
- Chua test ket noi PLC that theo quyet dinh hien tai.

## 9. Viec con lai

- BE implement product config, matching, OK/NG, count, batch, report.
- BE implement device client goi `/api/v1/ocr/rois`.
- FE chuyen sang goi BE endpoints.
- Test PLC that sau.
- Chuan bi dong goi exe chung sau khi BE/FE tich hop xong.
