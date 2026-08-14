# PLC runtime

## Desktop login startup integration

As soon as the backend is online, Electron starts the license check and the PLC
hardware preparation concurrently. The hardware branch uses these backend-only
internal stages:

1. `POST /api/internal/plc-runtime/startup/plc`
2. After PLC connection, run these branches concurrently:
   - `POST /api/internal/plc-runtime/startup/plc-signals`
   - `POST /api/internal/plc-runtime/startup/camera-power`, followed by
     `startup/camera-light` and `startup/camera`

The internal desktop token is required for every stage. An absent PLC
configuration or an omitted optional output address returns `skipped`. A PLC or
camera failure is a warning and does not prevent the credential form from
opening. License, database, backend, or application failures block login. If the
license is invalid, Electron calls
`POST /api/internal/plc-runtime/startup/abort`; the backend stops the machine
runtime, disconnects the camera, clears configured PLC outputs, and disconnects
the PLC before leaving the startup page blocked.

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
| `errorPulse`     | App -> PLC | `pulse`, kết quả NG             |
| `okResult`       | App -> PLC | `pulse`, kết quả OK             |
| `waitingChecking`| App -> PLC | `write_boolean`, đèn vàng chờ/kiểm tra |

Tất cả address được lưu dưới dạng số M logic. Address có thể để trống; tín hiệu trống không được watch, ghi hoặc pulse. Các address đã nhập không được trùng nhau.

- Mitsubishi SLMP dùng trực tiếp số M: `M0 -> address 0`.
- Modbus TCP tự cộng offset coil: `M0 -> coil 8192`, `M100 -> coil 8292`.
- Quy tắc chuyển đổi áp dụng cho cả tám tín hiệu cố định và key tùy chỉnh, vì vậy đổi protocol không yêu cầu sửa lại address.
- SSE đọc bit dùng chu kỳ cố định `0.002` giây, cạnh lên và debounce `1`; người dùng không chỉnh các giá trị này.
- `SleepTime` được lưu trong database và cấu hình trên UI theo giây, mặc định `300` giây.
- Xung OK và NG có thời lượng cấu hình riêng từ `50` đến `10000` ms; cả hai mặc định `500` ms.

## Key tùy chỉnh

Mỗi key có tên, address, trạng thái bật/tắt và một trong ba thao tác:

- `watch_boolean`: theo dõi cạnh lên.
- `write_boolean`: ghi trạng thái giữ.
- `pulse`: phát xung.

## API app

- `GET/PUT /api/plc/config`: đọc/lưu cấu hình toàn máy.
- `GET /api/plc/status`: trạng thái kết nối và sự kiện PLC gần nhất.
- `POST /api/plc/connect` và `POST /api/plc/disconnect`.
- `POST /api/plc/simulator/enable`, `/heartbeat`, `/disable` và `/signal`: PLC giả lập trong RAM, backend chỉ cho role `dev`.
- `PUT /api/plc/outputs/camera-power`.
- `PUT /api/plc/outputs/camera-light`.
- `POST /api/plc/outputs/ok-pulse`.
- `PUT /api/plc/outputs/waiting-checking`.
- `POST /api/plc/outputs/error-pulse`.
- `POST /api/plc/custom-keys/:id/execute`.
- `GET /api/plc/machine/status`: trạng thái flow vận hành.
- `GET /api/plc/machine/frame`: frame gần nhất do runtime chụp khi camera live tắt.
- `PATCH /api/plc/machine/controls`: cập nhật `manual/auto`, camera live và AI thời gian thực độc lập.
- `POST /api/plc/machine/start`: bắt đầu chờ tín hiệu chốt PLC.
- `POST /api/plc/machine/stop`: kết thúc vận hành bằng thao tác app.
- `POST /api/plc/machine/grab`: thực thi nút Grab thủ công; endpoint này không bao giờ phát xung PLC.
- `POST /api/plc/machine/manual-latch`: ghi nhận chốt tay, chỉ reset timeout và không ghi về PLC.
- `POST /api/plc/machine/resume`: tiếp tục thủ công sau timeout 5 phút.
- `POST /api/plc/machine/reconnect-plc`: thử kết nối lại PLC và đồng bộ nguồn camera, đèn soi theo trạng thái đang vận hành.
- `POST /api/inspections/begin`: mở phiên kiểm tra. Detect liên tục chỉ chạy khi máy `running`, camera live bật và AI thời gian thực bật.

