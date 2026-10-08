# Kế hoạch vòng đời phiên cục bộ và bảo vệ runtime OCR

Status: **Approved — Phases 0-6 source and isolated verification complete; packaged acceptance pending**
Approved date: **2026-10-06**
Source baseline: **v1.4.0**, branch **remote**

## 1. Mục tiêu

Làm cho phiên đăng nhập của ứng dụng OCR có thể bị thu hồi thực sự khi logout
hoặc tài khoản thay đổi trạng thái, đồng thời thu hẹp bề mặt truy cập cục bộ của
Electron/NestJS mà không thay đổi flow Dongil đang ổn định.

Kết quả đích:

- access JWT chỉ hợp lệ khi phiên cục bộ tương ứng còn hiệu lực;
- logout thu hồi cả phiên hiện tại và remembered login theo đúng thứ tự;
- đổi role, vô hiệu hóa hoặc xóa tài khoản làm mất hiệu lực phiên liên quan;
- camera WebSocket không chấp nhận phiên đã bị thu hồi;
- backend OCR chỉ lắng nghe trên loopback sau khi xác minh không có consumer LAN;
- Electron chỉ mở URL ngoài nằm trong policy được duyệt;
- các thay đổi quan trọng có audit nhưng không ghi secret.

## 2. Ranh giới bắt buộc

### 2.1. Được phép thay đổi

- Backend NestJS cục bộ trong repository OCR này.
- Prisma schema/migration của PostgreSQL cục bộ `ocrahso`.
- Electron main/preload/service manager của ứng dụng OCR.
- Frontend OCR và tài liệu dự án khi cần để hoàn thiện flow cục bộ.

### 2.2. Không được thay đổi

- Không sửa repository, source, API, WebSocket, database schema hoặc business
  flow của **Dongil Server**.
- Không thay đổi payload đăng ký, heartbeat, outbox, history sync hoặc washing
  result đang gửi tới Dongil Server.
- Không sửa, format, generate, rename, migrate hoặc xóa bất kỳ nội dung nào
  trong `tool/`.
- Không sửa source/binary license được bảo vệ.
- Không thay đổi ROI; phần này đang ổn định và được hoãn riêng.
- Không commit, push, tag hoặc publish tự động.

### 2.3. Bị loại khỏi kế hoạch hiện tại

- Chính sách khóa tài khoản sau số lần đăng nhập sai.
- Chính sách rate limiting cho login.
- MFA, refresh-token architecture và inactivity timeout.
- Thay đổi Device Tool binding hoặc thêm JWT vào Device Tool.
- Build installer và packaged-machine acceptance trước pha nghiệm thu cuối.

Việc không triển khai lockout/rate limiting là quyết định phạm vi hiện tại,
không được tự động thay bằng một ngưỡng khác.

## 3. Hiện trạng đã xác minh

- `AuthService` phát JWT chỉ chứa `sub`, `username`, `role`.
- `JwtAuthGuard` chỉ kiểm tra chữ ký; chưa có bản ghi phiên phía server.
- Logout hiện thu hồi remembered login rồi xóa renderer session; access JWT cũ
  vẫn có thể dùng nếu còn biết token.
- Remembered restore phát JWT mới nhưng không tạo session có thể thu hồi.
- Camera WebSocket chỉ kiểm tra chữ ký JWT tại upgrade.
- Role change, account deactivation và deletion đã xử lý remembered login nhưng
  chưa xử lý access session.
- Backend OCR gọi Dongil Server qua client riêng; thay đổi phiên local không cần
  và không được làm thay đổi Dongil contract.

## 4. Thiết kế được duyệt

### 4.1. Bảng `AuthSession`

Migration additive tạo bảng cục bộ:

| Cột | Kiểu | Null | Ý nghĩa |
| --- | --- | --- | --- |
| `id` | `String`/text | Không | Primary key và `sid` trong JWT |
| `userId` | `String` | Không | FK tới `User.id`, cascade khi xóa user |
| `createdAt` | `DateTime` | Không | Thời điểm tạo phiên |
| `revokedAt` | `DateTime` | Có | Thời điểm thu hồi |
| `revokeReason` | `String` | Có | Mã lý do không chứa dữ liệu nhạy cảm |

Ràng buộc/index:

- primary key: `id`;
- foreign key: `userId -> User.id`, `ON DELETE CASCADE`;
- index: `(userId, revokedAt)` để kiểm tra/thu hồi phiên theo user;
- không có password, JWT, remember token hoặc machine credential trong bảng.

Không thêm `lastSeenAt` ở pha này để tránh ghi database trên mỗi request. Phiên
không có inactivity timeout; nó tồn tại đến khi logout, bị thu hồi, user không
còn hợp lệ hoặc bản ghi bị xóa.

