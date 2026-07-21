# PLC runtime

## Desktop login startup integration

For the manual-login startup path, Electron calls these backend-only internal stages in order:

1. `POST /api/internal/plc-runtime/startup/plc`
2. `POST /api/internal/plc-runtime/startup/camera-power`
3. `POST /api/internal/plc-runtime/startup/camera-light`
4. `POST /api/internal/plc-runtime/startup/camera`

The internal desktop token is required for every stage. An absent PLC configuration or an omitted optional output address returns `skipped`; a stage failure does not prevent the credential form from opening. These stages are not called when a remembered session is restored successfully after the physical dongle check.

## Phạm vi

- Một PLC dùng chung cho toàn máy.
- Người dùng nhập IPv4 và chọn Modbus TCP hoặc Mitsubishi SLMP; mặc định là Modbus TCP. Không hỗ trợ Modbus RTU.
- Port được hiển thị ngay sau IP và có thể tùy chỉnh; mặc định là 502 cho Modbus TCP và 5000 cho SLMP.
- Backend chỉ kết nối bằng giao thức đã chọn và không fallback sang giao thức còn lại khi lỗi.
- Frontend chỉ gọi NestJS backend. Backend gọi Device Tool qua `/tool/v1`.
- `tool/` là submodule chỉ đọc và không được thay đổi.

## Tám tín hiệu cố định, cấu hình theo nhu cầu

| Key              | Chiều      | Cách dùng                       |
| ---------------- | ---------- | ------------------------------- |
| `captureTrigger` | PLC -> App | SSE `watch_boolean`, cạnh lên   |
| `stopTrigger`    | PLC -> App | SSE `watch_boolean`, cạnh lên   |
| `startTrigger`   | PLC -> App | SSE `watch_boolean`, cạnh lên   |
| `cameraPower`    | App -> PLC | `write_boolean`, giữ trạng thái |
| `cameraLight`    | App -> PLC | `write_boolean`, giữ trạng thái |
| `errorPulse`     | App -> PLC | `pulse`, mặc định 0,5 giây      |
| `okResult`       | App -> PLC | `write_boolean`, đèn xanh OK    |
| `waitingChecking`| App -> PLC | `write_boolean`, đèn vàng chờ/kiểm tra |

Tất cả address được lưu dưới dạng số M logic. Address có thể để trống; tín hiệu trống không được watch, ghi hoặc pulse. Các address đã nhập không được trùng nhau.

- Mitsubishi SLMP dùng trực tiếp số M: `M0 -> address 0`.
- Modbus TCP tự cộng offset coil: `M0 -> coil 8192`, `M100 -> coil 8292`.
- Quy tắc chuyển đổi áp dụng cho cả tám tín hiệu cố định và key tùy chỉnh, vì vậy đổi protocol không yêu cầu sửa lại address.
- SSE đọc bit dùng chu kỳ cố định `0.002` giây, cạnh lên và debounce `1`; người dùng không chỉnh các giá trị này.
- `SleepTime` được lưu trong database và cấu hình trên UI theo giây, mặc định `300` giây.

## Key tùy chỉnh

Mỗi key có tên, address, trạng thái bật/tắt và một trong ba thao tác:

- `watch_boolean`: theo dõi cạnh lên.
- `write_boolean`: ghi trạng thái giữ.
- `pulse`: phát xung.

## API app

- `GET/PUT /api/plc/config`: đọc/lưu cấu hình toàn máy.
- `GET /api/plc/status`: trạng thái kết nối và sự kiện PLC gần nhất.
- `POST /api/plc/connect` và `POST /api/plc/disconnect`.
- `PUT /api/plc/outputs/camera-power`.
- `PUT /api/plc/outputs/camera-light`.
- `PUT /api/plc/outputs/ok-result`.
- `PUT /api/plc/outputs/waiting-checking`.
- `POST /api/plc/outputs/error-pulse`.
- `POST /api/plc/custom-keys/:id/execute`.
- `GET /api/plc/machine/status`: trạng thái flow vận hành.
- `POST /api/plc/machine/start`: bắt đầu chờ tín hiệu chốt PLC.
- `POST /api/plc/machine/stop`: kết thúc vận hành bằng thao tác app.
- `POST /api/plc/machine/manual-latch`: ghi nhận chốt tay, chỉ reset timeout và không ghi về PLC.
- `POST /api/plc/machine/resume`: tiếp tục thủ công sau timeout 5 phút.
- `POST /api/plc/machine/reconnect-plc`: thử kết nối lại PLC và đồng bộ nguồn camera, đèn soi theo trạng thái đang vận hành.
- `POST /api/inspections/begin`: mở phiên kiểm tra; khi máy vào `running`, backend bắt đầu detect liên tục độc lập với PLC.

