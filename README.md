# AHSO OCR Metal Core Washing

Phần mềm nội bộ hỗ trợ kiểm tra OCR trên dây chuyền rửa Metal Core. Ứng dụng
quản lý sản phẩm, camera, PLC, kết quả nhận dạng, lịch sử kiểm tra và trạng thái
kết nối của một máy trạm Windows tại nhà máy.

Phiên bản ổn định hiện tại: **1.5.0**.

> Phần mềm chỉ dành cho máy và người dùng đã được AHSO hoặc đơn vị quản trị nhà
> máy cấp quyền. Không tự ý sao chép cấu hình giữa các máy.

## Phạm vi chức năng

- Vận hành kiểm tra theo sản phẩm đã cấu hình.
- Theo dõi camera, PLC, trạng thái máy và kết quả OK/NG theo thời gian thực.
- Quản lý sản phẩm, biến thể OCR, thông số AI, ROI và camera theo quyền được cấp.
- Định danh camera vật lý theo từng trạm.
- Kiểm tra thử bằng camera hoặc ảnh mà không tạo kết quả sản xuất chính thức.
- Quản lý người dùng và quyền của các vai trò vận hành.
- Xem lịch sử kiểm tra thử và báo cáo vận hành.
- Kết nối, theo dõi và đồng bộ dữ liệu được phép với Dongil Server.
- Ghi nhớ đăng nhập an toàn trên đúng máy đã đăng ký.
- Kiểm tra và cài đặt bản cập nhật có kiểm soát.

## Vai trò và phân quyền

Quyền ở bảng dưới đây là quyền mặc định. Quản trị viên có thể thay đổi quyền của
các vai trò vận hành. Nếu một tài khoản được gán danh sách quyền riêng, danh sách
đó được áp dụng thay cho quyền mặc định của vai trò.

| Nhóm chức năng | Quản trị viên | Kỹ sư | Vận hành |
| --- | --- | --- | --- |
| Vận hành Line | Có | Không mặc định | Có |
| Vận hành PLC cần thiết cho Line | Có | Có | Có |
| Line Test | Có | Có | Không mặc định |
| Sản phẩm, biến thể OCR và AI | Có | Có | Không mặc định |
| ROI | Có | Chỉ khi được cấp thêm | Không mặc định |
| Camera và định danh camera | Có | Có | Không mặc định |
| Cấu hình PLC | Có | Có | Không mặc định |
| Lịch sử kiểm tra và báo cáo | Có | Có | Không mặc định |
| Quản lý người dùng | Có | Không | Không |
| Quản lý quyền vai trò vận hành | Có | Không | Không |
| Xem trạng thái Dongil Server | Có | Có | Có |
| Kết nối lại và bắt đầu đồng bộ lịch sử | Có | Không mặc định | Có |
| Sửa cấu hình, đăng ký hoặc ngắt Dongil Server | Có | Không | Không |
| Cập nhật phần mềm | Có | Không | Không |
| Ghi nhớ đăng nhập | Có | Có | Có |

### Quản trị viên

Quản trị viên chịu trách nhiệm thiết lập và quản lý toàn bộ chức năng thông
thường của máy:

- tạo, sửa, kích hoạt, vô hiệu hóa và xóa tài khoản theo các quy tắc an toàn;
- phân quyền cho các vai trò vận hành;
- quản lý sản phẩm, OCR, AI, ROI, camera và định danh camera;
- cấu hình và vận hành PLC;
- sử dụng Line, Line Test, lịch sử và báo cáo;
- cấu hình, đăng ký, kết nối và quản lý đồng bộ Dongil Server;
- thay đổi cài đặt vận hành và thực hiện cập nhật phần mềm.

Quản trị viên không thể sửa các vai trò hệ thống được bảo vệ. Hệ thống cũng
không cho phép thao tác làm mất quản trị viên đang hoạt động cuối cùng.

### Kỹ sư

Quyền mặc định của Kỹ sư tập trung vào cấu hình kỹ thuật, kiểm tra và đối chiếu:

- quản lý sản phẩm, biến thể OCR và thông số AI;
- quản lý camera và định danh camera;
- cấu hình, kết nối và vận hành PLC;
- sử dụng Line Test;
- xem lịch sử kiểm tra thử và báo cáo vận hành;
- xem trạng thái kết nối và tiến trình đồng bộ Dongil Server.

Kỹ sư không quản lý người dùng hoặc quyền vai trò. Quyền sửa ROI, vận hành Line,
kết nối lại Dongil Server hoặc bắt đầu đồng bộ lịch sử chỉ có khi được cấp thêm.

### Vận hành