### 4.2. Phát và xác minh JWT

- Password login và remembered restore tạo `AuthSession` cục bộ trước khi trả
  access JWT.
- JWT thêm claim `sid`; remembered token tiếp tục là credential độc lập.
- `JwtAuthGuard` xác minh chữ ký, yêu cầu `sid`, đọc session/user hiện tại từ DB,
  từ chối session bị thu hồi và gắn role hiện tại vào request.
- JWT legacy không có `sid` sẽ không còn hợp lệ sau khi nâng cấp. Người dùng có
  remembered login hợp lệ được restore; người còn lại đăng nhập thủ công lại.
- Không thêm `exp` hoặc refresh token trong phạm vi này.

### 4.3. Logout

Tách hai ý nghĩa đang dùng chung:

1. `disable remembered login` dùng khi login thành công nhưng người dùng không
   tích Ghi nhớ đăng nhập; thao tác này **không** thu hồi session vừa tạo.
2. `logout` là endpoint/IPC riêng, thu hồi session hiện tại và remembered login
   trong một transaction cục bộ.

Sau khi backend xác nhận logout:

- Electron mới xóa encrypted remember file;
- renderer mới xóa application-owned session storage;
- điều hướng về `/login`.

Nếu server-side logout lỗi, UI giữ phiên hiện tại và báo lỗi; không giả vờ logout
thành công.

### 4.4. Thu hồi theo trạng thái tài khoản

Trong cùng transaction với mutation khi thực tế phù hợp:

- đổi role: thu hồi mọi `AuthSession` và remembered login của user;
- active chuyển `true -> false`: thu hồi mọi session và remembered login;
- xóa user: FK cascade xóa session; audit ghi trước/sau phù hợp với transaction;
- password reset tương lai phải gọi cùng cơ chế nhưng không tạo endpoint reset
  ngoài phạm vi hiện tại.

### 4.5. Camera WebSocket

- Upgrade phải kiểm tra chữ ký JWT và `AuthSession` còn hiệu lực.
- Socket đã mở phải được kiểm tra lại theo chu kỳ hữu hạn để phiên bị thu hồi
  không giữ stream vô thời hạn.
- Không thay đổi URL/path hoặc contract giữa backend OCR và Device Tool.

### 4.6. Runtime boundary

- Trước khi bind loopback, tìm toàn bộ consumer backend và xác nhận đều dùng
  `127.0.0.1`/localhost.
- Sau xác minh, NestJS bind rõ `127.0.0.1` thay vì mọi network interface.
- `setWindowOpenHandler` chỉ cho phép scheme/host thực sự được ứng dụng sử dụng;
  URL khác bị từ chối và ghi log đã sanitize.
- IPC tiếp tục xác minh sender và validate payload.
- Device Tool vẫn read-only; deployment phải xử lý exposure của Tool bằng
  firewall/network policy hoặc một task Tool-side riêng.

## 5. API và contract cục bộ

- Thêm endpoint logout cục bộ có bearer JWT và desktop internal token.
- Giữ endpoint disable remembered login hiện tại cho lựa chọn login không nhớ.
- Response logout chỉ báo trạng thái thu hồi/cleanup; không trả token hoặc secret.
- Không thay đổi bất kỳ Dongil Server endpoint hoặc payload nào.

## 6. Audit và log

Audit tối thiểu:

- `auth.session.create` với source `password` hoặc `remembered-login`;
- `auth.session.logout`;
- `auth.session.revoke-role-change`;
- `auth.session.revoke-account-state`.

Audit/log không chứa access JWT, raw remembered token, password, dongle secret,
database credential hoặc Dongil machine credential.

## 7. Migration và rollback

### Migration

- Migration chỉ thêm `AuthSession`, FK và index.
- Không cập nhật/xóa user, remembered login, Dongil config, outbox hoặc history.
- Existing JWT không có `sid` bị vô hiệu hóa theo thiết kế sau nâng cấp.

### Rollback

- Trước packaged migration phải có database backup theo release flow hiện tại.
- Source rollback phải khôi phục đồng bộ schema/client/backend/frontend/Electron.
- Nếu chỉ rollback binary về bản không dùng `AuthSession`, bảng dư không ảnh
  hưởng flow cũ nhưng vẫn phải theo compatibility policy và backup đã duyệt.
- Không rollback bằng cách sửa hoặc reset dữ liệu Dongil Server.

## 8. Các pha thực hiện

