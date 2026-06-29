# Tham Khảo Live Camera Và Checking Từ Dự Án Gốc

Ngày ghi chú: 2026-06-29

Nguồn tham khảo:

- Dự án gốc: `C:\duyhai\AHSO\OCR\OCR-Metal-Core-Washing`
- Dự án refactor hiện tại: `C:\duyhai\AHSO\OCR\OCR-Metal-Core-Washing-Refactor`

Tài liệu này ghi lại cách dự án gốc chạy live camera kèm OCR checking trong lúc live, sau đó đối chiếu với kiến trúc refactor hiện tại để làm tài liệu tham khảo khi áp dụng ngược lại. Đây là tài liệu phân tích, không phải đề xuất copy nguyên logic PyQt vào frontend mới.

## Kết Luận Nhanh

Dự án gốc tách tương đối rõ 4 vai trò:

1. `MainScreen` quản lý nút bấm, trạng thái live, real-time AI, counter, PLC và nhãn kết quả.
2. `CameraController` chỉ mở camera, grab một frame hoặc tạo thread live lấy frame liên tục.
3. `ReferenceImage` nhận frame mới, hiển thị ảnh, crop ROI, chạy OCR và đánh giá OK/NG.
4. `PLCController` đọc bit PLC, phát tín hiệu grab/start/stop/error; không trực tiếp xử lý ảnh.

Khi áp dụng vào refactor, vẫn phải giữ kiến trúc:

```text
frontend -> backend -> Device/OCR Tool (/tool/v1)
```

Không đưa camera/OCR trực tiếp vào frontend. Vòng live-check sản xuất nên nằm ở backend/tool; frontend chỉ điều khiển, hiển thị trạng thái và nhận kết quả.

## File Legacy Đã Xem

- `lib/Main_Screen.py`
  - Tạo `CameraController`, `ReferenceImage`, `PLCController`.
  - Nối các nút `Connect`, `Disconnect`, `Grab`, `Live Camera`, `Real-time`, `Auto/Manual`.
  - Quản lý `live_camera_status`, `real_time_status`, `auto_mode_status`, `quantity`, `count`, `batch`, `result`.
  - Xử lý nhãn `Checking...`, `OK`, `FAIL`, stop timer và PLC error.
- `lib/Camera_Program.py`
  - Mở Basler camera bằng `pypylon`.
  - Chạy live thread `grab_continuous`.
  - Lưu frame mới nhất vào `global_vars.camera_frame`.
  - Emit `signal.new_frame_ready`.
  - Có lock grab/reconnect và cơ chế recover khi timeout hoặc camera bị remove.
- `lib/Display.py`
  - `ReferenceImage` nhận frame, hiển thị pixmap.
  - Nếu `real_time_status` bật thì crop ROI và chạy OCR.
  - Nếu đang live thì chạy OCR trong thread riêng `OCR_detect_continuous`.
  - Đánh giá OCR text theo product code, vẽ ROI xanh/đỏ, emit `send_quantity`.
- `lib/PLC.py`
  - Đọc PLC bằng Modbus TCP/RTU hoặc SLMP.
  - M0: chốt/grab, M1: stop, M2: start.
  - Có debounce 1 giây.
  - M100: đèn run/light, M101: error pulse.
- `form_UI/screenMain.ui`
  - Có nút `Live Camera`, `Grab`, khu `Real-time AI`, nhãn result/counter/camera/PLC settings.

## Luồng Legacy: Mở Camera Và Live

### Connect camera

`MainScreen.button_connect_camera` emit `signal.connect_camera`.

`CameraController.connect_camera()`:

- Reset `_manual_disconnect = False`.
- Gọi `_open_camera_locked(verify=True)`.
- Enumerate Basler devices.
- Tạo `pylon.InstantCamera` từ device đầu tiên.
- `Open()`.
- Cấu hình free-run:
  - `AcquisitionMode = Continuous`
  - `TriggerSelector = FrameStart`
  - `TriggerMode = Off`
- Set exposure.
- Apply image region nếu có.
- `StartGrabbing(pylon.GrabStrategy_LatestImageOnly)`.
- Verify bằng một lần `RetrieveResult(4000)`.
- Nếu OK thì emit `camera_connected`; nếu lỗi thì báo `No camera found!`.

`MainScreen.on_camera_connected()`:

- Đổi nút connect thành `Connected`.
- Khóa connect, mở `Grab` và `Live Camera`.
- Nếu đang live thì khóa disconnect để tránh đóng camera khi stream đang chạy.