Quyền mặc định của Vận hành tập trung vào hoạt động hằng ngày:

- chọn sản phẩm, bắt đầu và dừng Line;
- sử dụng các thao tác PLC cần thiết cho Line;
- xem trạng thái Dongil Server;
- làm mới trạng thái đăng ký, kết nối lại bằng cấu hình đã được duyệt;
- xem tiến trình và bắt đầu một lần đồng bộ lịch sử mới.

Vận hành không được sửa cấu hình máy, người dùng hoặc vai trò theo mặc định. Khi
cần thêm chức năng, quản trị viên phải cấp đúng quyền trước khi sử dụng.

## Yêu cầu trước khi cài đặt

Chuẩn bị các điều kiện sau:

- máy tính Windows 64-bit thuộc hệ thống nhà máy;
- tài khoản Windows có quyền Administrator;
- nguồn điện ổn định trong suốt quá trình cài đặt;
- kết nối mạng nội bộ đến thiết bị và máy chủ cần sử dụng;
- kết nối Internet nếu máy cần tải thành phần còn thiếu hoặc bản cập nhật;
- dongle bản quyền, camera và PLC được kết nối đúng theo cấu hình của máy;
- thông tin cơ sở dữ liệu do người phụ trách hệ thống cung cấp.

Không cài đặt khi máy đang chạy sản xuất hoặc đang thực hiện một bản cập nhật khác.

## Tải bộ cài