## Ma trận Manual/Auto, camera live và AI

| Chế độ | Camera live | AI | Grab trên app | `captureTrigger` từ PLC |
| --- | --- | --- | --- | --- |
| Manual | Bật | Bật | Chốt kết quả hoàn tất mới nhất, không phát xung PLC | Chỉ ghi nhận sequence cho Line Test/chẩn đoán, không tác động vận hành |
| Manual | Tắt | Bật | Chụp -> kiểm tra -> chốt, không phát xung PLC | Không tác động vận hành |
| Manual | Bật | Tắt | Không làm gì | Không tác động vận hành |
| Manual | Tắt | Tắt | Chỉ chụp và giữ frame, không kiểm tra/chốt | Không tác động vận hành |
| Auto | Bật | Bật | Bị khóa | Chốt kết quả hoàn tất mới nhất rồi phát xung OK/NG |
| Auto | Tắt | Bật | Bị khóa | Chụp -> kiểm tra -> chốt rồi phát xung OK/NG |
| Auto | Bật | Tắt | Bị khóa | Không làm gì |
| Auto | Tắt | Tắt | Bị khóa | Chỉ chụp và giữ frame, không kiểm tra/chốt/xung |

- Tắt camera live chỉ dừng stream và giữ frame cuối; không disconnect camera vật lý.
- Tắt AI dừng detect liên tục. Không có kết quả kiểm tra thì không được chốt, đổi counter hoặc phát xung.
- Kết quả tổng hợp `UNKNOWN` không được chốt, không ghi log/counter và không phát xung PLC.
- Chỉ sự kiện PLC hợp lệ trong Auto mới được phép phát xung. Grab thủ công không đi qua đường phát xung PLC.
- Nút Manual/Auto đang được chọn và các nút Live camera/AI đang bật hiển thị màu xanh lá khi runtime hoạt động. Trong lúc PLC Stop, timeout, khôi phục camera hoặc lỗi, các trạng thái này hiển thị tắt cho đến khi máy trở lại `running`.
- Grab và Reset counter chỉ nháy xanh lá ngắn khi nhận thao tác rồi trở về màu mặc định.

## Chế độ không có PLC

- Thiếu cấu hình hoặc mất kết nối PLC không khóa ứng dụng và không chặn thao tác camera/OCR bằng tay.
- Nếu camera nhận được frame, trạng thái máy vẫn chuyển sang `running`; backend đồng thời giữ cờ PLC ngoại tuyến và lý do lỗi.
- Giao diện hiển thị thông báo có thể đóng, nút **Kết nối lại PLC** và **Ngắt kết nối PLC**. Ngắt kết nối là chủ động nên dừng auto-retry; đóng thông báo chỉ ẩn modal, không giả lập trạng thái PLC đã kết nối.
- Khi lưu cấu hình PLC, backend tạm ngắt kết nối cũ rồi tự kết nối lại bằng cấu hình mới. Cảnh báo ngoại tuyến tự biến mất ngay khi nhận trạng thái `connected`; nếu lần kết nối đầu thất bại, backend tiếp tục thử lại định kỳ.
- Khi kết nối lại thành công trong lúc đang vận hành, backend ghi `cameraPower=true` và `cameraLight=true`, sau đó xóa trạng thái PLC ngoại tuyến.
- Mỗi flow tự động chỉ sử dụng signal đã được gán address. Signal để trống được bỏ qua độc lập, không làm hỏng các chức năng còn lại.