### Bật live camera

`MainScreen.on_live_camera()`:

- Dừng nhãn `Checking` nếu đang chạy.
- Cập nhật nhãn result theo `self.result` hiện tại.
- Gọi `scale_zoom_factor()`.
- Nếu chưa live:
  - emit `signal.live_camera(True)`
  - `live_camera_status = True`
  - nút thành `Live ON`
  - khóa disconnect camera
- Nếu đang live:
  - emit `signal.live_camera(False)`
  - `live_camera_status = False`
  - nút về `Live Camera`
  - mở disconnect camera

`CameraController.start_thread_live_camera(True)`:

- Nếu thread live đang chạy thì return.
- Đặt `thread_live_camera = True`.
- Tạo daemon thread `grab_continuous`.

`CameraController.grab_continuous()`:

- Lặp khi `thread_live_camera` còn true.
- Lấy `_grab_lock`.
- Kiểm tra `_camera_ready_locked()`.
- `RetrieveResult(1000)` bằng `TimeoutHandling_Return`.
- Convert frame sang numpy RGB.
- Lưu:
  - `global_vars.camera_frame = img`
  - `global_vars.camera_time = processing_time`
- Emit `signal.new_frame_ready(True)`.
- Nếu timeout:
  - Tăng `_continuous_timeout_count`.
  - Từ lần thứ 2 hoặc camera bị remove thì `_recover_camera()`.
  - Nếu mới 1 lần thì restart grabbing.
- Sleep `0.001`.

Ý tưởng cần giữ: camera thread chỉ lấy frame và phát frame mới. Không chạy OCR trong thread camera.

## Luồng Legacy: Checking Trong Lúc Live

### Real-time AI là công tắc riêng

`MainScreen.on_real_time()`:

- Nếu chưa có model thì yêu cầu load model.
- Toggle `real_time_status`.
- Nút hiển thị `AI Checking` khi bật và `Real-time` khi tắt.

`MainScreen.on_start()`:

- Nếu chưa live thì connect camera và bật live.
- Nếu chưa real-time thì bật `real_time_status = True`.
- Nhãn result chuyển sang `Checking...`.
- Start `check_timer` mỗi 500ms để đổi text `Checking`, `Checking.`, `Checking..`, `Checking...`.

### Frame mới vào ReferenceImage

`ReferenceImage.on_show_grapped_image(is_continuous=True)`:

- Bỏ qua nếu đang display frame trước (`_displaying`) để tránh xử lý trùng frame.
- Lấy frame mới nhất từ `global_vars.camera_frame`.
- Tạo `QImage/QPixmap` để hiển thị.
- Nếu không real-time:
  - Chỉ hiển thị ảnh và ROI.
  - Tắt OCR thread.
- Nếu real-time:
  - Nếu không live và đây là grab đơn: chạy `OCR_detect()` ngay.
  - Nếu đang live: nếu OCR thread chưa chạy thì start `OCR_detect_continuous()`.

### OCR thread khi live

`OCR_detect_continuous()`:

- Lặp khi `thread_OCR_detect` true.
- Gọi `OCR_detect()`.
- Nếu live:
  - Copy `single_OCR_text` sang `continuous_OCR_text`.
- Nếu không live:
  - Reset `continuous_OCR_text` thành 5 giá trị rỗng.
- Clear `single_OCR_text`.
- Sleep `0.005`.

`OCR_detect()`:

- Dùng ROI list hiện tại.
- Lấy `self.img_crop`, là frame mới nhất đã được `on_show_grapped_image` cập nhật.
- Với mỗi ROI:
  - crop theo `x, y, w, h`
  - xoay 90 độ clockwise
  - gọi `Prediction_OCR_None_Img_E(...)`
  - đọc `Text2`
  - dùng `_inference_lock` để tránh model OCR bị gọi đồng thời
- Nếu lỗi `exception: stack overflow`:
  - Tạm tắt OCR thread.
  - Hẹn bật lại sau 1 giây.
  - Ghi log `stack_overflow_log.txt`.

Điểm quan trọng: legacy live OCR chạy theo kiểu latest-frame, có thể bỏ qua frame trung gian. Kết quả OCR có thể trễ hơn frame hiển thị một nhịp, nhưng stream không bị OCR kéo chậm.

### Đánh giá OK/NG trong lúc live

