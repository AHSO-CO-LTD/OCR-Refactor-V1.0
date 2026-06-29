# Device API — Tài liệu cho Client

Project integration note:

- The OCR refactor backend uses this Device Tool through `/tool/v1`.
- The backend prefix is configurable with `DEVICE_TOOL_API_PREFIX`.
- Backend compatibility endpoints exist for active-camera flows: `/tool/v1/health`, `/tool/v1/camera/status`, `/tool/v1/camera/devices`, `/tool/v1/camera/connect`, `/tool/v1/camera/settings`, `/tool/v1/camera/grab`, `/tool/v1/camera/stream`, and `/tool/v1/ocr/rois`.

Hướng dẫn dùng API: điều khiển **camera** (nhận hình ảnh) và chạy **AI/yolo_ocr** (OCR — predict độc lập hoặc ký sinh stream camera). Mọi client (web, desktop, CLI) đều dùng được — chỉ cần HTTP + WebSocket.

- **Base URL:** `http://<host>:8000`
- **Tiền tố REST:** `/tool/v1`
- **Swagger UI (thử trực tiếp):** `http://<host>:8000/tool/docs`
- **Định dạng:** request/response JSON; ảnh là **JPEG bytes**; stream là **WebSocket nhị phân**.
- **Mục lớn:** [Camera](#rest-endpoints) · [AI / yolo_ocr](#ai--yolo_ocr)

## Quy ước chung

- REST trả về: `{"success": true, ...}` khi OK, hoặc `{"success": false, "error": "<mô tả>"}` khi lỗi.
- `{id}` là **tool_id** của camera, nhận được khi `connect` (vd `cam1`).
- Driver hiện có: `basler`. Lấy danh sách động qua `GET /tool/v1/camera/drivers`.

---

## Luồng dùng điển hình

```
1. POST /tool/v1/camera/connect      → nhận id (vd "cam1")
2. WS   /tool/v1/camera/cam1/stream  → nhận frame JPEG liên tục   (xem live)
   hoặc GET /tool/v1/camera/cam1/grab → lấy 1 ảnh JPEG            (chụp đơn)
3. POST /tool/v1/camera/cam1/param   → đổi exposure / kích thước
4. POST /tool/v1/camera/cam1/disconnect
```

---

## REST Endpoints

### 1. Liệt kê driver
`GET /tool/v1/camera/drivers`

**Output**
```json
{ "drivers": ["basler"] }
```

---

### 2. Kết nối camera
`POST /tool/v1/camera/connect`

**Input** (JSON body)

| Trường | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `driver` | string | ✅ | Tên driver, vd `"basler"` |
| `id` | string | ❌ | Tự đặt tool_id; bỏ trống sẽ tự sinh (`cam1`, `cam2`...) |
| `params` | object | ❌ | Tham số cho driver (xem bảng dưới) |

`params` cho driver **basler**:

| Trường | Kiểu | Mặc định | Mô tả |
|---|---|---|---|
| `interface` | string | `"GigE"` | `GigE` / `USB` / `CXP` — loại kết nối camera |
| `serial` | string | (camera đầu) | Chọn camera theo số serial |
| `exposure` | int | `3000` | Thời gian phơi sáng (µs) |
| `jpeg_quality` | int | `80` | Chất lượng JPEG khi stream/grab (1–100) |

**Ví dụ**
```json
{ "driver": "basler", "params": { "interface": "GigE", "exposure": 3000 } }
```

**Output**
```json
{
  "success": true,
  "id": "cam1",
  "kind": "camera",
  "driver": "basler",
  "state": "ready",
  "fps": 0.0,
  "exposure": 3000,
  "geometry": { "width": 2000, "height": 1500, "offset_x": 0, "offset_y": 0 }
}
```

---

### 3. Danh sách camera đang mở
`GET /tool/v1/camera/list`

**Output**
```json
{ "success": true, "cameras": [ { "id": "cam1", "state": "ready", "...": "..." } ] }
```

---

### 4. Trạng thái 1 camera
`GET /tool/v1/camera/{id}/status`

**Output**
```json
{
  "success": true,
  "id": "cam1", "kind": "camera", "driver": "basler", "state": "running",
  "fps": 10.5,
  "exposure": 3000,
  "geometry": { "width": 2000, "height": 1500, "offset_x": 0, "offset_y": 0 }
}
```
- `fps`: tốc độ camera chụp thực tế (phía server), chỉ > 0 khi đang stream.
- `state`: `created` | `ready` | `running` | `error` | `closed`.

---

### 5a. Thông tin camera
`GET /tool/v1/camera/{id}/info` → `{"success": true, "info": {"model": "...", "serial": "...", "vendor": "..."}}`

### 5b. Giá trị Max của 1 tham số
`GET /tool/v1/camera/{id}/max?feature=Width` → `{"success": true, "feature": "Width", "max": 4096}`
(vd `feature` = `Width`, `Height`, `ExposureTimeAbs`...)

### 5c. Range các tham số settable (để validate input)
`GET /tool/v1/camera/{id}/ranges`
```json
{
  "success": true,
  "ranges": {
    "width":    {"min": 64, "max": 3840, "inc": 4, "value": 2000},
    "height":   {"min": 1,  "max": 2748, "inc": 2, "value": 1500},
    "offset_x": {"min": 0,  "max": 1840, "inc": 4, "value": 0},
    "offset_y": {"min": 0,  "max": 1248, "inc": 2, "value": 0},
    "exposure": {"min": 16.0, "max": 1e7, "value": 3000.0}
  }
}
```
- Khóa khớp tên param trong `POST /param` → client dùng để validate (đặc biệt `inc` cho width/offset theo bước).

### 5d. Chẩn đoán (debug)
`GET /tool/v1/camera/{id}/debug_info`

Trả các thông số quyết định trần fps (hữu ích khi fps thấp).

**Output** (các khóa có thể khác nhau theo đời camera)
```json
{
  "success": true,
  "diagnostics": {
    "resulting_fps": 19.2,
    "exposure_us": 3010.0,
    "pixel_format": "Mono8",
    "payload_size": 3000000,
    "packet_size": 9000,
    "throughput_limit": null
  }
}
```
- `resulting_fps`: fps tối đa camera tự tính được với cấu hình hiện tại.
- `packet_size`: 9000 = đã bật jumbo frame (GigE); 1500 = chưa.

---

### 6. Đổi tham số (exposure / kích thước)
`POST /tool/v1/camera/{id}/param`

**Input** (gửi trường nào thì đổi trường đó)

| Trường | Kiểu | Mô tả |
|---|---|---|
| `exposure` | int | Thời gian phơi sáng (µs) |
| `width` | int | Chiều rộng vùng ảnh |
| `height` | int | Chiều cao vùng ảnh |
| `offset_x` | int | Lệch X |
| `offset_y` | int | Lệch Y |
| `roi` | [x,y,w,h] | Đặt cả 4 cùng lúc (thay cho width/height/offset) |

**Ví dụ**
```json
{ "width": 1920, "height": 1080, "offset_x": 40, "offset_y": 210 }
```

**Output**
```json
{
  "success": true,
  "applied": { "width": 1920, "height": 1080, "offset_x": 40, "offset_y": 210 },
  "status": { "geometry": { "width": 1920, "height": 1080, "offset_x": 40, "offset_y": 210 }, "...": "..." }
}
```
> Lưu ý: Basler yêu cầu width/offset theo bước (increment) nhất định. Giá trị không hợp lệ → `{"success": false, "error": "Đặt hình học thất bại: ..."}`.

---

### 7. Chụp 1 frame
`GET /tool/v1/camera/{id}/grab`

**Output:** ảnh **JPEG** (`Content-Type: image/jpeg`), không phải JSON.
Lỗi: HTTP 400 (camera chưa mở) hoặc 503 (không lấy được frame).

**Ví dụ (HTML)**
```html
<img src="http://localhost:8000/tool/v1/camera/cam1/grab" />
```

---

### 8. Ngắt kết nối
`POST /tool/v1/camera/{id}/disconnect`

**Output**
```json
{ "success": true }
```

---

## WebSocket — Live stream

`WS /tool/v1/camera/{id}/stream`

- Server **đẩy** mỗi message là **một frame JPEG** (binary). Client không cần gửi gì.
- Luôn nhận **frame mới nhất** (frame cũ bị bỏ nếu client chậm → độ trễ thấp).
- Một camera phục vụ **1 client stream** tại một thời điểm; client thứ 2 sẽ bị từ chối (`close code 1008`).

**Ví dụ (JavaScript)**
```javascript
const ws = new WebSocket(`ws://localhost:8000/tool/v1/camera/cam1/stream`);
ws.binaryType = "blob";
ws.onmessage = (ev) => {
  img.src = URL.createObjectURL(ev.data);   // ev.data là 1 ảnh JPEG
};
```

**Ví dụ (Python)**
```python
import websocket, numpy as np, cv2
ws = websocket.WebSocket()
ws.connect("ws://localhost:8000/tool/v1/camera/cam1/stream")
while True:
    data = ws.recv()                         # bytes JPEG
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    cv2.imshow("live", img); cv2.waitKey(1)
```

---

## AI / yolo_ocr

OCR bằng YOLO-OBB (detect ký tự) → trả **các dòng text** (`rows`). **Một instance dùng chung** cho cả kiểu A (độc lập) lẫn kiểu B (ký sinh camera): nạp model 1 lần, config 1 nơi, ảnh hưởng cả hai.

> `rows` là **danh sách các dòng**, mỗi dòng là chuỗi ký tự đã ráp (gom theo hàng, sắp trái→phải). Ví dụ `["IS35R"]` hoặc `["AB12", "CD34"]`.

### Nạp model
`POST /tool/v1/AI/yolo_ocr/load_model`

| Trường | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `model_path` | string | ✅ | Đường dẫn `.pt` trên máy server |
| `conf` | float | ❌ | Ngưỡng chấp nhận (mặc định 0.5) |
| `iou` | float | ❌ | Ngưỡng khử trùng lặp (mặc định 0.5) |
| `row_threshold` | int | ❌ | Sai số pixel gom hàng (mặc định 20) |

> imgsz **không cần truyền** — server tự lấy theo model (vd 352/608).

**Output:** `{"success": true, "status": {"model_loaded": true, "imgsz": 608, "num_classes": 15, ...}}`

### Đổi ngưỡng (áp cho cả A và B)
`POST /tool/v1/AI/yolo_ocr/config` body `{conf?, iou?, row_threshold?}`

`GET /tool/v1/AI/yolo_ocr/status` → trạng thái model hiện tại.

### A — Predict ảnh độc lập

REST (test đơn lẻ): `POST /tool/v1/AI/yolo_ocr/predict` — nhận **file (multipart)** hoặc **raw binary**.
```bash
curl -F "file=@anh.jpg"        http://localhost:8000/tool/v1/AI/yolo_ocr/predict
curl --data-binary @anh.jpg    http://localhost:8000/tool/v1/AI/yolo_ocr/predict
```
**Output:** `{"success": true, "rows": ["IS35R"]}`

WebSocket (khuyến nghị khi gọi nhiều, không delay): `WS /tool/v1/AI/yolo_ocr/predict` — giữ kết nối, gửi **bytes ảnh** mỗi lần, nhận `{"success","rows"}`.
```python
import websocket, json
ws = websocket.WebSocket(); ws.connect("ws://localhost:8000/tool/v1/AI/yolo_ocr/predict")
ws.send_binary(open("anh.jpg","rb").read())
print(json.loads(ws.recv()))   # {"success": true, "rows": [...]}
```

### B — Ký sinh stream camera

Chạy **trên camera đang stream**: tự lấy frame mới nhất, trả text liên tục qua WS, **không ảnh hưởng** luồng frame (`/stream`). Chỉ xử lý **frame mới nhất** (frame cũ bị bỏ). **Dùng model đã nạp ở trên** (phải `load_model` trước).

- Bật: `POST /tool/v1/camera/{id}/AI/yolo_ocr/start`
  - body tuỳ chọn `{"rois": ...}` — **1 ROI hoặc list ROI**, mỗi ROI dạng `{x,y,w,h}` **hoặc** `{x1,y1,x2,y2}`. Có ROI → crop & infer **lần lượt từng vùng**; bỏ trống → infer **toàn frame**.
  - ví dụ: `{"rois": [{"x":0,"y":0,"w":400,"h":200}, {"x1":400,"y1":0,"x2":800,"y2":200}]}`
- Tắt: `POST /tool/v1/camera/{id}/AI/yolo_ocr/stop`
- Kết quả: `WS /tool/v1/camera/{id}/AI/yolo_ocr/results`
```json
// không ROI:
{ "seq": 1234, "success": true, "rows": ["IS35R"] }
// có ROI (kết quả theo từng vùng):
{ "seq": 1234, "rois": [
  { "roi": {"x":0,"y":0,"w":400,"h":200}, "success": true, "rows": ["0626J29"] },
  { "roi": {"x1":400,"y1":0,"x2":800,"y2":200}, "success": true, "rows": ["29"] }
] }
```
- `seq`: số thứ tự frame (nhảy bước = đã bỏ frame cũ — đúng cơ chế latest-only).
- Chạy **song song** với `/stream`. Đổi ngưỡng lúc chạy: dùng `POST /AI/yolo_ocr/config` (áp chung cho A và B vì cùng 1 instance).

```javascript
const rs = new WebSocket(`ws://localhost:8000/tool/v1/camera/cam1/AI/yolo_ocr/results`);
rs.onmessage = (ev) => { const j = JSON.parse(ev.data); console.log(j.seq, j.rows); };
```

---

## Mã lỗi nhanh

| Tình huống | Phản hồi |
|---|---|
| Driver chưa đăng ký | `{"success": false, "error": "camera '<x>' chưa được đăng ký..."}` |
| Camera id không tồn tại | `{"success": false, "error": "Không có camera id '<x>'"}` |
| Không tìm thấy phần cứng | `{"success": false, "error": "Không tìm thấy camera Basler (GIGE)"}` |
| Grab khi chưa mở | HTTP 400 |
| WS khi đã có client khác | đóng với code `1008` |