## Chế độ không có PLC

- Thiếu cấu hình hoặc mất kết nối PLC không khóa ứng dụng và không chặn thao tác camera/OCR bằng tay.
- Nếu camera nhận được frame, trạng thái máy vẫn chuyển sang `running`; backend đồng thời giữ cờ PLC ngoại tuyến và lý do lỗi.
- Giao diện hiển thị thông báo có thể đóng và nút **Kết nối lại PLC**. Đóng thông báo chỉ ẩn modal, không giả lập trạng thái PLC đã kết nối.
- Khi lưu cấu hình PLC, backend tạm ngắt kết nối cũ rồi tự kết nối lại bằng cấu hình mới. Cảnh báo ngoại tuyến tự biến mất ngay khi nhận trạng thái `connected`; nếu lần kết nối đầu thất bại, backend tiếp tục thử lại định kỳ.
- Khi kết nối lại thành công trong lúc đang vận hành, backend ghi `cameraPower=true` và `cameraLight=true`, sau đó xóa trạng thái PLC ngoại tuyến.
- Mỗi flow tự động chỉ sử dụng signal đã được gán address. Signal để trống được bỏ qua độc lập, không làm hỏng các chức năng còn lại.

## Đèn kết quả PLC

- Trong lúc chờ chốt hoặc đang kiểm tra: `waitingChecking=true`, `okResult=false`.
- Khi PLC chốt kết quả OK: `waitingChecking=false`, `okResult=true` trong 2 giây.
- Khi PLC chốt kết quả NG: cả hai đèn tắt trong 2 giây và phát `errorPulse` nếu có ROI nhận diện.
- Sau 2 giây, hệ thống trở lại trạng thái đèn vàng chờ/kiểm tra.
- Chốt tay trên ứng dụng không thay đổi đèn kết quả và không phát tín hiệu về PLC.

## Flow dừng máy

1. Nhận `stopTrigger` từ PLC và kết thúc session Line với lý do `plc_stop`.
2. Dừng OCR, ngắt kết nối camera.
3. Tắt đèn trạng thái, ghi `cameraLight=false`, sau đó `cameraPower=false`.
4. Hiển thị modal toàn ứng dụng và chờ `startTrigger`; người dùng không thể tự resume flow này.
5. Khi nhận `startTrigger`: mở session mới cho cùng sản phẩm/người vận hành, bật nguồn camera, bật đèn, thử kết nối và yêu cầu frame thực tế trong tối đa 60 giây.
6. Có frame thì tự tiếp tục vận hành và bật đèn vàng; quá hạn thì yêu cầu restart ứng dụng Electron.

## Flow không có tín hiệu chốt 5 phút

1. Bộ đếm chỉ chạy khi trạng thái là `running`.
2. `captureTrigger` hoặc chốt tay hợp lệ đều reset bộ đếm.
3. Hết 5 phút: dừng OCR, ngắt camera, tắt đèn nhưng giữ nguồn camera.
4. Người dùng có thể nhấn tiếp tục; `captureTrigger` hoặc `startTrigger` mới cũng tự kích hoạt khôi phục.
5. Khi khôi phục, chỉ bật đèn và kết nối lại camera; không ghi lại nguồn camera.

NG từ `captureTrigger` chỉ phát `errorPulse` khi kết quả tổng hợp là NG và số ROI nhận diện khác `0`. Kết quả chốt tay không phát bất kỳ tín hiệu nào về PLC.