Sau khi OCR thread cập nhật `continuous_OCR_text`, `on_show_grapped_image()` đọc text hiện tại:

- Nếu `live_camera_status` true thì dùng `continuous_OCR_text`.
- Nếu grab đơn thì dùng `single_OCR_text`.
- Với từng ROI có text:
  - So khớp product code hiện tại.
  - Chấp nhận cả chuỗi đảo ngược và một vài biến thể có dấu `-`.
  - Nếu match: tăng OK count.
  - Nếu không match: set ROI màu đỏ, `self.result = False`, tăng NG count.
- Vẽ ROI:
  - Xanh nếu OK.
  - Đỏ nếu NG.
  - Text OCR vẽ gần ROI.
- `quantity = len(OCR_text_list)`.
- Emit `signal.send_quantity(quantity, result, ok_count, ng_count)`.

`MainScreen.on_count()` nhận kết quả realtime:

- Cập nhật `quantity`.
- Nếu `result == True` và `quantity == 5`:
  - Dừng `check_timer`.
  - Nhãn result = `OK`.
  - Reset `ng_frame = 0`.
- Nếu chưa đủ 5 hoặc `ng_frame < 30`:
  - Nhãn result = `Checking...`.
  - Giữ nền vàng.
- Nếu NG đủ lâu:
  - Nhãn result = `FAIL`.
- Nếu `quantity == 5` và `ng_count != 0`:
  - Tăng `ng_frame`.

Ý nghĩa: legacy không báo FAIL ngay khi có một frame NG. Nó đợi NG lặp lại nhiều frame (`ng_frame >= 30`) để tránh fail do nhiễu hoặc nháy frame.

## Luồng Legacy: Grab Khi Đang Live

`MainScreen.on_grab()`:

- Nếu không live:
  - scale zoom.
  - emit `signal.grab_image`.
- Nếu đang live:
  - emit `signal.live_camera(False)`.
  - set `live_camera_status = False`.
  - Sau `result_time` giây:
    - set lại `live_camera_status = True`
    - emit `signal.live_camera(True)`
  - Nếu không auto mode thì tạm khóa nút Grab trong `result_time`.
  - emit `save_result`.
  - Nếu record và quantity khác 0 thì emit `grap_record`.
- Sau đó chốt counter:
  - `count += quantity`
  - `counter = count % defaultNumber`
  - `batch = count // defaultNumber`
- Nếu quantity khác 0:
  - result true thì nhãn `OK`.
  - result false thì nhãn `FAIL` và emit `send_error_PLC`.
- Reset `stop_timer`.

Ý nghĩa sản xuất: live camera là preview liên tục; khi PLC/manual chốt thì tạm dừng live để đóng băng kết quả, lưu ảnh, cộng counter, rồi tự động resume.

## Luồng PLC Legacy

`PLCController.read_M_continuos()`:

- Chạy thread đọc PLC khi auto mode bật.
- Đọc M0, M1, M2.
- Debounce mỗi bit 1 giây.
- M0 rising edge:
  - emit `PLC_grab_image`, được `MainScreen` nối vào `on_grab`.
- M1 rising edge:
  - emit `PLC_stop`.
- M2 rising edge:
  - emit `light_PLC(True)` và `PLC_start`.

`send_error()`:

- Ghi M101 = true.
- Sau 500ms ghi M101 = false.

`control_light_PLC()`:

- Ghi M100 theo trạng thái run/light.

Khi áp dụng vào refactor, PLC event nên đi vào backend/runtime service, không để frontend giữ vòng đọc PLC.

## Camera Settings Legacy

`MainScreen.on_save_camera()`:

- Gửi exposure qua `signal.send_exposure`.
- Cập nhật offset/image size qua `signal.update_img_size`.
- Gọi `signal.update_roi_rect_list`.
- Lưu:
  - `Product.Exposure`
  - `CurrentSession.OffsetX`
  - `CurrentSession.OffsetY`
  - `CurrentSession.ImageWidth`
  - `CurrentSession.ImageHeight`
- Cập nhật nhãn dimension.

`CameraController.change_exposure()`:

- Nếu camera đang grabbing thì stop grabbing.
- Set exposure.
- Start grabbing lại.

`CameraController.set_image_size()`:

- Lưu image region.
- Nếu camera đang grabbing thì stop.
- Apply offset/width/height.
- Start grabbing lại.
- Nếu không live thì grab 1 frame để preview.