| Phase | Nội dung | Trạng thái |
| --- | --- | --- |
| 0 | Discovery, plan, ADR và scope boundary | Done |
| 1 | Additive `AuthSession` migration và local session service | Done — schema/client and isolated migration verified |
| 2 | JWT issuance/guard và camera WebSocket validation | Done — targeted unit/integration checks passed; packaged runtime pending |
| 3 | Logout IPC/API và account-state revocation hooks | Done — targeted unit/integration checks passed; packaged runtime pending |
| 4 | Loopback bind, external URL allowlist và IPC review | Done — targeted static checks and source runtime loopback check passed |
| 5 | Audit/docs/error handling | Done — targeted checks and isolated DB audit verification passed |
| 6 | Approved source verification | Done — static, isolated DB and source backend runtime checks passed |
| 7 | Packaged build và target-machine acceptance | Deferred until all functions complete |

Mỗi phase phải được điều tra lại trước khi sửa. Nếu phát hiện cần thay đổi
Dongil Server, Device Tool, license, ROI, business contract hoặc migration theo
hướng khác plan này thì dừng và báo lại; không tự mở rộng phạm vi.

### 8.1. Bằng chứng Phase 6 ngày 2026-10-07

- Baseline được kiểm tra tại commit `149b944` (`Feat: Fixing Remembered Login`).
- `prisma validate` đạt và Prisma Client 6.19.3 được generate thành công. Prisma
  chỉ cảnh báo cấu hình `package.json#prisma` sẽ deprecated ở Prisma 7; dự án
  hiện vẫn dùng Prisma 6 nên chưa thay đổi cấu hình ngoài phạm vi.
- Backend, Electron và frontend typecheck đều đạt.
- Bảy targeted auth/session/camera test suites đạt `24/24` tests sau khi bổ sung
  coverage cho tạo/thu hồi session, guard từ chối session revoked, remembered
  logout transaction và Camera WebSocket session authorization.
- Một targeted regression set rộng hơn đạt `40/40` tests cho auth, users,
  inspections, products và PLC controller fixtures.
- Non-fixing ESLint đạt trên các file backend/Electron/frontend thuộc phạm vi.
- `git diff --check` đạt; không có diff trong `tool/`, protected license hoặc
  `backend/src/dongil-sync/`.
- Migration `AuthSession` được apply cùng đủ `49/49` migrations lên DB PostgreSQL
  18 cô lập `ocrahso_codex_phase9b_authsession_20261007`; lần deploy thứ hai xác
  nhận không còn migration chờ.
- Guarded DB integration đạt `7/7` tests cho cấu trúc bảng/index/FK cascade,
  password và remembered-login JWT có `sid`, logout làm JWT cũ bị từ chối,
  role/deactivation revoke session, user delete cascade và audit không chứa
  password/access token/raw remember token.
- Backend source runtime chạy với DB test trả health `ok` và chỉ listen tại
  `127.0.0.1:3981`; process do agent tạo đã dừng và port đã được giải phóng.
- Bằng chứng cuối DB test: 49 migration hoàn tất, 0 failed, 0 test user,
  0 `AuthSession`, 0 `RememberedLogin`; DB test sau đó đã được xóa.
- Không migrate hoặc ghi vào DB workstation `ocrahso`; không seed, không chạy
  Electron/camera/PLC, chưa build và chưa kiểm tra packaged installer.

## 9. Rủi ro và giảm thiểu

| Rủi ro | Mức độ | Giảm thiểu |
| --- | --- | --- |
| JWT cũ mất hiệu lực sau nâng cấp | Medium | Remembered restore phát session mới; còn lại login lại một lần |
| Circular dependency giữa auth/users modules | Medium | Giữ session primitive ở module cục bộ có dependency một chiều; rà toàn bộ consumers trước sửa |
| Logout vô tình thu hồi session khi login không nhớ | High | Tách endpoint disable-remember và logout; test riêng hai flow |
| WebSocket tiếp tục sau revoke | Medium | Validate tại upgrade và kiểm tra lại theo chu kỳ |
| Loopback bind làm hỏng consumer LAN chưa biết | High | Search và xác minh consumer trước khi đổi host |
| Ảnh hưởng Dongil flow đang ổn | High | Không sửa Dongil client/contract; diff gate cho các file Dongil và repo server |

## 10. Definition of Done

- Mọi JWT mới có `sid` và chỉ hoạt động khi session local còn hiệu lực.
- Logout thu hồi session + remembered login đúng thứ tự và không ảnh hưởng flow
  login không nhớ.
- Role change/deactivation/delete xử lý session đúng transaction policy.
- Camera WebSocket từ chối session invalid/revoked.
- Backend OCR chỉ bind loopback sau khi consumer audit đạt.
- Electron không mở URL ngoài policy.
- Audit/log không lộ secret.
- Không có thay đổi trong `tool/`, protected license, ROI hoặc Dongil Server.
- Dongil registration, auto-connect, heartbeat, outbox và history contract giữ nguyên.
- Tài liệu và ADR đồng bộ với implementation thực tế.
- Chỉ ghi "verified" cho các check thật sự được người dùng cho phép và đã chạy.
