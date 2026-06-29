# Device API

Project integration note:

- This folder is now the active Device Tool for the OCR refactor repo.
- Backend and Electron call it through `/tool/v1` by default.
- The previous Device Tool implementation was moved to `tool-test/` for reference only.
- Compatibility endpoints were added for the main backend, including `/tool/v1/health`, `/tool/v1/camera/status`, `/tool/v1/camera/devices`, `/tool/v1/camera/grab`, `/tool/v1/camera/stream`, and `/tool/v1/ocr/rois`.

API điều khiển thiết bị phần cứng (**camera**, sau này **PLC**) và chạy **thuật toán AI** (OCR...), thiết kế **frontend-agnostic**: mọi client (web, PyQt, C#, CLI...) đều dùng được qua REST + WebSocket.

> Trạng thái hiện tại: **Camera** + **AI/yolo_ocr** (predict độc lập A & ký sinh stream camera B, kèm ROI). PLC nằm trong lộ trình (xem [Lộ trình](#7-lộ-trình)).

---

## 1. Triết lý thiết kế

- **API là nguồn sự thật duy nhất.** Server sở hữu phần cứng; client chỉ điều khiển qua API và nhận dữ liệu (ảnh JPEG, JSON). Không client nào tự mở camera/PLC.
- **Client chọn driver lúc chạy.** Đổi camera = client gửi `driver` khác trong request, **không sửa/build lại server**. Mở rộng = thêm 1 file driver, không đụng `core/`.
- **3 lớp tách bạch:**

```
┌──────────────────────────────────────────────┐
│  api/        REST + WebSocket + service        │  ← tầng giao tiếp
├──────────────────────────────────────────────┤
│  core/       framework tái dùng MỌI project    │  ← Tool ABC, registry, config, streaming
├──────────────────────────────────────────────┤
│  drivers/    driver theo phần cứng/model        │  ← Basler, yolo_ocr (sau: Modbus)
└──────────────────────────────────────────────┘
```

`core/` không phụ thuộc phần cứng hay frontend → bê sang project khác chỉ cần viết `drivers/` + config mới.

---

## 2. Cấu trúc thư mục

```
e:\API\
├── main.py                  # điểm chạy server (uvicorn)
├── config.json              # cài đặt vận hành server (bind host/port, presets)
├── requirements.txt
│
├── api/                     # tầng giao tiếp
│   ├── app.py               # khởi tạo FastAPI, CORS, mount /ui, lifespan
│   ├── routers/
│   │   ├── camera_router.py   # REST + WS cho camera
│   │   └── yolo_ocr_router.py # AI/yolo_ocr: A (độc lập) + B (ký sinh camera)
│   └── services/
│       ├── camera_service.py    # CameraManager + CameraSession (encode + detector tách thread)
│       └── yolo_ocr_service.py  # giữ 1 instance yolo_ocr dùng chung A & B
│
├── core/                    # framework tái dùng (KHÔNG phụ thuộc phần cứng/frontend)
│   ├── tools/
│   │   ├── base.py          # Tool ABC, ToolState, ToolError
│   │   ├── camera.py        # CameraTool ABC
│   │   ├── plc.py           # PlcTool ABC (interface; driver tách file sau)
│   │   └── vision.py        # VisionTool ABC (interface thuật toán theo-frame)
│   ├── registry.py          # đăng ký/tra cứu driver theo category (camera/ai/...)
│   ├── config.py            # nạp config.json
│   ├── streaming.py         # FrameChannel + LatestFrame (thread → WS, drop-old)
│   └── logging_setup.py
│
├── drivers/                 # driver cụ thể (theo category, đồng bộ với path API)
│   ├── camera/
│   │   └── basler.py        # BaslerCamera (pypylon)        → /tool/v1/camera/...
│   └── AI/
│       └── yolo_ocr.py      # YoloOcr (ultralytics OBB)     → /tool/v1/AI/yolo_ocr/...
│
├── static/                  # UI test (mount tại /ui)
│   ├── index.html
│   ├── camera.html          # camera + panel Detect (B) kèm ROI
│   └── AI_yolo_ocr.html     # predict độc lập (A)
│
├── docs/
│   └── api.md               # tài liệu dùng API cho client
└── logs/
    └── api.log
```

---

## 3. Cài đặt & chạy

```bash
pip install -r requirements.txt
python main.py
```

- Server: `http://localhost:8000`
- Swagger UI: `http://localhost:8000/tool/docs`
- UI test: `http://localhost:8000/ui/`

Cấu hình bind host/port trong [config.json](config.json):
```json
{ "bind_host": "0.0.0.0", "bind_port": 8000, "presets": {} }
```

Tài liệu API cho client: [docs/api.md](docs/api.md).

---

## 4. Kiến trúc cốt lõi

### 4.1 Tool & Registry
Mọi thiết bị là một `Tool` ([core/tools/base.py](core/tools/base.py)) với vòng đời `open()/close()` và trạng thái `ToolState`. Ba loại kế thừa: `CameraTool`, `PlcTool`, `VisionTool`.

Driver tự đăng ký vào registry bằng decorator:
```python
from core.registry import cameras
from core.tools.camera import CameraTool

@cameras.register("basler")
class BaslerCamera(CameraTool):
    ...
```
Server tra registry theo tên client gửi: `cameras.get("basler")` → tạo instance. Driver chỉ "tồn tại" sau khi module được import — xem `import drivers.camera` trong [api/app.py](api/app.py).

### 4.2 Streaming camera (latest-frame, encode tách thread)
Để chụp đạt tốc độ phần cứng và không bị encode JPEG kéo chậm:

```
Thread chụp (driver)        Ô latest        Worker encode (service)      WebSocket
  RetrieveResult  ──push──►  _LatestFrame  ──pull mới nhất──►  cv2.imencode ──► client
  (đếm fps #2)               (drop-old)                        FrameChannel
```

- Thread chụp chỉ đẩy frame mới nhất vào ô (rất nhẹ) → **fps phần cứng chính xác**.
- Worker encode lấy **frame mới nhất**, bỏ qua frame cũ nếu không kịp.
- `FrameChannel` ([core/streaming.py](core/streaming.py)) cầu nối thread → asyncio, hàng đợi 1 phần tử drop-old.
- Camera **mono** dùng thẳng ảnh xám (bỏ debayer); camera **màu** mới convert BGR — xem `_to_frame()` trong [drivers/camera/basler.py](drivers/camera/basler.py).

### 4.3 AI / yolo_ocr (YOLO-OBB) — 2 cách chạy, 1 instance chung
Driver `yolo_ocr` ([drivers/AI/yolo_ocr.py](drivers/AI/yolo_ocr.py)) dùng trực tiếp `ultralytics.YOLO` (task `obb`), **không phụ thuộc PyQt**. Model detect từng ký tự dạng box xoay; `_assemble_rows()` gom box thành **các dòng** (theo `cy` ± `row_threshold`, trong hàng sắp theo `cx`) rồi nối ký tự. `imgsz` tự lấy từ model lúc load.

Thuật toán = module trọn gói (service giữ **1 instance** + router gồm cả A và B); A và B **dùng chung instance** (nạp model 1 lần, config 1 nơi). Thêm thuật toán khác = thêm `drivers/AI/<tên>.py` + router/service của nó, **không đụng** cái cũ.

- **Kiểu A — độc lập** ([api/routers/yolo_ocr_router.py](api/routers/yolo_ocr_router.py)): gửi ảnh (file/binary, REST hoặc WS) → `rows`.
- **Kiểu B — ký sinh stream camera:** gắn detector (instance chung) vào `CameraSession`. Cùng nguồn frame, 2 nhánh độc lập song song:

```
                     ┌→ LatestFrame → encode JPEG    → WS /camera/{id}/stream                (xem ảnh)
Camera (raw frame) ──┤
                     └→ LatestFrame → detector.infer → WS /camera/{id}/AI/yolo_ocr/results    (text, latest-only)
```

Nhánh detector **không ảnh hưởng** nhánh frame; bỏ qua frame cũ nếu infer không kịp; **không sở hữu** model (chỉ mượn instance chung). Xem `start_detector()/_detector_loop()` trong [api/services/camera_service.py](api/services/camera_service.py). Hiện 1 detector/camera (đa detector phát triển sau).

**ROI (tuỳ chọn):** B nhận 1 hoặc list ROI (`{x,y,w,h}` hoặc `{x1,y1,x2,y2}`) → crop & infer **lần lượt từng vùng**, trả kết quả theo từng ROI; bỏ trống → infer toàn frame. ROI là tiền xử lý của nhánh B (`_infer()`), **không đụng thuật toán** nên tái dùng cho mọi detector.

---

## 5. Cách mở rộng

### 5.1 Thêm một driver camera mới
1. Tạo `drivers/camera/<tên>.py`, kế thừa `CameraTool`, hiện thực `open/close/grab/start_stream/stop_stream` (+ tuỳ chọn `set_param/diagnostics`).
2. Gắn `@cameras.register("<tên>")`.
3. Import nó trong [drivers/camera/__init__.py](drivers/camera/__init__.py).
4. Xong — client gọi `connect` với `"driver": "<tên>"`, server không sửa gì.

### 5.2 Thêm thuật toán AI mới (vd defect, classify)
- Hiện thực interface [core/tools/vision.py](core/tools/vision.py) (`load_model/configure/infer`) trong **1 file riêng** `drivers/AI/<tên>.py`, gắn `@ai.register("<tên>")`, import ở [drivers/AI/__init__.py](drivers/AI/__init__.py).
- Tạo **service + router riêng** cho thuật toán (I/O, endpoint tuỳ thuật toán — không ép chung schema), namespace `/tool/v1/AI/<tên>/...`; include ở [api/app.py](api/app.py).
- Nếu chạy theo-frame → gắn ký sinh camera (B) qua `CameraSession.start_detector()` y như yolo_ocr (chỉ cần object có `infer(frame)->dict`); nếu không thì tự có cách tự động hoá khác. **Không đụng** thuật toán cũ.

### 5.3 Thêm loại tool PLC
- Interface đã có: [core/tools/plc.py](core/tools/plc.py). Mỗi protocol là **1 file riêng** trong `drivers/plc/` (vd modbus_tcp, slmp), tự đăng ký registry `plcs`.
- Thêm router + service tương tự camera; `import drivers.plc` vào lifespan.

---

## 6. Quy ước

- **Trung lập ngôn ngữ:** ảnh truyền dạng **JPEG bytes**, kết quả dạng **JSON** (chỉ kiểu cơ bản). Không dùng định dạng riêng của Python.
- **Lỗi tool:** driver raise `ToolError` (thông điệp an toàn để trả client) thay vì exception thô.
- **REST trả** `{"success": true/false, ...}`; lỗi → `{"success": false, "error": "..."}`.
- **`core/` không import PyQt / phần cứng.** (pypylon nằm trong driver, không ở core.)

---

## 7. Lộ trình

| Hạng mục | Trạng thái |
|---|---|
| Camera (control + grab + live stream WS) | ✅ Xong |
| Đo 3 loại FPS + chẩn đoán phần cứng | ✅ Xong |
| AI/yolo_ocr A — predict độc lập (YOLO-OBB, file/binary, REST+WS) | ✅ Xong |
| AI/yolo_ocr B — ký sinh stream camera (latest-frame, kèm ROI) | ✅ Xong |
| PLC (Modbus TCP/RTU, SLMP) | ⬜ Chưa |
| Đa detector / pipeline nhiều thuật toán trên 1 camera | ⬜ Chưa |
#   A P I - T o o l - v 1  
 #   A P I - T o o l - v 1  
 