## Tín hiệu kết quả PLC

- Trong lúc chờ chốt hoặc đang kiểm tra: `waitingChecking=true`.
- Khi PLC chốt kết quả OK: `waitingChecking=false` và phát đúng một xung `okResult` theo thời lượng OK đã cấu hình.
- Khi PLC chốt kết quả NG: `waitingChecking=false` và phát đúng một xung `errorPulse` theo thời lượng NG đã cấu hình nếu có ROI nhận diện.
- Sau 2 giây, hệ thống bật lại trạng thái chờ/kiểm tra. Khoảng 2 giây này không phải thời lượng xung OK/NG.
- Grab/chốt tay trên ứng dụng không thay đổi trạng thái chờ và không phát xung kết quả về PLC.

## Flow dừng máy

1. Nhận `stopTrigger` từ PLC và giữ nguyên session Line hiện tại.
2. Dừng OCR, ngắt kết nối camera.
3. Tắt đèn trạng thái, ghi `cameraLight=false`, sau đó `cameraPower=false`.
4. Hiển thị modal toàn ứng dụng và chờ `startTrigger`. Role `operator` bị khóa và không thể đóng modal; `dev`, `admin`, `engineer` có thể đóng thông báo để tiếp tục cấu hình ứng dụng nhưng không tự resume flow máy. Trên màn vận hành, toàn bộ nút điều khiển và phần chỉnh số lượng pack bị khóa; chỉ dropdown chuyển mã sản phẩm còn thao tác được.
5. Khi nhận `startTrigger`: ngắt ngay khoảng chờ 5 giây trước khi tắt nguồn nếu chuỗi STOP vẫn đang chạy, sau đó khôi phục `Auto + Live camera + Realtime AI`, mặc định giữ nguyên `jobId` và bộ đếm, bật nguồn camera, bật đèn, kết nối lại và yêu cầu frame thực tế. Live View phải chuyển ngay sang trạng thái **Đang kết nối camera** trong toàn bộ `resuming/waiting_camera`, không hiển thị cảnh báo mất kết nối cũ trong lúc backend đang chủ động thử lại. Nếu người vận hành đã đổi mã trong lúc STOP thì mở session mới cho mã đang chờ thay vì dùng `jobId` cũ.
6. Có một frame thật thì tự tiếp tục vận hành và bật đèn vàng. Trong lúc camera chưa sẵn sàng, modal có thể đóng để người dùng thử **Kết nối lại** trên Live View; backend vẫn tự động thử lại cho đến khi thành công hoặc nhận tín hiệu dừng/shutdown.

## Ngắt kết nối camera thủ công

- Nút **Ngắt kết nối camera** chỉ có trên giao diện quản lý sản phẩm và camera; nút **Tắt Live** chỉ dừng stream, không ngắt camera vật lý.
- Sau khi ngắt thủ công, cờ chặn auto-connect được giữ trong backend nên chuyển sang trang khác không làm camera tự kết nối lại.
- Live View vẫn hiển thị **Kết nối lại**. Chỉ thao tác này xóa cờ ngắt thủ công; trạng thái sẵn sàng chỉ được xác nhận sau khi nhận frame thật.
- Các lần ngắt camera nội bộ do PLC Stop, timeout hoặc shutdown không đặt cờ ngắt thủ công, nên flow máy vẫn có thể tự phục hồi.

## PLC giả lập cho dev