## Line Test và tín hiệu chốt

- Backend tăng `captureTriggerSequence` ngay khi nhận cạnh lên của `captureTrigger`, kể cả khi không có phiên vận hành sản xuất.
- Trang Line Test theo dõi sequence này nhưng tín hiệu PLC không gọi OCR. Ảnh đơn được detect ngay sau khi chọn; camera ở chế độ liên tục luôn giữ kết quả detect hoàn tất mới nhất.
- Với ảnh đơn hoặc camera liên tục, `captureTrigger` chỉ chốt snapshot hoàn tất gần nhất và đưa kết quả vào phần kết quả mới nhất. Nếu detect mới đang chạy thì snapshot trước đó được chốt; nếu chưa có snapshot hoàn tất thì tín hiệu bị bỏ qua với cảnh báo.
- Test folder chạy tuần tự: nạp một ảnh, detect ngay, hiển thị ROI ở trạng thái chờ PLC, nhận `captureTrigger`, hiển thị kết quả chốt xong rồi mới chuyển sang ảnh kế tiếp.
- Pause giữ nguyên ảnh và kết quả đang chờ; tín hiệu PLC trong lúc pause không làm chuyển ảnh. Resume tiếp tục chờ tín hiệu cho chính ảnh đó. Stop kết thúc vòng lặp và lưu report phần đã chốt.
- Kết quả Line Test không tạo log sản xuất và không phát `errorPulse`.

## Khởi động, khôi phục và lưu ảnh

1. Khi người dùng bắt đầu vận hành: kết nối PLC, cấp nguồn camera, bật đèn soi, kết nối camera và chờ frame thật tối đa 60 giây rồi mới chuyển sang `running`.
2. Khi backend khởi động lại và tìm thấy `InspectionJob` còn `running`, backend tự chạy lại toàn bộ chuỗi trên và tiếp tục phiên đã lưu trong database.
3. Trong lúc `running`, backend tuần tự lấy frame và OCR liên tục. Chỉ kết quả đã hoàn tất mới thay thế bộ đệm live và được hiển thị theo từng ROI trên Line.
4. `captureTrigger` không khởi động detect và không chờ detect đang chạy. Nó chốt ngay snapshot hoàn tất gần nhất, lưu đúng ảnh của snapshot đó, tạo log/counter và phát `errorPulse` nếu kết quả thỏa điều kiện NG. Nếu chưa có snapshot hoàn tất thì từ chối lần chốt và không tạo kết quả giả.
5. `stopTrigger` có ưu tiên cao hơn detect/chốt. Detect hoặc thao tác lưu đang chạy bị hủy trước flow stop.
6. Log database luôn được lưu ở mỗi lần PLC chốt và các ROI của cùng một lần chốt dùng chung `plcCaptureId`. Ảnh chỉ được lưu khi chính sách và thư mục lưu ảnh hợp lệ; lỗi/thiếu thư mục ảnh không được phép làm mất log kết quả.
7. ROI có kết quả `UNKNOWN` không hiển thị trên overlay của Line hoặc Line Test.

## Vòng đời session Line

- Đổi mã sản phẩm: kết thúc session hiện tại với `product_change`, sau đó mở session mới.
- Nút dừng Line: kết thúc session với `line_stop`.
- PLC dừng máy: kết thúc session với `plc_stop`; PLC Start mở session mới.
- Đóng ứng dụng: kết thúc session với `app_shutdown` trước khi tắt đầu ra PLC.

## Đóng ứng dụng

- Electron gọi endpoint nội bộ có token trước khi dừng backend.
- Backend kết thúc session Line, ghi `cameraLight=false`, `cameraPower=false`, `okResult=false`, `waitingChecking=false`, sau đó disconnect PLC.
- Nest shutdown hooks thực hiện cùng cleanup khi backend nhận tín hiệu dừng ngoài Electron.
- Đây là ngắt chủ động nên backend không phát sự kiện mất kết nối PLC và giao diện không hiển thị cảnh báo mất PLC.
- Không có bit `appRunning` riêng theo quyết định hiện tại.