Điểm cần giữ: khi setting thay đổi, camera runtime phải apply ngay vào hardware/stream, không chỉ lưu database.

## Điểm Cần Cẩn Thận Của Legacy

- Logic PyQt dùng global mutable state (`global_vars.camera_frame`, `camera_time`), không phù hợp copy sang web/Electron.
- OCR thread đọc `self.img_crop` do UI display cập nhật, nên có race nhẹ giữa frame hiển thị và frame OCR.
- Đánh giá OK/NG nằm ở UI layer PyQt. Trong refactor, verdict nên nằm ở backend.
- `quantity == 5` bị hardcode theo số ROI thực tế của máy cũ; refactor nên dùng `product.roiRegions.length` hoặc rule theo product.
- Matching product code có nhiều biến thể đảo ngược. Refactor nên để trong helper backend có test unit.
- `ng_frame >= 30` là bộ lọc fail theo số frame, nên biến thành tham số cấu hình nếu đưa vào runtime mới.
- QMessageBox/alert style của legacy không áp dụng vào refactor; frontend refactor dùng Sonner.

## Trạng Thái Refactor Hiện Tại Liên Quan

### Đã có nền camera live

- Backend `CameraController` proxy:
  - `GET /api/camera/status`
  - `GET /api/camera/devices`
  - `POST /api/camera/connect`
  - `POST /api/camera/grab`
  - `POST /api/camera/ai/start`
  - `POST /api/camera/ai/stop`
- `CameraStreamGateway` proxy WebSocket:
  - `/api/camera/stream`
  - `/api/camera/ai/results`
- Device Tool `tool/api/services/camera_service.py` đã tách:
  - nhánh FRAME: encode JPEG sang stream.
  - nhánh DETECTOR: feed frame mới nhất cho yolo_ocr.
  - cả hai dùng `LatestFrame` drop-old để không làm chậm acquisition.

Nền này gần với ý tưởng tốt của legacy, nhưng sạch hơn vì detector không nằm trong UI.

### Đã có nền live OCR trên Camera page

`frontend/components/camera/camera-live-view-panel.tsx` đã có:

- Start/stop live stream.
- Start/stop AI OCR.
- Mở WebSocket `/api/camera/ai/results`.
- Hiển thị rows/ROI text từ tool.

Hiện tại phần này mới là camera setup/debug style. Nó chưa chốt thành flow runtime OK/NG/count/batch theo legacy.

### Line Test hiện tại

`frontend/components/operator/line-test-panel.tsx` hiện đang:

- Dùng ảnh upload/folder test.
- Frontend crop ROI bằng canvas.
- Gọi backend `testInspectionImage`.
- Hiển thị crop debug, slot results, batch report.
- Có live preview nếu camera đã connected, nhưng live preview chỉ làm source ảnh hiển thị; chưa phải live-check production.

Nên giữ Line Test là công cụ setup/validation. Runtime live-check thật nên đi theo Camera AI / Inspection backend flow, không đưa OCR live vào `line-test-panel.tsx`.

### Backend inspection hiện tại

`backend/src/inspections/inspections.service.ts` đã có `startInspection()`:

- Tạo/ràng buộc inspection job running.
- Gọi `deviceToolService.inspectProduct(...)`.
- Tool grab camera và chạy `/ocr/rois`.
- Backend đánh giá từng slot và ghi `inspection_logs`.

Nhưng đây là single scan/start flow, chưa phải loop live-check liên tục có PLC trigger, debounce, freeze result và NG-frame hysteresis.

## Hướng Áp Dụng Ngược Vào Refactor

### 1. Giữ live stream và OCR là 2 nhánh độc lập

Nên dùng nền sẵn có trong Device Tool:

- Stream live ảnh qua `/api/camera/stream`.
- Start OCR detector qua `/api/camera/ai/start`.
- Đọc kết quả qua `/api/camera/ai/results`.

Không nên để frontend crop ROI và predict live. Frontend chỉ:

- Chọn product.
- Start/stop inspection.
- Hiển thị live frame.
- Hiển thị slot OK/NG.
- Hiển thị counter/batch.
- Gửi action operator nếu cần.

### 2. Tạo backend runtime orchestration

Nên thêm hoặc mở rộng runtime API theo hướng:

```text
POST /api/inspections/start-live
POST /api/inspections/:jobId/stop-live
GET  /api/inspections/current
WS   /api/inspections/live-results
```