- Floating button chỉ hiển thị với role `dev`. Client ID, trạng thái bật và trạng thái mở panel được giữ trong `sessionStorage`, nên chuyển trang không tạo lại hoặc làm tắt simulator.
- Simulator chỉ tự tắt khi rời tài khoản `dev`, khi người dùng bấm tắt giả lập hoặc khi backend/app kết thúc; chuyển trang không làm thay đổi kết nối giả lập.
- Bật simulator sẽ ngắt PLC vật lý và chặn auto-reconnect trong thời gian giả lập. Trạng thái machine runtime hiện tại được giữ nguyên để dev có thể kiểm thử tín hiệu ngay trong luồng đang vận hành.
- Nhóm **PLC → Ứng dụng** phát cạnh lên/xuống qua đúng event bus runtime cho `startTrigger`, `stopTrigger`, `captureTrigger` và custom watch key.
- Nhóm **Ứng dụng → PLC** hiển thị trạng thái nguồn camera, đèn camera, đèn chờ và timeline output; backend không gọi Device Tool PLC cho các lệnh mô phỏng.
- API simulator kiểm tra role `dev` ở backend, không chỉ ẩn nút trên frontend.

## Flow không có tín hiệu chốt 5 phút

1. Bộ đếm chỉ chạy khi trạng thái là `running`.
2. Chỉ `captureTrigger` thực sự được xử lý trong Auto hoặc Grab thực sự chụp/chốt trong Manual mới reset bộ đếm.
3. Hết 5 phút: dừng OCR, ngắt camera, tắt đèn nhưng giữ nguồn camera.
4. Người dùng có thể nhấn tiếp tục; `captureTrigger` hoặc `startTrigger` mới cũng tự kích hoạt khôi phục.
5. Khi nhấn tiếp tục hoặc tự khôi phục, bật lại `Auto + Live camera + Realtime AI`, chỉ bật đèn và kết nối lại camera; không ghi lại nguồn camera.

OK từ `captureTrigger` phát `okResult` một lần. NG chỉ phát `errorPulse` khi kết quả tổng hợp là NG và số ROI nhận diện khác `0`. Kết quả chốt tay không phát bất kỳ tín hiệu nào về PLC.

## Line Test và tín hiệu chốt

- Backend tăng `captureTriggerSequence` ngay khi nhận cạnh lên của `captureTrigger`, kể cả khi không có phiên vận hành sản xuất.
- Trang Line Test theo dõi sequence này nhưng tín hiệu PLC không gọi OCR. Ảnh đơn được detect ngay sau khi chọn; camera ở chế độ liên tục luôn giữ kết quả detect hoàn tất mới nhất.
- Với ảnh đơn hoặc camera liên tục, `captureTrigger` chỉ chốt snapshot hoàn tất gần nhất và đưa kết quả vào phần kết quả mới nhất. Nếu detect mới đang chạy thì snapshot trước đó được chốt; nếu chưa có snapshot hoàn tất thì tín hiệu bị bỏ qua với cảnh báo.
- Test folder chạy tuần tự: nạp một ảnh, detect ngay, hiển thị ROI ở trạng thái chờ PLC, nhận `captureTrigger`, hiển thị kết quả chốt xong rồi mới chuyển sang ảnh kế tiếp.
- Pause giữ nguyên ảnh và kết quả đang chờ; tín hiệu PLC trong lúc pause không làm chuyển ảnh. Resume tiếp tục chờ tín hiệu cho chính ảnh đó. Stop kết thúc vòng lặp và lưu report phần đã chốt.
- Kết quả Line Test không tạo log sản xuất và không phát xung OK/NG.

## Khởi động, khôi phục và lưu ảnh