Tải phiên bản ổn định từ trang
[GitHub Releases](https://github.com/AHSO-CO-LTD/OCR-Refactor-V1.0/releases/latest)
hoặc từ kênh phân phối nội bộ đã được AHSO xác nhận.

Chỉ sử dụng bộ cài có phiên bản phù hợp. Không đổi tên hoặc tách các tệp đi kèm
nếu bộ cài được phân phối theo gói.

## Cài đặt

1. Đăng nhập Windows bằng tài khoản có quyền Administrator.
2. Đóng phiên bản phần mềm đang chạy và bảo đảm máy không trong ca sản xuất.
3. Mở bộ cài bằng **Run as administrator**.
4. Chờ bước kiểm tra môi trường hoàn tất.
5. Nếu có thành phần chưa sẵn sàng:
   - cài thủ công rồi chọn **Kiểm tra lại**; hoặc
   - cho phép bộ cài tải và cài tự động khi máy có Internet.
6. Nhập thông tin cơ sở dữ liệu theo thông tin được cung cấp.
7. Nếu phát hiện cơ sở dữ liệu đã tồn tại, chọn đúng phương án:
   - **Dùng tên khác**: tạo cơ sở dữ liệu mới với tên khác;
   - **Sử dụng lại**: giữ và tiếp tục dùng dữ liệu hiện có;
   - **Thay thế**: xóa dữ liệu hiện có và tạo lại từ đầu.
8. Kiểm tra kỹ màn hình xác nhận và chờ cài đặt kết thúc.
9. Mở ứng dụng bằng quyền Administrator.

> **Cảnh báo:** Chỉ chọn **Thay thế** khi đã được người phụ trách cho phép và có
> bản sao lưu phù hợp. Lựa chọn này có thể xóa dữ liệu hiện có.

Không tắt máy, ngắt nguồn hoặc đóng bộ cài khi quá trình cài đặt đang diễn ra.

## Thiết lập lần đầu

1. Kết nối dongle bản quyền và các thiết bị cần thiết.
2. Mở ứng dụng bằng quyền Administrator.
3. Chờ màn hình **Kiểm tra khởi động** hoàn tất.
4. Nếu hệ thống chưa có quản trị viên, màn hình thiết lập lần đầu sẽ xuất hiện.
5. Nhập tên đăng nhập, mật khẩu, xác nhận mật khẩu, họ tên và các thông tin nhân
   sự cần thiết.
6. Chọn thư mục lưu kết quả hợp lệ. Mật khẩu phải có ít nhất 8 ký tự.
7. Hoàn tất thiết lập, đăng nhập và kiểm tra sản phẩm, camera, PLC cùng trạng thái
kết nối trước khi đưa máy vào sản xuất.

Cấu hình kỹ thuật nên do Quản trị viên hoặc Kỹ sư được phân quyền thực hiện.
Không thay đổi cấu hình đang dùng trong khi máy đang chạy sản xuất.

## Bố cục và thao tác chung

- Quản trị viên sử dụng thanh điều hướng bên trái.
- Kỹ sư và Vận hành sử dụng thanh điều hướng phía trên khi có nhiều hơn một màn
  hình được cấp quyền.
- Màn hình hoặc nút không thuộc quyền tài khoản có thể bị ẩn hoặc vô hiệu hóa.
- Quyền được kiểm tra lại khi thực hiện thao tác; việc nhìn thấy một màn hình
  không thay thế cho quyền thực hiện chức năng.
- Menu tài khoản cho phép mở **Cài đặt**, đổi ngôn ngữ, khởi động lại ứng dụng,
  thoát ứng dụng hoặc đăng xuất.
- Các biểu tượng trạng thái trên thanh điều hướng cho biết tình trạng dongle và
  kết nối máy chủ.

## Hướng dẫn từng màn hình

### 1. Kiểm tra khởi động

Màn hình này xuất hiện trước trang đăng nhập và hiển thị trạng thái chuẩn bị của
phần mềm, bản quyền và các thiết bị liên quan.

Cách sử dụng:

1. Chờ các hạng mục hoàn tất kiểm tra.
2. Nếu bản quyền không hợp lệ, xử lý dongle trước khi tiếp tục.
3. Nếu PLC hoặc camera có cảnh báo, ghi nhận nội dung và kiểm tra thiết bị. Một
   số cảnh báo cho phép vào ứng dụng để chẩn đoán thủ công.
4. Sau khi khắc phục nguyên nhân, chọn **Kiểm tra lại** mà không cần cài lại ứng
   dụng.
5. Chỉ đăng nhập và vận hành khi các điều kiện bắt buộc đã sẵn sàng.

### 2. Thiết lập quản trị viên đầu tiên

Màn hình chỉ xuất hiện khi hệ thống chưa có quản trị viên khách hàng.

Cách sử dụng:

1. Nhập tên đăng nhập duy nhất.
2. Nhập mật khẩu có ít nhất 8 ký tự và nhập lại chính xác.
3. Nhập họ tên; bổ sung bộ phận và mã nhân viên nếu quy trình nhà máy yêu cầu.
4. Chọn thư mục lưu kết quả.
5. Kiểm tra thông tin rồi hoàn tất thiết lập.

Không chia sẻ tài khoản quản trị viên đầu tiên cho nhiều người dùng.

### 3. Đăng nhập

Màn hình đăng nhập gồm lựa chọn ngôn ngữ, tên đăng nhập, mật khẩu, nút hiện/ẩn
mật khẩu và tùy chọn **Ghi nhớ đăng nhập**.

Cách sử dụng:

1. Chọn tiếng Việt hoặc English.
2. Nhập tên đăng nhập và mật khẩu được cấp.
3. Chỉ chọn **Ghi nhớ đăng nhập** trên máy trạm đúng của tài khoản.
4. Chọn **Đăng nhập**.

Ghi nhớ đăng nhập áp dụng cho mọi vai trò đang hoạt động:

- ứng dụng có thể tự khôi phục đăng nhập sau khi đóng, khởi động lại ứng dụng
  hoặc khởi động lại Windows;
- chức năng chỉ hợp lệ trên cùng máy và khi dongle thật được xác nhận;
- mật khẩu không được lưu để tự động đăng nhập;
- đăng xuất sẽ hủy trạng thái ghi nhớ;
- đăng nhập thủ công mà không chọn ghi nhớ sẽ thay thế trạng thái ghi nhớ cũ;
- tài khoản bị vô hiệu hóa, xóa hoặc thay đổi quyền quan trọng có thể phải đăng
  nhập lại.

Nếu không có trạng thái ghi nhớ hợp lệ, ứng dụng đi thẳng vào biểu mẫu đăng nhập
và không hiển thị lỗi không cần thiết.

### 4. Menu tài khoản

Mở menu ở khu vực tên tài khoản để:

- vào **Cài đặt**;
- đổi ngôn ngữ;
- xem nhanh trạng thái dongle và máy chủ;
- chọn **Khởi động lại ứng dụng** khi cần chạy lại toàn bộ bước chuẩn bị;
- chọn **Thoát ứng dụng** để đóng đúng quy trình;
- chọn **Đăng xuất** để kết thúc phiên và hủy ghi nhớ đăng nhập.

Không tắt cưỡng bức Windows khi ứng dụng đang lưu kết quả, đồng bộ hoặc cập nhật.

### 5. Vận hành Line

Đây là màn hình vận hành sản xuất chính.

Thông tin và điều khiển chính:

- sản phẩm đang chọn;
- trạng thái máy, PLC, camera và AI;
- chế độ **Manual/Auto**;
- bật/tắt hình ảnh trực tiếp từ camera;
- bật/tắt nhận dạng thời gian thực;
- hình ảnh cùng vùng nhận dạng và kết quả gần nhất;
- bộ đếm tổng, OK, NG, số lượng theo lô và mục tiêu;
- các nút bắt đầu, dừng, Grab và đặt lại bộ đếm.

Quy trình vận hành khuyến nghị:

1. Chọn đúng mã sản phẩm trước khi bắt đầu.
2. Kiểm tra trạng thái camera, PLC và các tín hiệu cần thiết.
3. Chọn **Manual** hoặc **Auto** theo quy trình của máy.
4. Bật camera trực tiếp và AI khi quy trình yêu cầu.
5. Bắt đầu Line và theo dõi ảnh, kết quả gần nhất cùng bộ đếm.
6. Dừng ngay khi camera, PLC hoặc kết quả nhận dạng có dấu hiệu bất thường.
7. Khi đổi sản phẩm, kiểm tra lại mã và cấu hình trước khi tiếp tục. Hệ thống sẽ
   kết thúc phiên của sản phẩm cũ và tạo phiên phù hợp cho sản phẩm mới.
8. Chỉ đặt lại bộ đếm khi thực sự bắt đầu một phiên đếm mới.

Lưu ý:

- **Grab** thủ công chỉ chụp/kiểm tra tại chỗ; không tạo xung kết quả sản xuất
  chính thức.
- Kết quả chưa xác định không được tính vào OK/NG, không lưu như một lần chốt
  sản xuất và không gửi về PLC.
- Tắt hình ảnh trực tiếp không đồng nghĩa với ngắt camera vật lý.
- Khi máy dừng do tín hiệu hoặc cảnh báo, chờ trạng thái sẵn sàng trước khi tiếp
  tục.

### 6. Line Test

Line Test dùng để kiểm tra cấu hình OCR bằng camera hoặc ảnh thử mà không thay
thế cho kết quả sản xuất.

Cách sử dụng:

1. Chọn đúng sản phẩm cần kiểm tra.
2. Chọn nguồn ảnh được hỗ trợ: camera, một ảnh hoặc thư mục ảnh.
3. Với camera, chờ hình ảnh và kết quả nhận dạng gần nhất sẵn sàng.
4. Với ảnh hoặc thư mục, chọn dữ liệu thử rồi bắt đầu kiểm tra.
5. Theo dõi kết quả OK, NG, chưa xác định, lỗi và chi tiết từng ROI.
6. Dùng tạm dừng, tiếp tục hoặc hủy khi các nút này xuất hiện trong luồng thử.
7. Mở **Lịch sử kiểm tra** để đối chiếu phiên và ảnh lỗi đã ghi nhận.

Line Test không phát xung OK/NG và không tạo bản ghi sản xuất chính thức.

### 7. Người dùng

Màn hình dành cho tài khoản có quyền quản lý người dùng.

Chức năng:

- xem tổng quan và làm mới danh sách;
- tạo tài khoản mới;
- sửa họ tên, bộ phận, mã nhân viên, vai trò và thông tin đăng nhập được phép;
- kích hoạt hoặc vô hiệu hóa tài khoản;
- xóa tài khoản theo quy tắc an toàn.

Cách sử dụng:

1. Chọn **Tạo người dùng** để thêm tài khoản cá nhân.
2. Chọn đúng vai trò theo công việc thực tế.
3. Mở một dòng để chỉnh sửa thông tin hoặc trạng thái.
4. Đọc kỹ hộp thoại xác nhận trước khi vô hiệu hóa hoặc xóa.
5. Yêu cầu người dùng đăng nhập lại nếu vai trò, trạng thái hoặc quyền vừa thay
   đổi.

Không thể xóa tài khoản đang đăng nhập. Hệ thống không cho phép xóa, vô hiệu hóa
hoặc hạ quyền quản trị viên đang hoạt động cuối cùng.

### 8. Vai trò và quyền

Màn hình này quản lý quyền của các vai trò vận hành.

Cách sử dụng:

1. Chọn vai trò cần cấu hình.
2. Xem các nhóm quyền và bật/tắt đúng chức năng cần thiết.
3. Đối chiếu nguyên tắc phân tách nhiệm vụ của nhà máy.
4. Lưu thay đổi.
5. Yêu cầu các tài khoản bị ảnh hưởng đăng nhập lại khi cần.

Thay đổi quyền vai trò áp dụng cho tài khoản đang dùng quyền mặc định của vai
trò. Tài khoản có danh sách quyền riêng không tự nhận thay đổi này. Các vai trò
hệ thống được bảo vệ không thể chỉnh sửa tại đây.

### 9. Cấu hình

Màn hình **Cấu hình** tập trung các tab Sản phẩm, Biến thể, Cài đặt AI, ROI,
Camera và Định danh camera. Chỉ các tab thuộc quyền tài khoản mới xuất hiện.

#### 9.1. Sản phẩm

Chức năng:

- tạo, sửa và xóa sản phẩm;
- kích hoạt hoặc ngừng sử dụng sản phẩm;
- quản lý mã hàng, tên, số lượng lô và hồ sơ cơ bản;
- tải tệp mẫu, nhập danh sách sản phẩm theo mẫu;
- sao chép hoặc áp dụng hồ sơ cấu hình cho sản phẩm được chọn.

Cách sử dụng:

1. Tìm hoặc chọn sản phẩm cần thao tác.
2. Khi tạo mới, nhập mã và tên không trùng với sản phẩm hiện có.
3. Nhập số lượng lô và các thông tin bắt buộc.
4. Kiểm tra các phần camera, AI và ROI nếu biểu mẫu cho phép cấu hình cùng hồ sơ.
5. Lưu và kiểm tra lại trạng thái hoạt động.

Khi nhập hàng loạt, luôn dùng đúng tệp mẫu, xem kết quả kiểm tra dữ liệu và sửa
các dòng lỗi trước khi sử dụng trong sản xuất.

#### 9.2. Biến thể OCR

Biến thể OCR là các chuỗi thay thế được chấp nhận cho cùng một sản phẩm.

Cách sử dụng:

1. Chọn sản phẩm.
2. Xem mã chính và danh sách biến thể hiện có.
3. Thêm chuỗi được phép hoặc xóa chuỗi không còn sử dụng.
4. Tránh nhập trùng mã chính, trùng biến thể hoặc vượt giới hạn hiển thị.
5. Lưu rồi kiểm tra bằng Line Test trước khi đưa vào sản xuất.

#### 9.3. Cài đặt AI

Màn hình lưu các ngưỡng nhận dạng riêng cho từng sản phẩm.

Cách sử dụng:

1. Chọn sản phẩm.
2. Điều chỉnh ngưỡng chấp nhận theo dữ liệu đã được đánh giá.
3. Chỉ mở các tùy chọn nâng cao khi có yêu cầu kỹ thuật rõ ràng.
4. Lưu cấu hình.
5. Dùng Line Test với mẫu OK và NG đại diện để đối chiếu trước khi áp dụng.

Không sao chép ngưỡng giữa các sản phẩm nếu chưa kiểm tra ảnh thực tế.

#### 9.4. ROI

ROI xác định các vùng cần nhận dạng trên ảnh của từng sản phẩm.

Chức năng chính:

- thêm và xóa vùng;
- kéo, thay đổi kích thước và điều chỉnh vùng trên ảnh xem trước;
- hoàn tác, làm lại và đặt lại thay đổi;
- lưu cho sản phẩm hiện tại;
- áp dụng cấu hình cho nhiều sản phẩm khi được phép.

Cách sử dụng:

1. Chọn sản phẩm và bảo đảm ảnh xem trước đúng camera/hướng đặt sản phẩm.
2. Thêm từng ROI theo thứ tự kiểm tra mong muốn.
3. Căn vùng đủ bao quanh nội dung cần đọc nhưng không chồng lấn ROI khác.
4. Nhập giá trị mong đợi cho từng vùng khi biểu mẫu yêu cầu.
5. Dùng hoàn tác/làm lại nếu thao tác chưa đúng.
6. Lưu cho sản phẩm hiện tại; chỉ áp dụng cho nhiều sản phẩm sau khi đọc kỹ xác
   nhận.
7. Kiểm tra lại bằng Line Test.

Hệ thống từ chối các ROI chồng lấn. Không thay đổi ROI của sản phẩm đang chạy.

#### 9.5. Camera

Màn hình Camera quản lý cấu hình ảnh theo sản phẩm.

Các thông số thường gặp:

- nguồn hoặc thiết bị camera;
- độ phơi sáng;
- độ phóng đại;
- chiều rộng, chiều cao và độ lệch ảnh;
- trạng thái kết nối và ảnh xem trước.

Cách sử dụng:

1. Dừng sản xuất trước khi chỉnh cấu hình.
2. Chọn sản phẩm và đúng thiết bị camera.
3. Làm mới danh sách thiết bị nếu camera chưa xuất hiện.
4. Điều chỉnh từng thông số nhỏ và quan sát ảnh xem trước.
5. Lưu cho sản phẩm hiện tại hoặc áp dụng cho các sản phẩm đã xác định.
6. Chờ camera áp dụng lại cấu hình và xác nhận có ảnh thật.
7. Dùng Line Test để kiểm tra kết quả OCR.

Không ngắt camera vật lý trong khi Line đang chạy.

#### 9.6. Định danh camera

Màn hình này liên kết số serial camera vật lý với tên trạm ổn định.

Thông tin hiển thị gồm tên trạm, serial, loại phần cứng, trạng thái phát hiện,
trạng thái định danh, khả năng kết nối và lần thấy gần nhất.

Cách sử dụng:

1. Chọn **Đồng bộ camera** để đọc lại các thiết bị đang phát hiện.
2. Đối chiếu serial trên giao diện với camera vật lý.
3. Nhập tên trạm rõ ràng và duy nhất.
4. Lưu từng camera.
5. Chỉ chọn **Tắt** khi chắc chắn camera đó không được dùng cho trạm hiện tại.

Số camera khả dụng phải dựa trên thiết bị đang phát hiện và còn được bật, không
chỉ dựa trên các bản ghi định danh cũ.

### 10. PLC

Màn hình PLC dùng để cấu hình kết nối, tín hiệu và kiểm tra đầu ra của máy.

Chức năng:

- xem trạng thái và làm mới;
- kết nối hoặc ngắt kết nối PLC;
- nhập địa chỉ mạng, cổng và giao thức đã được phê duyệt;
- cấu hình địa chỉ tín hiệu bắt đầu, dừng, chụp, nguồn camera, đèn, chờ, OK và NG;
- cấu hình thời lượng xung OK/NG;
- thêm khóa tín hiệu tùy chỉnh khi quy trình yêu cầu;
- xem tín hiệu gần đây;
- kiểm tra đầu ra camera, đèn, chờ, OK, NG và đầu ra tùy chỉnh.

Quy trình an toàn:

1. Dừng Line và xác nhận máy không trong chu kỳ tự động.
2. Đối chiếu cấu hình với tài liệu điện/PLC của đúng máy.
3. Chỉ sửa trường cần thiết; địa chỉ để trống sẽ được bỏ qua độc lập.
4. Lưu cấu hình và chờ hệ thống kết nối lại.
5. Kiểm tra trạng thái trước khi thử tín hiệu.
6. Khi thử đầu ra, bảo đảm khu vực máy an toàn và có người phụ trách thiết bị.
7. Dừng thử ngay nếu tín hiệu thực tế khác mong đợi.

Không thử đầu ra PLC khi máy đang sản xuất.

### 11. Lịch sử kiểm tra

Màn hình này hiển thị các phiên được tạo từ Line Test.

Có thể xem:

- thời gian, sản phẩm và người thực hiện;
- thư mục hoặc nguồn ảnh thử;
- tổng số ảnh, số OK, NG và lỗi;
- danh sách ảnh thất bại;
- kết quả từng ROI và ảnh xem trước khi có dữ liệu.

Cách sử dụng:

1. Duyệt các trang lịch sử và chọn phiên cần kiểm tra.
2. Đối chiếu tổng số với dữ liệu thử đã sử dụng.
3. Mở ảnh lỗi hoặc chi tiết ROI để xác định nguyên nhân.
4. Điều chỉnh cấu hình tại màn hình phù hợp rồi tạo một phiên Line Test mới để
   so sánh.

Không dùng số liệu Line Test làm báo cáo sản xuất.

### 12. Báo cáo vận hành

Màn hình báo cáo tổng hợp các phiên và kết quả sản xuất đã ghi nhận.

Thông tin chính:

- tổng số phiên và kết quả;
- tổng OK, NG và chưa xác định theo dữ liệu hiển thị;
- thời gian, sản phẩm, người bắt đầu và người kết thúc phiên;
- các lần chụp trong phiên;
- ảnh và chi tiết ROI khi dữ liệu có sẵn.

Cách sử dụng:

1. Chọn khoảng dữ liệu hoặc trang cần đối chiếu.
2. Kiểm tra đúng sản phẩm và thời gian phiên.
3. Mở rộng phiên để xem các lần chụp.
4. Mở chi tiết một kết quả để xem ảnh và từng ROI.
5. Khi phát hiện sai lệch, ghi nhận mã sản phẩm, thời gian và phiên trước khi yêu
   cầu hỗ trợ.

Không gửi ảnh hoặc dữ liệu sản xuất ra ngoài kênh được nhà máy phê duyệt.

### 13. Cài đặt

Màn hình Cài đặt gồm các tab khả dụng theo vai trò và quyền.

#### 13.1. Chung — Desktop

Cho phép điều chỉnh chế độ toàn màn hình, khung cửa sổ, luôn nằm trên cùng và
kích thước cửa sổ theo các lựa chọn được hỗ trợ.

Một số thay đổi giao diện cửa sổ chỉ có hiệu lực đầy đủ sau khi khởi động lại
ứng dụng. Dùng **Khởi động lại ứng dụng** trong menu tài khoản thay vì tắt cưỡng
bức tiến trình.

#### 13.2. Chung — Ngôn ngữ

Chọn tiếng Việt hoặc English. Lựa chọn được ghi nhớ cho các lần mở sau và áp
dụng cho màn hình khởi động cùng giao diện chính.

#### 13.3. Chung — Dongil Server

Khu vực này hiển thị nhận dạng máy, loại máy cố định, cấu hình kết nối, trạng
thái đăng ký, trạng thái máy, tên máy, trạng thái hoạt động, thông tin vị trí,
lần kết nối gần nhất, heartbeat gần nhất và số dữ liệu đang chờ.

Quyền thao tác mặc định:

- **Quản trị viên:** kiểm tra, lưu hoặc đặt lại cấu hình; gửi yêu cầu đăng ký;
  kết nối, ngắt kết nối, làm mới; bắt đầu và quản lý đồng bộ lịch sử.
- **Kỹ sư:** xem trạng thái kết nối và tiến trình đồng bộ.
- **Vận hành:** xem/làm mới trạng thái, kết nối lại bằng cấu hình đã duyệt, xem
  tiến trình và bắt đầu một lần đồng bộ lịch sử mới.

Quy trình cấu hình dành cho Quản trị viên:

1. Nhập địa chỉ máy chủ đã được người phụ trách cung cấp.
2. Chọn **Kiểm tra kết nối**.
3. Chỉ lưu khi kết quả đúng máy chủ dự kiến.
4. Gửi yêu cầu đăng ký và chờ phía máy chủ duyệt.
5. Chọn làm mới trạng thái đăng ký.
6. Sau khi được duyệt, chọn **Kết nối server**.

Quy trình thông thường dành cho Vận hành:

1. Chọn **Làm mới** để đọc trạng thái mới nhất.
2. Nếu cấu hình đã lưu và đăng ký đã được duyệt nhưng mất kết nối, chọn **Kết
   nối lại**.
3. Nếu có dữ liệu lịch sử cần đối chiếu, chọn **Đồng bộ lịch sử**.
4. Theo dõi tiến trình; việc rời màn hình không dừng tác vụ đang chạy.

Không thay đổi loại máy hoặc nhận dạng máy. Không đặt lại cấu hình chỉ để xử lý
một lỗi mạng tạm thời. Dữ liệu sản xuất được lưu cục bộ trước; mất mạng không
xóa kết quả và dữ liệu chờ sẽ tiếp tục được gửi khi kết nối phục hồi.

#### 13.4. Vận hành

Tab Vận hành hiển thị cho Quản trị viên và Kỹ sư, nhưng nội dung có thể khác nhau.

Các nhóm cài đặt:

- chính sách lưu kết quả: tất cả, chỉ OK, chỉ NG hoặc không lưu ảnh;
- thư mục lưu kết quả và cách tổ chức phiên;
- hiển thị nội dung NG;
- tự tạm dừng khi không có thao tác;
- độ trễ khi dừng máy;
- lưu ảnh huấn luyện theo tất cả, OK hoặc NG và thư mục tương ứng.

Kỹ sư mặc định chỉ quản lý phần lưu kết quả Line. Quản trị viên quản lý thêm
hiển thị NG, tạm dừng do không hoạt động, độ trễ dừng và ảnh huấn luyện.

Trước khi lưu, kiểm tra thư mục tồn tại, đủ dung lượng và được nhà máy cho phép.
Kết quả chưa xác định không được đưa vào chính sách ảnh huấn luyện.

#### 13.5. Cập nhật

Tab này dành cho Quản trị viên và hiển thị phiên bản hiện tại, phiên bản mới cùng
nội dung thay đổi khi có.

Cách sử dụng:

1. Dừng sản xuất và bảo đảm máy có nguồn điện, mạng ổn định.
2. Chọn **Kiểm tra cập nhật**.
3. Đọc nội dung thay đổi.
4. Xác nhận tải xuống.
5. Sau khi tải hoàn tất, xác nhận cài đặt trong một bước riêng.
6. Không tắt máy trong quá trình áp dụng và khởi động lại.
7. Sau cập nhật, kiểm tra đăng nhập, sản phẩm, camera, PLC và Dongil Server trước
   khi đưa máy trở lại sản xuất.

## Gỡ cài đặt và cài đặt lại

Mặc định trình gỡ cài đặt chỉ gỡ ứng dụng và giữ lại dữ liệu, cấu hình, nhật ký,
bản sao lưu cùng các thành phần dùng chung để hỗ trợ cài đặt lại hoặc cập nhật.

Chỉ chọn xóa thêm dữ liệu hoặc thành phần hệ thống khi:

- đã có bản sao lưu phù hợp;
- hiểu rõ dữ liệu sẽ bị xóa;
- được người phụ trách hệ thống phê duyệt.

Khi cài lại, ưu tiên sử dụng lại dữ liệu hiện có nếu đó là dữ liệu đúng của máy.
Không chọn thay thế cơ sở dữ liệu chỉ để xử lý một lỗi khởi động thông thường.

## Xử lý sự cố cơ bản

| Hiện tượng | Cách xử lý an toàn |
| --- | --- |
| Kiểm tra khởi động báo dịch vụ nội bộ chưa sẵn sàng | Chờ một lúc rồi chọn **Kiểm tra lại**. Nếu vẫn lỗi, đóng ứng dụng, mở lại bằng Administrator và ghi nhận thời điểm xảy ra lỗi. |
| Không thể đăng nhập | Kiểm tra trạng thái khởi động, dongle, tên đăng nhập và trạng thái tài khoản. Không thử nhiều mật khẩu không chắc chắn. |
| Không tự đăng nhập lại | Đăng nhập thủ công và chọn lại **Ghi nhớ đăng nhập**. Kiểm tra xem người dùng vừa đăng xuất, đăng nhập không chọn ghi nhớ hoặc tài khoản vừa bị thay đổi hay không. |
| PLC báo lỗi | Dừng chế độ tự động, kiểm tra nguồn và mạng thiết bị, sau đó dùng kết nối lại hoặc liên hệ Kỹ sư phụ trách. |
| Camera không sẵn sàng | Kiểm tra nguồn, cáp mạng và trạng thái camera; làm mới thiết bị hoặc đồng bộ camera nếu tài khoản có quyền. |
| Số camera khả dụng không đúng | Mở **Định danh camera**, chọn **Đồng bộ camera**, rồi đối chiếu serial, trạng thái phát hiện và trạng thái bật của từng camera. |
| Không kết nối được Dongil Server | Kiểm tra mạng nội bộ, chọn **Làm mới** rồi **Kết nối lại** bằng cấu hình đã lưu. Không tự nhập địa chỉ khác và không đặt lại cấu hình khi chưa được phép. |
| Dữ liệu chưa đồng bộ | Xác nhận máy chủ đã kết nối, xem số dữ liệu chờ và tiến trình lịch sử. Bắt đầu đồng bộ mới nếu tài khoản có quyền; không xóa dữ liệu cục bộ. |
| Cập nhật hoặc cài đặt thất bại | Không xóa dữ liệu hoặc cài lặp lại nhiều lần. Ghi nhận thông báo lỗi và liên hệ hỗ trợ. |

## Thông tin cần gửi khi yêu cầu hỗ trợ

Cung cấp các thông tin sau cho bộ phận hỗ trợ được ủy quyền:

- phiên bản phần mềm;
- tên máy hoặc vị trí máy;
- thời điểm xảy ra lỗi;
- tài khoản thuộc vai trò nào, không gửi mật khẩu;
- thao tác ngay trước khi lỗi xuất hiện;
- ảnh chụp thông báo lỗi;
- mã sản phẩm, phiên hoặc serial camera liên quan;
- nhật ký được xuất bằng chức năng hỗ trợ của ứng dụng, nếu có.

Không gửi mật khẩu, thông tin đăng nhập, khóa truy cập, dữ liệu bí mật hoặc thông
tin kết nối nhạy cảm qua kênh không được phê duyệt.

## Nguyên tắc an toàn

- Chỉ sử dụng tài khoản cá nhân được cấp.
- Không chia sẻ tài khoản hoặc mật khẩu.
- Không chỉnh sửa tệp cài đặt hoặc cấu hình hệ thống bằng tay.
- Không tắt nguồn khi đang lưu dữ liệu, đồng bộ hoặc cập nhật.
- Luôn xác nhận sản phẩm và trạng thái thiết bị trước khi chạy tự động.
- Không thử PLC, thay đổi camera hoặc ROI trong khi Line đang sản xuất.
- Khi nghi ngờ kết quả sai, dừng máy và báo người phụ trách thay vì tiếp tục sản
  xuất.

## Bản quyền và phạm vi sử dụng

Phần mềm, mô hình nhận dạng, cấu hình máy và dữ liệu liên quan là tài sản nội bộ
hoặc tài sản được cấp quyền sử dụng. Không được sao chép, phân phối, phân tích
hoặc sử dụng ngoài phạm vi đã được phê duyệt.