State runtime cần rõ:

- product đang chạy
- camera connected
- live stream active
- OCR detector active
- PLC auto mode active
- last slots
- last result: `CHECKING | OK | NG | FAIL | STOP`
- quantity/count/batch
- cycle time/FPS
- error state

### 3. Đưa verdict vào backend

Legacy đánh giá text trong `Display.py`. Refactor nên đặt tại backend, gần helper hiện có:

- expected text = product code
- normalize text uppercase/trim
- support reverse variants nếu cần giống legacy
- slot result OK/NG/UNKNOWN
- product result:
  - OK khi đủ tất cả slot expected.
  - CHECKING khi chưa đủ slot hoặc mới có NG tạm thời.
  - FAIL/NG khi NG lặp lại quá threshold.

Cần test unit cho matching product code, đặc biệt product có dấu `-`.

### 4. Thay `quantity == 5` bằng rule theo product

Legacy hardcode 5 slot. Refactor nên:

```text
expectedSlotCount = product.roiRegions.length
OK when okSlots === expectedSlotCount
CHECKING when recognizedSlots < expectedSlotCount
FAIL when ngFrameCount >= configuredThreshold
```

Threshold có thể default 30 frame như legacy, nhưng nên cấu hình:

- `ngFrameThreshold`
- `checkingHoldMs`
- `resultFreezeMs`
- `plcDebounceMs`

### 5. Chốt kết quả theo PLC/manual trigger

Legacy live-check có hai lớp:

- OCR realtime cập nhật liên tục.
- PLC/manual `Grab` chốt kết quả, lưu ảnh, cộng counter/batch và pulse error PLC nếu FAIL.

Refactor nên có command:

```text
POST /api/inspections/:jobId/latch
```

Hoặc backend tự latch khi PLC M0 rising edge. Latch nên:

- Lấy last stable result.
- Lưu inspection logs/snapshot.
- Cộng count/batch.
- Nếu fail thì gửi PLC error output.
- Freeze result trong `result_time` rồi resume live.

### 6. PLC nên nằm ngoài frontend

Nếu đưa PLC vào refactor:

- Device Tool hoặc backend service đọc PLC.
- Backend nhận rising edge.
- Backend gọi latch/start/stop.
- Frontend chỉ hiển thị trạng thái PLC và log event.

Không để browser đọc PLC, vì app target là Electron/local service và frontend chỉ call backend.

### 7. Camera setting phải apply runtime ngay

Giống legacy:

- Save exposure/offset/width/height phải gọi Device Tool `/camera/settings`.
- Nếu live đang chạy, cần policy rõ:
  - stop live/detector ngắn hạn rồi apply lại, hoặc
  - khóa edit khi live như Camera page hiện tại.
- Sau save phải refresh frame/status/ranges để operator thấy thay đổi ngay.

### 8. UI runtime nên tách khỏi Line Test

Line Test nên tiếp tục là màn test ROI/ảnh/folder. Runtime production nên là module riêng:

- `operator-runtime-panel` hoặc page inspection/line.
- Live frame + ROI overlay.
- Slot list.
- Result state lớn: CHECKING/OK/FAIL/STOP.
- Quantity/current scan, Count/current batch progress, Batch.
- Manual Grab/Start/Stop/Auto toggle.
- Camera/PLC status compact.
- Sonner feedback cho mọi action.

## Sequence Gợi Ý Sau Này

1. Chuẩn hóa backend text matcher theo legacy variants và viết test unit.
2. Mở rộng backend inspection state để nhận live AI results từ `/api/camera/ai/results`.
3. Thêm live result WebSocket/SSE cho frontend runtime.
4. Thêm latch endpoint và count/batch state backend.
5. Nối Camera page AI result evaluation vào backend state, không chỉ hiển thị raw rows.
6. Đưa operator runtime dashboard từ demo-assisted sang inspection backend flow.
7. Sau đó mới tính PLC runtime.

## Checklist Hoàn Thành Tài Liệu

- [x] Đã tham khảo repo gốc `C:\duyhai\AHSO\OCR\OCR-Metal-Core-Washing`.
- [x] Đã đọc luồng live camera legacy.
- [x] Đã đọc logic OCR/checking khi live.
- [x] Đã đọc logic PLC trigger liên quan.
- [x] Đã đối chiếu với backend/tool/frontend hiện tại của refactor.
- [x] Đã ghi rõ hướng áp dụng ngược vào refactor.