1. Khi người dùng bắt đầu vận hành: kết nối PLC, cấp nguồn camera, bật đèn soi, kết nối camera và chỉ chuyển sang `running` sau khi nhận được một frame thật; 60 giây là mốc cảnh báo, không phải mốc dừng retry.
2. Khi backend khởi động lại và tìm thấy `InspectionJob` còn `running`, backend tự chạy lại toàn bộ chuỗi trên và tiếp tục phiên đã lưu trong database.
3. Trong lúc `running`, backend chỉ lấy frame và OCR liên tục khi camera live và AI cùng bật. Chỉ kết quả đã hoàn tất mới thay thế bộ đệm live và được hiển thị theo từng ROI trên Line.
4. Trong Auto + live bật + AI bật, `captureTrigger` không khởi động detect và không chờ detect đang chạy; nó chốt snapshot hoàn tất gần nhất. Trong Auto + live tắt + AI bật, tín hiệu chạy tuần tự chụp -> kiểm tra -> chốt. Khi AI tắt, tín hiệu chỉ chụp nếu live tắt và tuyệt đối không tạo log/counter/xung.
5. `stopTrigger` có ưu tiên cao hơn detect/chốt. Detect hoặc thao tác lưu đang chạy bị hủy trước flow stop.
6. Log database luôn được lưu ở mỗi lần PLC chốt và các ROI của cùng một lần chốt dùng chung `plcCaptureId`. Ảnh chỉ được lưu khi chính sách và thư mục lưu ảnh hợp lệ; lỗi/thiếu thư mục ảnh không được phép làm mất log kết quả.
7. ROI có kết quả `UNKNOWN` không hiển thị trên overlay của Line hoặc Line Test.
8. Khi đổi tài khoản, session đang `running` của cùng sản phẩm được giữ nguyên `jobId`, bộ đếm và người bắt đầu. Tài khoản mới gắn lại vào session và chỉ được ghi là người kết thúc khi chính tài khoản đó dừng session.
9. `operatorId` là người bắt đầu session; `endedById` là người kết thúc. Session lịch sử được backfill người kết thúc bằng người bắt đầu và đánh dấu `endedByInferred=true`.
10. Sau tín hiệu dừng máy, runtime cấp nguồn/kết nối lại camera và tiếp tục thử tự động kể cả sau mốc cảnh báo 60 giây. Chỉ cần nhận thành công một frame thật thì trạng thái chuyển sang `running`; tín hiệu dừng mới phải được chấp nhận cả trong `resuming/waiting_camera`, hủy việc chờ frame và đưa máy trở lại `idle_machine_stop`. Shutdown cũng hủy việc chờ frame.

## Vòng đời session Line

- Đổi mã sản phẩm trong lúc máy đang chạy: kết thúc session hiện tại với `product_change`, sau đó mở session mới và tiếp tục flow hiện hành.
- Đổi mã sản phẩm trong lúc đang chờ PLC START: kết thúc session hiện tại với `product_change`, giữ nguyên `idle_machine_stop` và màn STOP, chỉ ghi nhận mã mới đang chờ. Không gọi start/stop machine, không kết nối camera và không chạy model. Khi nhận `startTrigger`, session mã mới được mở trước khi camera/model tiếp tục vận hành.
- Reset bộ đếm: kết thúc session đếm hiện tại và mở ngay session mới cho cùng mã sản phẩm; không gọi dừng machine runtime, không ngắt PLC/camera và không làm gián đoạn việc nhận trigger.
- Nút dừng Line: kết thúc session với `line_stop`.
- PLC dừng máy: tạm nghỉ nhưng giữ nguyên session; PLC Start tiếp tục cùng `jobId` sau khi camera trả được một frame thật, trừ trường hợp mã sản phẩm đã được đổi trong lúc STOP.
- Đóng ứng dụng: kết thúc session với `app_shutdown` trước khi tắt đầu ra PLC.

## Đóng ứng dụng

- Electron gọi endpoint nội bộ có token trước khi dừng backend.
- Backend kết thúc session Line, ghi `cameraLight=false`, `cameraPower=false`, `waitingChecking=false`, sau đó disconnect PLC.
- Nest shutdown hooks thực hiện cùng cleanup khi backend nhận tín hiệu dừng ngoài Electron.
- Đây là ngắt chủ động nên backend không phát sự kiện mất kết nối PLC và giao diện không hiển thị cảnh báo mất PLC.
- Không có bit `appRunning` riêng theo quyết định hiện tại.
