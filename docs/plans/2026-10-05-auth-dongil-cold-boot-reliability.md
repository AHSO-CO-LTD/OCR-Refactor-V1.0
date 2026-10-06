# Kế hoạch ổn định cold boot, đăng nhập ghi nhớ và kết nối Dongil

Status: **Approved — source implementation and manual source pilot accepted; packaged pilot pending**
Plan version: **3**
Approved date: **2026-10-05**  
Execution rule updated: **2026-10-06**
Source baseline: **v1.4.0**, branch **remote**

## 1. Mục tiêu

Khắc phục đồng bộ các lỗi chỉ xuất hiện rõ sau khi tắt máy hoàn toàn, các lỗi
cấu hình và kết nối Dongil không nhất quán, hiện tượng nhận sai loại máy, và
việc không thể tự đăng nhập lại bằng tài khoản đã chọn **Ghi nhớ đăng nhập**.

Kết quả đích:

- OCR client luôn dùng loại máy cố định `WASHING_MACHINE`.
- PostgreSQL là nguồn cấu hình vận hành duy nhất của Dongil Server URL.
- File `.env` không thể làm ghép biến khi dùng CR-only và không còn quyền ghi
  đè loại máy hoặc Dongil URL trong runtime mới.
- Mọi role `dev`, `admin`, `engineer`, `operator` đều có thể dùng Ghi nhớ đăng
  nhập.
- Remembered login không lưu password hoặc access JWT dài hạn.
- Operator được xem, làm mới, kết nối lại và bắt đầu đồng bộ lịch sử nhưng
  không được thay đổi cấu hình hoặc quản trị vòng đời job đồng bộ.
- Cold boot, mất mạng tạm thời hoặc backend khởi động chậm không được tự động
  xóa remembered login hay cấu hình Dongil hợp lệ.
- Mọi migration và cập nhật đều có đường rollback cụ thể.

## 2. Phạm vi đã duyệt

### 2.1. Bắt buộc thực hiện

1. Làm cứng parser, loader và writer của runtime `.env`.
2. Sửa thứ tự nạp runtime config trước khi tính port/origin.
3. Cố định machine type của OCR client thành `WASHING_MACHINE`.
4. Chuyển Dongil Server URL sang PostgreSQL làm nguồn vận hành duy nhất.
5. Chặn kết nối khi loại máy local và loại máy Dongil Server gán không khớp.
6. Phân loại rõ lỗi kết nối, đăng ký, credential, WebSocket và gửi kết quả.
7. Thêm quyền Dongil hẹp cho operator.
8. Thêm remembered login an toàn cho mọi role.
9. Thu hồi remembered login khi tài khoản đổi role, bị vô hiệu hóa, bị xóa
   hoặc reset password.
10. Ngăn các lần kiểm tra dongle chạy chồng nhau.
11. Bổ sung audit, structured logs, UI error state và tài liệu liên quan.
12. Thực hiện pilot theo thứ tự một máy trước, sau đó mới mở rộng.

### 2.2. Ranh giới không được thay đổi

- Không sửa, format, generate, rename, migrate hoặc xóa nội dung trong `tool/`.
- Không sửa code/binary license gốc, gồm `external/license-key/`,
  `backend/native/System8.dll`, native dongle helper và
  `backend/scripts/check-dongle.py`.
- Không thay đổi hợp đồng camera, OCR, Modbus TCP hoặc SLMP của Device Tool.
- Không xóa inspection history, Dongil outbox hoặc dữ liệu đồng bộ đã xác nhận.
- Không tự động thay đổi machine type assignment trên Dongil Server.
- Không commit, push, tag hoặc publish tự động.
- Không chạy migration, seed, test, lint, typecheck, build, Electron, installer
  hoặc hardware verification nếu chưa có yêu cầu xác minh rõ ràng.

### 2.3. Ngoài phạm vi

- Thiết kế lại toàn bộ JWT/session architecture.
- Bổ sung MFA.
- Chuyển Dongil factory LAN từ HTTP sang HTTPS.
- Sửa Device Tool binding hoặc thêm JWT cho Device Tool.
- Refactor toàn bộ các file Electron/backend/frontend lớn.
- Thay đổi business payload của kết quả máy rửa.
- Thay đổi kiến trúc durable outbox và historical reconciliation đã được ADR
  0005 chấp nhận.

### 2.4. Quy tắc thực thi thích ứng

Trước khi sửa source của mỗi phase phải thực hiện một feasibility gate riêng:

1. Đọc lại mục tiêu và exit gate của phase.
2. Kiểm tra source hiện tại và mọi consumer trực tiếp.
3. Kiểm tra schema, migration history và dữ liệu tương thích nếu phase chạm DB.
4. Kiểm tra Accepted ADR và project constraints liên quan.
5. Xác định regression risk, security impact và rollback thực tế.
6. Kiểm tra xem giả định trong plan còn đúng với source tại thời điểm thực thi.
7. Điều chỉnh chi tiết implementation khi cần để đạt mục tiêu an toàn hơn,
   không bám máy móc vào một cách triển khai đã lỗi thời.
8. Nếu điều chỉnh làm thay đổi architecture, business rule, permission,
   database contract, API contract hoặc rollback đã duyệt thì dừng phase, cập
   nhật plan và xin duyệt lại trước khi sửa source.

Mỗi phase phải ghi rõ một trong ba kết quả gate:

- `Feasible`: có thể triển khai theo hướng hiện tại;
- `Feasible with adjustment`: mục tiêu giữ nguyên nhưng chi tiết cần điều chỉnh;
- `Blocked`: chưa thể triển khai an toàn nếu thiếu quyết định hoặc điều kiện.

## 3. Quyết định nghiệp vụ đã chốt

### 3.1. Remembered login

- Tất cả role đều được dùng Ghi nhớ đăng nhập.
- Không lưu password dưới bất kỳ dạng nào.
- Không dùng access JWT hiện tại làm credential ghi nhớ dài hạn.
- Electron giữ remember token gốc bằng Windows `safeStorage`.
- PostgreSQL chỉ giữ hash của remember token cùng định danh user và máy.
- Khôi phục đăng nhập bắt buộc có dongle thật trả về `DONGLE_OK`.
- Mock dongle không được khôi phục remembered login.
- App restart, Windows restart và cold boot không xóa remembered login.
- Lỗi mạng, timeout, backend chưa sẵn sàng hoặc dongle checker lỗi tạm thời
  không xóa remembered login.
- Logout rõ ràng sẽ thu hồi remembered login.
- Đăng nhập thành công nhưng không tích Ghi nhớ đăng nhập sẽ thu hồi bản ghi cũ.
- Đổi role sẽ thu hồi remembered login, kể cả khi role mới cũng được phép sử
  dụng tính năng. Người dùng phải đăng nhập thủ công và tích lại một lần.
- Disable, delete hoặc reset password sẽ thu hồi remembered login.
- Permission hiện tại luôn được đọc lại từ PostgreSQL khi khôi phục; không lưu
  snapshot permission trong remember record.

### 3.2. Operator và Dongil

Operator được phép:

- xem trạng thái kết nối;
- làm mới trạng thái;
- kết nối lại bằng cấu hình đã được admin/dev lưu;
- cập nhật trạng thái đăng ký ngay;
- xem tiến độ đồng bộ lịch sử;
- bắt đầu một lần đồng bộ lịch sử mới khi đủ điều kiện.

Operator không được phép:

- nhập, sửa hoặc lưu IP Dongil Server;
- test một IP tùy ý;
- gửi yêu cầu đăng ký máy;
- ngắt kết nối có chủ đích;
- reset cấu hình;
- thay đổi machine type;
- xem hoặc thay đổi machine credential;
- pause, resume, cancel hoặc retry-failures của history sync.

Trong kế hoạch này, cụm từ **làm mới kết quả** được chuẩn hóa thành **Cập nhật
trạng thái đăng ký ngay**. Đây là thao tác khác với đồng bộ lịch sử kết quả.

### 3.3. Machine type

- Ứng dụng này là OCR Metal Core Washing client nên local machine type luôn là
  `WASHING_MACHINE`.
- Dongil Server core vẫn tiếp tục hỗ trợ nhiều loại máy; không hardcode server.
- `DONGIL_MACHINE_TYPE_CODE` trở thành legacy key và bị app mới bỏ qua.
- Nếu server assignment không phải `WASHING_MACHINE`, app chặn kết nối và yêu
  cầu admin/dev xử lý assignment trên server.

## 4. Bằng chứng và hiện trạng

### 4.1. Lỗi `.env` CR-only đã xảy ra

Một máy từng đọc giá trị:

```text
WASHING_MACHINE DONGLE_CHECK_TIMEOUT_MS=7000
```

Parser hiện tại dùng `content.split(/\r?\n/)`, chỉ hỗ trợ CRLF và LF. File dùng
CR-only làm hai biến bị ghép thành một chuỗi, dù trình soạn thảo vẫn có thể
hiển thị chúng thành hai dòng.

### 4.2. Split-brain giữa UI và Electron

Ảnh máy 1 và máy 2 hiển thị IP `192.168.3.79`, trạng thái đăng ký APPROVED,
nhưng Connect trả lỗi yêu cầu lưu IP trước. Điều này phù hợp với trạng thái:

- frontend/backend đọc `DongilSyncConfiguration.serverUrl` từ PostgreSQL;
- Electron Connect đọc `process.env.DONGIL_SERVER_URL`;
- hai nguồn có giá trị khác nhau.

### 4.3. UI che giấu local machine type lỗi

Panel ưu tiên hiển thị `assignedMachineTypeCode` từ server. Local request vẫn
có thể gửi `machineTypeCode` bị lỗi từ env nên màn hình hiển thị đúng không có
nghĩa payload local đúng.

### 4.4. Type mismatch hiện đang fail-open

Backend hiện chỉ log warning khi assigned type khác local type, sau đó vẫn bật
auto-connect và trả READY. Hành vi đích phải là fail-closed.

### 4.5. Test connection chưa kiểm tra đủ

Test hiện tại chỉ gọi `/api/v1/health`, không xác minh registration, credential,
machine type, WebSocket hoặc washing-result endpoint.

### 4.6. Remembered session hiện phụ thuộc origin

Frontend hiện lưu access JWT trong browser storage. Nếu frontend fallback sang
port khác, Windows profile khác hoặc session bị `clearSession()` sau một lỗi
tạm thời, app sẽ vào thẳng form đăng nhập.

### 4.7. Dongle checks có khả năng chồng lấn

Startup, login, restore, app shell và watchdog đều có thể yêu cầu kiểm tra
dongle. Chu kỳ watchdog ngắn hơn timeout native checker nên cold boot có thể
tạo nhiều lần kiểm tra đồng thời.

## 5. Danh mục vấn đề cần giải quyết

| ID | Mức độ | Vấn đề | Kết quả cần đạt |
| --- | --- | --- | --- |
| ENV-01 | Critical | Parser không hỗ trợ CR-only | Hỗ trợ CRLF, LF, CR và BOM |
| ENV-02 | High | Key rỗng chặn nguồn hợp lệ phía sau | Validate trước khi chọn nguồn |
| ENV-03 | High | Duplicate key được đọc/ghi không nhất quán | Phát hiện và normalize toàn file |
| ENV-04 | High | Port/origin có thể được tính trước khi load env | Bootstrap config trước khi khởi tạo service manager |
| ENV-05 | High | Ghi env và DB có thể thành công một phần | DB là authority của Dongil config |
| ENV-06 | Medium | Installer giữ giá trị malformed | Validate, backup và normalize |
| ENV-07 | High | Atomic replace có thể làm drift ACL | Reapply và verify ACL |
| DGL-01 | Critical | UI có IP nhưng Electron coi là chưa lưu | Chỉ đọc URL từ DB |
| DGL-02 | Critical | Env có thể làm sai machine type | Fixed shared constant |
| DGL-03 | High | Type mismatch vẫn READY | Chặn trước socket/outbox |
| DGL-04 | Medium | Client bỏ qua một số server update | Xử lý heartbeat/registration update |
| DGL-05 | Medium | Health test quá nông | Diagnostic stages riêng |
| DGL-06 | High | Permanent HTTP 400 vẫn retry | Phân loại transient/permanent |
| DGL-07 | Medium | Credential failure thiếu lý do | Error code rõ, không lộ secret |
| AUTH-01 | High | Remember login phụ thuộc localStorage origin | Token split giữa safeStorage và DB hash |
| AUTH-02 | Critical | Lỗi tạm thời có thể xóa session ghi nhớ | Chỉ thu hồi theo rule rõ ràng |
| AUTH-03 | High | Dongle check chạy chồng | Single-flight coordinator |
| AUTH-04 | High | Access JWT được giữ dài hạn | Chỉ giữ JWT cho phiên đang chạy |
| AUTH-05 | High | Chưa có machine binding | Bắt buộc đúng machine ID |
| AUTH-06 | High | Đổi role có thể giữ phiên ghi nhớ cũ | Thu hồi khi role đổi |
| PERM-01 | High | Operator bị chặn reconnect | Permission vận hành riêng |
| PERM-02 | High | `history-sync.manage` quá rộng | Permission `history-sync.start` riêng |

## 6. Kiến trúc đích

### 6.1. Ownership dữ liệu

| Dữ liệu | Authority sau sửa | Không còn là authority |
| --- | --- | --- |
| Dongil Server URL | PostgreSQL `DongilSyncConfiguration` | `.env`, `process.env`, renderer state |
| Local machine type | Shared constant `WASHING_MACHINE` | `.env`, UI input, request payload tùy ý |
| Machine identity | Existing Electron/license integration | Renderer-provided string |
| Assigned machine type | Dongil Server, cache trong PostgreSQL | Local env |
| Registration state | PostgreSQL, cập nhật từ Dongil Server | UI cache |
| Machine credential | Electron Windows `safeStorage` | PostgreSQL, renderer, logs |
| Remember token gốc | Electron Windows `safeStorage` | PostgreSQL, localStorage, sessionStorage |
| Remember token hash | PostgreSQL | Renderer |
| Access JWT | Memory hoặc session storage của phiên hiện tại | Durable DB/browser storage |
| Runtime socket state | Backend memory và status endpoint | Durable config fields |

### 6.2. Luồng remembered login

```text
Electron startup preflight
-> derive current machine identity from a real dongle result
-> read encrypted remember token through Windows safeStorage
-> call local internal restore endpoint with x-desktop-internal-token
-> backend performs a coordinated physical dongle check
-> hash the presented remember token
-> match token hash, machine ID and active user in PostgreSQL
-> reject and revoke if the account role changed since enablement
-> load the user's current role and current effective permissions
-> issue a fresh access JWT for this runtime session
-> renderer enters the normal role-specific workspace
```

Nếu không có remember token hoặc DB record, startup trả về trạng thái
`NO_REMEMBERED_LOGIN` và mở form đăng nhập ngay, không toast và không hiển thị
một bước khôi phục giả.

### 6.3. Luồng Dongil connect/reconnect

```text
Renderer action
-> typed preload IPC
-> Electron validates sender
-> Electron forwards bearer JWT and x-desktop-internal-token
-> backend reloads active user and effective permission
-> backend reads DB-authoritative Dongil configuration
-> Electron provides the safeStorage machine credential through the restricted path
-> backend verifies fixed local type against server assignment
-> backend opens one Socket.IO connection and resumes eligible outbox work
```

### 6.4. `x-desktop-internal-token`

Đây là token ngẫu nhiên theo từng lần chạy Electron, dùng để xác nhận request
đến internal backend endpoint đến từ desktop process của phiên hiện tại. Nó:

- không phải user JWT;
- không phải remember token;
- không phải machine credential;
- không được persist;
- không được log;
- không thay thế bearer authorization trên thao tác có actor;
- không thay thế kiểm tra dongle hoặc machine identity.

## 7. Thiết kế database

### 7.1. Bảng `RememberedLogin`

Thiết kế đề xuất:

```prisma
model RememberedLogin {
  id             String    @id @default("default")
  userId         String    @unique
  machineId      String    @unique
  tokenHash      String    @unique
  roleCodeAtSave RoleCode
  enabledAt      DateTime  @default(now())
  lastRestoredAt DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  user           User      @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

Quan hệ bổ sung trong `User`:

```prisma
rememberedLogin RememberedLogin?
```

Ràng buộc:

- `id = default` bảo đảm một remembered account trên workstation DB.
- `userId` liên kết user hiện tại và cascade khi xóa user.
- `machineId` ràng buộc remembered credential với máy hiện tại.
- `tokenHash` là SHA-256 của token ngẫu nhiên ít nhất 256 bit; DB không giữ
  token gốc.
- `roleCodeAtSave` chỉ dùng phát hiện đổi role, không dùng cấp quyền.
- `lastRestoredAt` phục vụ diagnostics và audit, không kéo dài một access JWT.
- Bảng không lưu password, password hash phụ, JWT, machine credential hoặc
  dongle secret.

Không dùng soft delete cho record này. Lịch sử thu hồi được giữ trong
`AuditLog`, còn credential hiện tại phải biến mất hoàn toàn khi revoke.

### 7.2. Điều chỉnh `DongilSyncConfiguration`

Thay đổi đề xuất:

- `serverUrl` từ bắt buộc thành nullable để biểu diễn chưa cấu hình.
- thêm `configVersion Int @default(2)`;
- thêm `legacyEnvImportedAt DateTime?`;
- giữ singleton ID `default` sau Reset;
- luôn normalize `machineTypeCode` thành `WASHING_MACHINE`;
- Reset đặt URL, registration, assignment và timestamps liên quan về null,
  tắt auto-connect nhưng không xóa migration marker;
- không thay đổi hoặc xóa Dongil outbox/history rows.

### 7.3. Permission catalog

Thêm ba permission:

| Key | Mục đích |
| --- | --- |
| `dongil.connection.view` | Xem và refresh trạng thái |
| `dongil.connection.operate` | Kết nối lại bằng config đã duyệt |
| `dongil.history-sync.start` | Bắt đầu history sync mới |

Mapping mặc định:

| Role | View | Operate | History view | History start | History manage |
| --- | ---: | ---: | ---: | ---: | ---: |
| dev | Có qua quyền cao nhất | Có | Có | Có | Có |
| admin | Có | Có | Có | Có | Có |
| engineer | Không thay đổi hiện trạng | Không | Có | Không | Không |
| operator | Có | Có | Có | Có | Không |

Seed hiện tại thay thế role-permission mapping khi chạy lại. Migration phải
upsert permission và mapping cần thiết một cách idempotent; rollout không được
chạy seed tùy tiện trên máy đã tùy chỉnh permission.

### 7.4. Audit

Các action mới:

- `auth.remember.enable`
- `auth.remember.disable`
- `auth.remember.restore`
- `auth.remember.reject`
- `auth.remember.revoke-role-change`
- `auth.remember.revoke-account-state`
- `dongil.config.migrate-env`
- `dongil.config.update`
- `dongil.config.reset`
- `dongil.connection.reconnect`
- `dongil.history-sync.start`

Audit không lưu raw token, token hash đầy đủ, JWT, credential, password hoặc
dongle material. Business mutation và audit phải cùng transaction khi cả hai
đều thuộc PostgreSQL.

## 8. Hợp đồng API và IPC dự kiến

### 8.1. Login

`POST /auth/login` nhận thêm cờ boolean rõ ràng:

```json
{
  "username": "operator",
  "password": "user-entered-password",
  "rememberLogin": true
}
```

Quy tắc:

- `rememberLogin=false`: sau khi xác thực password thành công, backend thu hồi
  remembered DB record cũ trước khi trả access JWT.
- `rememberLogin=true`: login thành công nhưng remember credential chỉ được
  kích hoạt sau khi Electron hoàn tất safeStorage flow.
- Password không đi qua Electron logs và không được đưa vào audit details.

### 8.2. Enable remembered login

```text
POST /internal/auth/remembered-login/enable
Authorization: Bearer <current-access-jwt>
x-desktop-internal-token: <runtime-token>
```

Backend:

1. Xác minh JWT và user active.
2. Yêu cầu dongle thật.
3. Lấy machine ID tin cậy từ desktop/license boundary.
4. Tạo token ngẫu nhiên bằng Node crypto.
5. Upsert token hash, user ID, machine ID và role hiện tại.
6. Ghi audit trong cùng transaction.
7. Chỉ trả token gốc cho Electron main process.

Electron:

1. Mã hóa token bằng `safeStorage.encryptString`.
2. Ghi file atomically dưới Electron `userData`.
3. Hạn chế ACL theo Windows user/application context hiện tại.
4. Nếu ghi thất bại, gọi revoke bù trừ. Orphan DB hash không có token gốc không
   thể dùng để restore nhưng vẫn phải được cleanup và log.
5. Renderer chỉ nhận `enabled: true` hoặc error code, không nhận token.

### 8.3. Restore remembered login

```text
POST /internal/auth/remembered-login/restore
x-desktop-internal-token: <runtime-token>
```

Remember token được Electron main gửi trong body nội bộ và không đi qua
renderer. Backend trả access JWT và current user only after all checks pass.

Kết quả chuẩn:

| Code | Ý nghĩa | Có xóa remembered credential không |
| --- | --- | ---: |
| `NO_REMEMBERED_LOGIN` | Không có local token hoặc DB row | Không cần |
| `REMEMBER_TOKEN_INVALID` | Hash không khớp | Có |
| `REMEMBER_MACHINE_MISMATCH` | Sai machine ID | Có |
| `REMEMBER_ROLE_CHANGED` | Role khác lúc enable | Có |
| `REMEMBER_USER_INACTIVE` | User inactive/deleted | Có |
| `REMEMBER_DONGLE_REQUIRED` | Không có dongle thật | Không khi lỗi có thể phục hồi |
| `REMEMBER_BACKEND_UNAVAILABLE` | Backend/startup tạm thời lỗi | Không |
| `REMEMBER_RESTORED` | Thành công, access JWT mới được phát | Không |

### 8.4. Disable remembered login

```text
DELETE /internal/auth/remembered-login
Authorization: Bearer <current-access-jwt>
x-desktop-internal-token: <runtime-token>
```

Thứ tự logout:

1. Backend revoke DB record và ghi audit.
2. Electron xóa local encrypted token.
3. Renderer xóa application-owned current-session state.
4. Điều hướng về `/login`.

Nếu DB revoke thất bại do backend không sẵn sàng, logout không được báo thành
công giả. UI hiển thị lỗi có Retry. Nếu DB đã revoke nhưng xóa file local thất
bại, token còn lại không khớp DB và không thể restore; lỗi cleanup được log.

### 8.5. Dongil internal operations

Các thao tác có actor phải yêu cầu đồng thời bearer JWT và desktop internal
token. Backend là nơi kiểm tra permission cuối cùng.

| Operation | Permission |
| --- | --- |
| Read/refresh connection status | `dongil.connection.view` |
| Refresh registration status | `dongil.connection.view` |
| Reconnect saved configuration | `dongil.connection.operate` |
| Start history sync | `dongil.history-sync.start` |
| View history progress | `dongil.history-sync.view` |
| Pause/resume/cancel/retry | `dongil.history-sync.manage` |
| Save/reset/register/disconnect | Existing admin/dev control plus backend authorization |

## 9. Error model và trạng thái UI

### 9.1. Dongil connection stages

UI phải tách các trạng thái:

1. `NOT_CONFIGURED`
2. `SERVER_UNREACHABLE`
3. `SERVER_HEALTHY`
4. `REGISTRATION_PENDING`
5. `REGISTRATION_REJECTED`
6. `REGISTRATION_APPROVED`
7. `CREDENTIAL_MISSING`
8. `CREDENTIAL_INVALID`
9. `MACHINE_TYPE_MISMATCH`
10. `CONNECTING`
11. `ONLINE`
12. `RETRYING`
13. `DISCONNECTED_BY_ADMIN`
14. `ERROR`

Không dùng một health check thành công để hiển thị máy đã sẵn sàng gửi kết quả.

### 9.2. Diagnostic stages

Nút kiểm tra của admin/dev thực hiện lần lượt:

1. Validate/canonicalize IP và URL.
2. TCP/HTTP reachability.
3. `/api/v1/health` response.
4. Registration lookup nếu đã có machine identity.
5. Credential validation nếu credential tồn tại.
6. Assigned machine type validation.
7. WebSocket handshake/heartbeat khi dùng thao tác Connect.
8. Washing-result capability được xác minh thông qua contract/status phù hợp,
   không tạo production result giả.

### 9.3. Retry classification

- Retry: timeout, connection reset, connection refused, DNS/LAN unavailable và
  server 5xx.
- Pause/recovery required: 401, 403, credential missing hoặc revoked.
- Permanent until config changes: malformed payload, invalid type, unsupported
  endpoint và các lỗi 400 đã phân loại.
- Không chuyển permanent 400 vào vòng retry vô hạn.

### 9.4. Remembered login UI

- Form login hiển thị checkbox cho mọi role.
- Không có remembered credential: mở form ngay, không toast.
- Restore thành công: chuyển thẳng vào workspace theo role hiện tại.
- Dongle/service chưa sẵn sàng: xử lý tại startup preflight với Retry.
- Token invalid, machine mismatch, role changed hoặc account invalid: thu hồi,
  mở form và hiển thị một thông báo ngắn, dịch đầy đủ EN/VI.
- Giao diện không dùng browser `alert`, `confirm` hoặc `prompt`.

## 10. Kế hoạch triển khai theo giai đoạn

### Phase 0 — Khóa kế hoạch và bảo vệ baseline

Status: **Done — documentation and feasibility only**

1. Lưu tài liệu kế hoạch này dưới `docs/plans/`.
2. Ghi nhận branch và worktree dirty trước khi sửa source.
3. Xác định file nào là user-owned changes và không ghi đè.
4. Tạo hai ADR ở trạng thái Proposed:
   - `0007-dongil-database-config-and-fixed-machine-type.md`;
   - `0008-secure-remembered-login.md`.
5. Ghi rõ source-boundary checklist trong plan implementation.

Feasibility result: **Feasible**

- Branch tại thời điểm kiểm tra là `remote` và worktree sạch.
- ADR 0001, 0002, 0005 và 0006 không xung đột với hai quyết định mới.
- Electron hiện đã có Windows `safeStorage`, restricted preload IPC và
  per-process desktop internal token.
- NestJS/Prisma đã là owner của PostgreSQL và permission enforcement.
- Có thể thực hiện mà không sửa `tool/` hoặc protected license artifacts.
- Chi tiết từng phase vẫn phải qua feasibility gate riêng trước khi sửa source.

Exit gate:

- Plan và quyết định nghiệp vụ khớp yêu cầu đã duyệt.
- Không có thay đổi code/runtime trong Phase 0.

### Phase 1 — Env parser và runtime bootstrap

Status: **Source runtime user-accepted — packaged cold boot pending**

Feasibility result: **Feasible with adjustment**

- Chỉ các parser cấu hình `.env` được thay đổi; các regex tách dòng dùng cho
  service logs, Python launcher output và netstat không phải env parser.
- `service-manager` sẽ được dynamic import sau `loadRuntimeEnv`. Cách này sửa
  đúng lỗi module-level port/origin evaluation với thay đổi nhỏ hơn việc chuyển
  toàn bộ port constants thành mutable instance state.
- Không thêm dependency; parser/serializer thuần TypeScript được tách thành
  module và đã có harness kiểm thử độc lập.
- Duplicate key giữ semantics giá trị cuối của parser hiện tại nhưng tạo
  diagnostic theo key. Serializer loại duplicate và normalize CRLF khi được
  công cụ cài đặt/hỗ trợ sử dụng.
- Sau khi Phase 3 chuyển Dongil config sang PostgreSQL, Electron runtime không
  còn use case hợp lệ để ghi `.env`. Helper filesystem writer không có consumer
  đã được loại bỏ thay vì duy trì một đường ghi cấu hình thứ hai; packaged
  legacy env chỉ được backup/checksum và đọc tương thích.
- Việc bỏ authority của hai Dongil env keys vẫn thuộc Phase 2/3, không trộn vào
  Phase 1.
- Test execution, build và runtime verification tiếp tục chờ ủy quyền Phase 9.

1. Tập trung parser env Electron thành một implementation duy nhất.
2. Hỗ trợ UTF-8 BOM, CRLF, LF, CR-only, comment, empty line, dấu `=` trong value
   và file không có newline cuối.
3. Phát hiện duplicate key; key critical bị trùng phải tạo diagnostic rõ ràng.
4. Phân biệt key không tồn tại với key tồn tại nhưng rỗng.
5. Validate port, URL và số timeout trước khi đưa vào runtime config.
6. Không log secret value.
7. Nạp runtime env trước khi khởi tạo các module tính port/origin.
8. Chuyển các constant phụ thuộc env sang bootstrap result hoặc constructor.
9. Serializer đọc-parse-update toàn nội dung và loại duplicate thay vì replace
   dòng đầu tiên.
10. Runtime không ghi Dongil config trở lại env sau khi DB trở thành authority.
11. Backup file packaged legacy trước lần đọc đầu tiên, kèm checksum.
12. Sửa installer bootstrap để validate giá trị preserved.
13. Bổ sung unit fixtures cho CRLF, LF, CR, BOM, duplicate, blank và malformed.

Exit gate:

- Không còn parser runtime env critical dùng regex không hỗ trợ CR-only.
- Save Dongil rồi restart đọc lại cùng giá trị từ PostgreSQL, không từ env.
- ACL không bị mở rộng sau replace.

### Phase 2 — Fixed machine type

Status: **Source fixed type/live assignment user-accepted — packaged verification pending**

Feasibility result: **Feasible with adjustment**

- `shared/` chưa có TypeScript build hoặc contract package. Kích hoạt package
  chỉ để chia sẻ một constant sẽ mở rộng architecture ngoài nhu cầu hiện tại.
- Electron và backend dùng process-local constants cùng giá trị; backend là
  authoritative boundary và chỉ chấp nhận chính xác `WASHING_MACHINE`.
- Dongil Server hiện đã trả `assignedMachineTypeCode` và
  `machineTypeMismatch` trong heartbeat acknowledgement, đồng thời phát
  `server:registration-updated`. Client có thể fail-closed bằng contract hiện
  có, không cần sửa Dongil Server.
- DTO giữ field trong release chuyển tiếp để không phá IPC/API shape, nhưng
  validation và service đều ép đúng fixed value.
- DB normalization được giao bằng migration source; migration chưa được chạy.
- Static source review xác nhận không còn runtime path nào lấy local machine type
  từ `process.env`; key legacy chỉ còn trong parser/installer và fixture chuyển
  đổi. `git diff --check` đã đạt, còn test/typecheck/build/runtime chờ Phase 9.

1. Đặt constant `WASHING_MACHINE` tại module dùng chung phù hợp hiện trạng.
2. Electron registration, bootstrap, hello và heartbeat dùng constant.
3. Backend không tin machine type tùy ý từ renderer.
4. DTO chuyển tiếp chỉ chấp nhận đúng fixed value hoặc loại bỏ field sau khi
   tất cả consumer đã được cập nhật.
5. Normalize DB configuration hiện có thành `WASHING_MACHINE`.
6. App mới bỏ qua `DONGIL_MACHINE_TYPE_CODE`.
7. Installer mới không yêu cầu nhập type cho OCR client.
8. Type mismatch chuyển sang fail-closed.
9. Xử lý heartbeat acknowledgement và registration update có mismatch.
10. UI hiển thị Local type và Server assigned type riêng khi cần chẩn đoán.

Exit gate:

- Không có env/UI request nào đổi được local type.
- Server assignment sai không thể mở socket hoặc gửi outbox.

### Phase 3 — DB-authoritative Dongil configuration

Status: **Workstation schema current and source runtime user-accepted — packaged migration pending**

Feasibility result: **Feasible with sequencing adjustment**

- Singleton row hiện tại không thể tồn tại ở trạng thái chưa cấu hình vì
  `serverUrl`, `machineId` và `licenseStatus` đều bắt buộc. Migration v2 cần
  chuyển ba field này thành nullable, thêm `configVersion` và
  `legacyEnvImportedAt`; dữ liệu hiện hữu vẫn được giữ nguyên.
- Import legacy khả thi trong backend `OnModuleInit` vì backend kế thừa env từ
  Electron. Import chỉ chạy khi DB chưa có URL và marker chưa ghi; URL DB không
  hợp lệ không bị âm thầm ghi đè bằng env.
- Endpoint `configure` hiện còn được lifecycle nội bộ sử dụng nên không thể đổi
  thẳng thành endpoint có JWT. Thêm endpoint settings riêng, yêu cầu đồng thời
  JWT admin/dev và desktop internal token, để save/reset có actor và audit cùng
  transaction; Phase 4 sẽ chuẩn hóa cơ chế trust/permission rộng hơn.
- Electron có thể lấy URL canonical từ status backend cho registration,
  reconnect và lifecycle. `.env` chỉ còn là input import/backup downgrade.
- Prisma migration/source sẽ được tạo nhưng không chạy; Prisma Client chưa được
  generate và các kiểm tra runtime tiếp tục chờ Phase 9.
- Static source review xác nhận Electron chỉ dùng URL từ status DB cho lifecycle,
  registration và connect; `process.env.DONGIL_SERVER_URL` chỉ còn được backend
  đọc một lần để import legacy. Save/reset settings có JWT + internal token,
  actor active admin/dev và audit cùng transaction. `git diff --check` đã đạt.

1. Tạo Prisma migration cho `DongilSyncConfiguration` version 2.
2. Giữ migration additive và bảo toàn row hiện có.
3. Tạo one-time importer:
   - DB URL hợp lệ thắng env;
   - DB chưa có URL và env hợp lệ thì import env;
   - cả hai rỗng thì giữ NOT_CONFIGURED;
   - env malformed thì không import và tạo diagnostic;
   - không log URL có user-info nếu dữ liệu bất thường chứa credential.
4. Ghi `legacyEnvImportedAt` sau khi import thành công.
5. Electron Connect chỉ nhận config từ backend.
6. Admin save gọi backend transaction có audit before/after.
7. Reset giữ singleton/version marker và không xóa outbox/history.
8. Credential chỉ bị xóa khi reset hoặc identity target thực sự thay đổi.
9. Canonicalize URL để credential matching không sai vì trailing slash.
10. Bổ sung config-source diagnostics không chứa secret.
11. Giữ pre-update env backup cho downgrade recovery.

Exit gate:

- UI, Electron và backend luôn báo cùng server URL.
- Không tái hiện lỗi có IP trên UI nhưng Connect báo chưa lưu.

### Phase 4 — Dongil reliability

Status: **Live source Dongil/outbox flow user-accepted — packaged verification pending**

Feasibility result: **Feasible with targeted corrections**

- Backend đã có `bootstrapPromise`, socket identity key và UI in-flight state nên
  nền tảng idempotency/double-click đã tồn tại; không cần thay kiến trúc socket.
- Dongil Server trả assigned type ngay trong `server:accepted`, heartbeat và
  registration update. Client vẫn cần refresh registration/config sau mỗi
  socket accept trước khi chuyển ONLINE và cho outbox tiếp tục.
- `BLOCKED_CONFIG` đã có trong enum nhưng startup hiện đưa nó trở lại PENDING,
  làm permanent error retry lại. Phase này giữ block qua restart; chỉ config
  target thay đổi hoặc credential được xác nhận lại mới mở đúng nhóm row.
- HTTP 401/403, retryable network/408/429/5xx và permanent 4xx cần một classifier
  dùng chung cho live outbox và history sync.
- Dongil API client có thể thêm correlation ID trên từng HTTP request mà không
  thay contract server; log chỉ giữ ID/path/status/code và dữ liệu đã redact.
- Không cần thay Dongil Server hoặc Device Tool.
- Socket chỉ chuyển ONLINE sau khi refresh registration, assigned type và config;
  outbox/history không chạy khi connection chưa ONLINE. Registration update lúc
  runtime cũng đi lại qua cùng validation path.
- 401/403 chuyển credential recovery, retryable network/408/425/429/5xx dùng
  backoff, permanent 4xx chuyển `BLOCKED_CONFIG` và không được startup tự mở
  lại. Config target mới hoặc credential được xác nhận mới mở đúng nhóm block.
- HTTP Dongil có correlation ID; diagnostic log không ghi credential. Nút kiểm
  tra trả stage URL/health/registration/type, và source đã qua `git diff --check`.

1. Tách diagnostic stages như mục 9.2.
2. Chuẩn hóa error codes và retry classification.
3. Reconnect idempotent và chống double click.
4. Chỉ tồn tại một active socket cho machine runtime.
5. Xử lý server registration update trong lúc app chạy.
6. Khi reconnect thành công, refresh registration/type trước khi resume outbox.
7. Permanent 400 dừng retry và hiển thị cấu hình cần sửa.
8. 401/403 chuyển sang credential recovery, không xóa production data.
9. Mất LAN giữ config, credential, outbox và history snapshot.
10. Structured logs dùng correlation ID, không chứa credential.

Exit gate:

- Network outage và recovery không làm mất dữ liệu.
- Permanent error không tạo retry loop vô hạn.

### Phase 5 — Operator Dongil permissions

Status: **Source operator UI/runtime boundary user-accepted — packaged verification pending**

Feasibility result: **Feasible with an authoritative IPC/API boundary**

- `PermissionsGuard` reloads the active user and effective permissions from the
  database, so the new operator capabilities do not rely on stale JWT claims.
- Renderer visibility alone is insufficient for privileged desktop IPC. Status,
  reconnect, registration refresh and history start now require both the user
  bearer token and `x-desktop-internal-token`; arbitrary-IP testing additionally
  reloads the actor and permits only active DEV/ADMIN accounts.
- The existing `dongil.history-sync.manage` permission remains authoritative for
  Pause/Resume/Cancel/Retry Failures. The new start permission is intentionally
  independent so Operator cannot gain management controls implicitly.
- Engineer receives `dongil.connection.view` to preserve its prior read-only
  visibility while the newly protected status endpoint is introduced; no new
  connect or history-start capability is granted to Engineer.

1. Thêm permission constants.
2. Tạo migration idempotent cho permission catalog và default mappings.
3. Không dùng `dongil.history-sync.manage` để cho operator start.
4. Tách Start khỏi Pause/Resume/Cancel/Retry Failures.
5. Electron IPC forward bearer token cho operation có actor.
6. Backend internal endpoint yêu cầu bearer JWT và desktop internal token.
7. Backend reload active user và permission từ DB.
8. Cập nhật UI operator theo ma trận đã duyệt.
9. Thêm loading state và disable duplicate actions.
10. Audit reconnect và history sync start.

Exit gate:

- Operator thực hiện được đúng năm nhóm thao tác được phép.
- Gọi trực tiếp API bị cấm vẫn trả permission denied.

### Phase 6 — Secure remembered login cho mọi role

Status: **Source Electron safeStorage/cold boot user-accepted — packaged verification pending**

Feasibility result: **Feasible with revocation-state clarification**

- Mô hình singleton phù hợp với một workstation DB: backend sinh token 256-bit,
  PostgreSQL chỉ giữ SHA-256, Electron main giữ token gốc đã mã hóa bằng Windows
  `safeStorage`, và renderer không nhận token ghi nhớ.
- Restore không còn phụ thuộc JWT cũ. Electron chỉ gọi restore khi file local tồn
  tại; backend kiểm tra desktop internal token, dongle thật, machine ID, token
  hash, user active và role trước khi phát JWT phiên mới.
- Role change, deactivate và delete thu hồi DB record ngay trong transaction của
  account mutation. Vì record đã bị xóa trước lần cold boot kế tiếp, file local
  còn lại được phân loại là token đã bị thu hồi/không hợp lệ rồi bị xóa; không
  thể luôn phân biệt nguyên nhân role-change chỉ từ token cũ nếu không bổ sung
  tombstone ngoài thiết kế đã duyệt.
- Source hiện không có password-reset mutation. Hook thu hồi cho password reset
  được giữ là yêu cầu bắt buộc khi flow đó được bổ sung, không tạo endpoint giả
  chỉ để thỏa checklist.
- Logout thực hiện revoke DB qua Electron/backend trước, sau đó mới xóa local
  secure token và sessionStorage. Lỗi backend giữ người dùng ở phiên hiện tại để
  có thể Retry; lỗi xóa file sau khi DB đã revoke không làm token dùng lại được.

1. Tạo Prisma migration cho `RememberedLogin` và quan hệ `User`.
2. Tạo remember-token service chuyên trách.
3. Dùng `crypto.randomBytes` để sinh token ít nhất 256 bit.
4. Hash token trước khi ghi DB.
5. Thêm typed Electron IPC enable/restore/disable.
6. Renderer không nhận raw remember token.
7. Electron lưu encrypted token atomically trong `userData`.
8. Nếu `safeStorage.isEncryptionAvailable()` là false, disable checkbox với
   thông báo rõ; login thủ công vẫn hoạt động.
9. Login unchecked thu hồi DB record trong flow xác thực thành công.
10. Login checked kích hoạt secure-storage flow sau login thành công.
11. Startup restore yêu cầu real dongle, machine ID, internal token, token hash,
    user active và role không đổi.
12. Restore luôn load current effective permissions.
13. Logout revoke DB trước, xóa local token sau, rồi mới clear current session.
14. User role update, deactivate, delete và password reset thu hồi record trong
    cùng DB transaction với account mutation khi thực tế có mutation đó.
15. Lỗi transient không gọi revoke.
16. Chuyển access JWT persistence từ localStorage sang current-session storage.
17. Xóa legacy remembered access JWT sau khi secure flow đã được xác nhận.
18. Thêm audit và error mapping EN/VI.

Exit gate:

- Cả bốn role có thể enable/restore remembered login.
- Đổi role bắt buộc đăng nhập thủ công lại.
- DB dump không cung cấp credential có thể dùng trực tiếp để đăng nhập.
- Origin/port change không làm mất DB remembered state.

### Phase 7 — Dongle check coordination

Status: **Physical dongle and source cold-boot coordination accepted — packaged verification pending**

Feasibility result: **Feasible without changing protected license code**

- `DongleCheckerService`, native helper, DLL và fallback script được giữ nguyên.
  Coordinator mới nằm ở application layer và chia sẻ một in-flight promise cho
  login gate, watchdog, login thủ công và remembered restore.
- Polling ở login và runtime watchdog dùng recursive timeout sau khi request hiện
  tại hoàn tất, thay vì `setInterval` có thể xếp chồng request chậm.
- `NOT_FOUND` và `INVALID` là lỗi xác định; `TIMEOUT`, `TRANSIENT_BUSY` và
  `HELPER_ERROR` trả license state `unknown`. Vì vậy lỗi tạm thời chặn cấp phiên
  mới nhưng không bị hiểu nhầm thành thao tác rút dongle và không thu hồi
  remembered credential.
- Phân loại dựa trên contract hiện có của application wrapper. Không sửa output,
  retry hoặc timeout bên trong helper được bảo vệ.

1. Tạo coordinator dùng chung cho backend license/dongle checks.
2. Các caller chia sẻ một in-flight promise.
3. Không spawn checker mới khi lần trước chưa kết thúc.
4. Watchdog schedule lần kế tiếp sau khi lần hiện tại hoàn tất.
5. Giữ khả năng phát hiện dongle removal kịp thời mà không tạo overlap.
6. Phân biệt NOT_FOUND, INVALID, TIMEOUT, HELPER_ERROR và TRANSIENT_BUSY.
7. Restore chỉ nhận real `DONGLE_OK`.
8. Không sửa protected dongle helper hoặc license source.

Exit gate:

- Không có nhiều native checker process do cùng một chu kỳ UI/watchdog.
- Cold boot timeout không tự xóa remembered login.

### Phase 8 — UI, i18n, logging và documentation

Status: **Source visual/runtime/log review accepted — packaged UI pending**

Feasibility result: **Feasible without a layout redesign**

- Login, permission-aware Dongil controls and the existing responsive settings
  panel could be extended without replacing the current design system.
- Connection-stage diagnostics are rendered only after the privileged
  `dev`/`admin` test flow; operator controls remain limited to refresh,
  reconnect and permitted history synchronization.
- Errors, audits and correlation metadata are structured without placing
  passwords, JWTs, remembered tokens, internal tokens or Dongil credentials in
  user-visible diagnostics.
- Project, architecture, API, database, security, Dongil, logging, onboarding
  and workspace READMEs now describe PostgreSQL as Dongil config authority and
  Electron `safeStorage` as the local remembered-token boundary.
- Static documentation/source review and `git diff --check` are complete. Visual
  verification at 1280 x 1024, automated checks and runtime validation remain
  deferred to Phase 9 authorization.

1. Cập nhật login UI cho mọi role.
2. Cập nhật Dongil panel theo readonly operator mode.
3. Hiển thị connection stages và machine-type mismatch rõ ràng.
4. Bổ sung đầy đủ English/Vietnamese.
5. Giữ layout 1280 x 1024, touch-friendly và không horizontal page overflow.
6. Dùng custom confirmation cho Save/Reset; không dùng browser-native dialog.
7. Bổ sung structured logs và redaction.
8. Cập nhật `PROJECT_PROFILE.md`.
9. Cập nhật `docs/03-business-rules.md`.
10. Cập nhật `docs/06-api-contracts.md`.
11. Cập nhật `docs/12-dongil-server-integration.md`.
12. Cập nhật `docs/14-database.md`.
13. Cập nhật `docs/15-security.md`.
14. Cập nhật README của Electron/backend/frontend khi contract thay đổi.
15. Chuyển ADR Proposed sang Accepted chỉ sau khi implementation khớp quyết định.

Exit gate:

- Documentation mô tả đúng source mới và không còn chỉ dẫn dùng env làm Dongil
  runtime authority.

### Phase 9 — Verification và pilot

Status: **Phase 9A/9B/9C complete; user-reported manual source pilot accepted — packaged pilot pending**

Pre-execution feasibility assessment: **Feasible with staged authorization**

- Existing backend Jest coverage can be extended for auth, permission, dongle
  coordination and Dongil behavior without adding a dependency.
- Electron/frontend do not currently expose a general unit-test runner for the
  new pure modules. Env bootstrap has an existing PowerShell test harness;
  remaining Electron/frontend confidence should come from typecheck/build and
  focused runtime/visual checks unless a separately approved test dependency is
  justified.
- The checked-in Prisma schema now differs from the generated client under
  `backend/node_modules`; `prisma:generate` must run before backend typecheck or
  Jest compilation. Generation is not a database migration.
- `backend/.env` exists and may identify a real workstation database. No
  migration, seed, destructive cleanup or integration test may use that URL
  until the target is confirmed as an isolated test/pilot database and a backup
  requirement is satisfied.
- The backend `lint` script includes `--fix`; verification should invoke ESLint
  in non-fixing mode so it cannot silently rewrite source.
- Automated source checks, isolated-DB integration, Electron runtime/visual
  verification, and physical cold-boot pilot are separate gates. Authorization
  for one gate does not imply authorization for the later gates.

Phase 9A evidence recorded on **2026-10-06**:

- Prisma Client `6.19.3` generated successfully; no migration or seed ran.
- Ten targeted backend Jest suites passed: **66 tests, 0 failures**. Coverage
  includes remembered-login opt-in/restore/revocation behavior, all four roles,
  role/account-state changes, internal-token boundaries, permission metadata,
  dongle check coordination, transient/definitive classification, DB-over-env
  import, fixed machine type, staged diagnostics and retry classification.
- Electron runtime-env harness passed CRLF/LF/CR/BOM, duplicate, blank,
  malformed, value-with-`=` and validation cases.
- Installer Dongil bootstrap PowerShell harness passed.
- Backend, frontend and Electron typecheck all passed.
- Backend, frontend and Electron production builds all passed. Electron build
  only copied the existing protected license artifact into its generated
  read-only runtime output; protected source was not modified.
- ESLint passed for every backend/frontend/Electron source file changed by this
  plan, and full Electron lint passed. Full frontend lint remains blocked by a
  pre-existing `react-hooks/set-state-in-effect` error and dependency warning in
  `components/dongil/dongil-history-sync-processing.tsx`, which is outside this
  change set. Full backend non-fixing lint remains blocked by repository-wide
  baseline Prettier/CRLF debt; changed backend files pass non-fixing ESLint.
- Password-reset revoke is not runtime-tested because there is currently no
  password-reset mutation. Deleted-account cascade/revocation is covered by the
  isolated-DB integration test recorded below.

Phase 9B evidence recorded on **2026-10-06**:

- Preflight confirmed `backend/.env` targets local database `ocrahso`; that
  database was treated as the workstation database and was never used as a
  migration target. A final read-only comparison showed 40 completed migrations,
  no `RememberedLogin` table and no Phase 9B migration records.
- Created isolated database `ocrahso_codex_phase9b_20261006` on localhost. The
  URL was supplied only through the child process environment; `backend/.env`
  was not edited.
- Created and validated a pre-migration custom-format backup at
  `%LOCALAPPDATA%\Temp\ahso-ocr-phase9b`, with SHA-256
  `1BC0917238BEB5C1DB5F756DDFB412214DB332E5FEE7F261B95AF21579CDBDF3`.
- `prisma migrate deploy` applied all 48 migrations successfully. `prisma
  migrate status` reported the schema current, and a second deploy reported no
  pending migrations.
- Added a guarded integration runner that refuses any database whose name does
  not match `ocrahso_codex_phase9b_*`. Six integration tests passed against
  PostgreSQL 18.4: complete migration history, fixed machine type, all-role
  remembered login with hash-only persistence, transient/definitive revoke
  behavior, role-change/delete revoke, operator allow/deny permissions, config
  idempotency and concurrent reconnect deduplication.
- The integration cleanup left zero remembered-login rows, zero Phase 9B users
  and zero audit rows. No seed, external Dongil connection, Device Tool, dongle,
  Electron runtime or hardware flow ran.
- This was a blank/synthetic isolated database. Compatibility with the actual
  workstation's data distribution still requires the separately approved pilot
  backup and migration; production data was not copied into the test database.

Phase 9C evidence recorded on **2026-10-06**:

- Reconfirmed that ports 3970, 3980, 8668, 3000, 4000 and 8000 were free before
  the focused check. Only the backend and frontend processes started by this
  check were stopped afterward.
- Created and validated a pre-runtime custom-format backup of the isolated
  database at `%LOCALAPPDATA%\Temp\ahso-ocr-phase9c`, with SHA-256
  `B92C86F420964720FB76AE49BA8C5E4CF39FA976ABD8CC389FAF6ED5647D6E36`.
- Started the backend on port 3980 with the isolated database supplied through
  the child-process environment and automatic migration disabled. Health was
  `ok`; backend stderr had no entries.
- The real protected dongle boundary was invoked without modifying its source
  or binary. It returned `DONGLE_OK`, `licensed=true` and
  `donglePresent=true`.
- Runtime API checks created temporary admin and operator accounts without
  printing passwords, JWTs or opaque remember tokens. Both roles returned
  `REMEMBER_RESTORED`; logging in again with `rememberLogin=false` made the
  previous opaque token return `REMEMBER_TOKEN_INVALID`.
- The Phase 9B integration fixture had left the isolated database with its
  deliberately reduced role-permission set, so its temporary admin could not
  create an operator through `user.manage`. Phase 9C inserted only the temporary
  operator through Prisma after rechecking the database identity, then removed
  it through the full pre-runtime snapshot restore. Making that integration
  fixture restore role data is follow-up test-isolation work, not a production
  authorization failure.
- The runtime operator session contained `dongil.connection.view`,
  `dongil.connection.operate`, `dongil.history-sync.view` and
  `dongil.history-sync.start`. Operator status/history reads succeeded while
  the unrelated user-management endpoint returned 403. Reconnect, registration
  refresh and history-start were not invoked because they can contact the live
  Dongil Server or mutate synchronization state; their guards and service
  behavior remain covered by Phase 9A/9B checks.
- Backend runtime status and the database singleton both reported fixed machine
  type `WASHING_MACHINE`; the row remained config version 2.
- Frontend setup/login screens were inspected at 1280 x 1024. There was no
  horizontal overflow and no browser console warning/error. In a normal web
  browser the remember checkbox is intentionally disabled and the Windows
  secure-storage-unavailable message is visible because the Electron preload
  bridge is absent; this does not verify the packaged Electron presentation.
- Electron was not launched. Current `startAll()` startup behavior would start
  or reuse Device Tool and then run PLC/camera preparation, so it cannot satisfy
  the approved no-hardware Phase 9C boundary without a separately approved
  isolation mechanism or a controlled hardware pilot.
- After the check, the isolated database was restored from the verified backup.
  Verification showed zero `phase9c_*` users, zero remembered-login rows and
  zero remember-login audit rows. All touched and legacy OCR ports listed above
  were free. No Device Tool, PLC, camera, updater or live Dongil operation ran.

Remembered-login ACL follow-up recorded on **2026-10-06**:

- A real development Electron login reproduced successful password login plus
  failed local remember persistence. The backend compensating revoke completed;
  the workstation database contained zero `RememberedLogin` rows.
- The failed save left `remembered-login.json.tmp` owned by the current user but
  with access granted only to Administrators and SYSTEM. Development launch sets
  `AHSO_ELECTRON_SKIP_ADMIN_RELAUNCH=1`, so the non-elevated process could no
  longer rename or delete the file it had just protected.
- The store now resolves the current Windows user SID and grants that SID,
  Administrators and SYSTEM full control. Exact application-owned `.tmp` and
  `.bak` artifacts are repaired to this ACL before cleanup; no password, JWT or
  plaintext remember token is persisted or logged.
- Electron typecheck and production build passed. The build prepared the
  existing protected license runtime artifact without modifying protected
  source.
- A non-elevated Electron harness used isolated temporary `userData`, reproduced
  the legacy admin-only `.tmp` ACL, recovered it, persisted and decrypted a
  `safeStorage` token, cleared all artifacts and removed its temporary directory.
- The already-running full desktop process was not restarted by the agent.
  Full-app restart, real opt-in through the UI and Windows cold boot remain the
  final acceptance checks.

Manual source acceptance reported by the user on **2026-10-06**:

- The development Electron application completed real remembered-login opt-in,
  application restart, automatic restore and full Windows cold boot
  successfully.
- The operator Dongil screen exposed the approved refresh, reconnect,
  registration-refresh and history-start operations while configuration and
  management actions remained unavailable.
- Temporary LAN interruption recovered successfully and pending local outbox
  results synchronized after reconnection.
- The user reviewed runtime logs and reported no exposed password, JWT,
  remember token or machine credential.
- These are user-reported manual source-runtime results. They were not captured
  independently by the agent and do not constitute packaged installer,
  production-data migration, updater, PLC or camera acceptance.
- A separate read-only Prisma audit found the workstation `ocrahso` database at
  all 48 migrations and reported the schema up to date. No migration or seed was
  executed by the audit, and deployment provenance was not inferred.

Final source-diff and migration audit recorded on **2026-10-06**:

- `prisma validate` passed for the current schema. Prisma emitted only the
  existing package-configuration deprecation warning for a future Prisma 7
  migration.
- The four new migrations are ordered and match the current schema. The config,
  permission and remembered-login changes are additive/idempotent for their
  approved contracts.
- `20261006090000_fixed_washing_machine_type` intentionally rewrites every
  non-washing local type to `WASHING_MACHINE`. That normalization cannot recover
  the previous value by itself, so the packaged pilot must retain the verified
  pre-migration database backup required by the rollback plan.
- Full tracked `git diff --check`, conflict-marker scan and whitespace/final-
  newline checks for new text files passed. Git reported only the repository's
  LF-to-CRLF checkout warnings.
- Branch remained `remote`; protected `tool/` and license paths had no diff. No
  commit, push, build, installer, migration deploy or seed was performed by this
  final audit.

Không chạy các bước này chỉ dựa trên việc plan đã được duyệt. Cần yêu cầu xác
minh rõ ràng trước khi chạy command hoặc thiết bị thật.

#### Static và automated checks

1. Unit test env parser cho CRLF, LF, CR, BOM, duplicate, blank và malformed.
2. Unit test config-source migration matrix.
3. Unit test fixed machine type và mismatch blocking.
4. Unit test retry classification.
5. Unit test permission matrix.
6. Unit test remembered login enable/restore/disable.
7. Unit test tất cả role được enable.
8. Unit test role change revoke.
9. Unit test inactive/deleted/password-reset revoke.
10. Unit test wrong machine ID, wrong token, missing internal token và mock dongle.
11. Unit test transient error không revoke.
12. Integration test reconnect idempotency.
13. Integration test history start của operator và manage denial.
14. Chạy lint/typecheck/build theo workspace nếu được yêu cầu.
15. Chạy `git diff --check` và kiểm tra không có diff trong protected paths.

#### Pilot trên một máy rửa

1. Ghi nhận version, machine ID, IP, registration status và assigned type.
2. Backup PostgreSQL.
3. Backup ProgramData `.env` và checksum.
4. Backup Electron credential files mà không in nội dung secret.
5. Ghi nhận ACL trước update.
6. Cài bản pilot.
7. Xác minh migration DB.
8. Xác minh local type luôn là `WASHING_MACHINE`.
9. Xác minh URL DB và UI/Electron giống nhau.
10. Login từng role và bật Ghi nhớ đăng nhập.
11. Đóng/mở app bình thường.
12. Restart Windows.
13. Tắt nguồn hoàn toàn rồi bật lại.
14. Xác minh restore vào đúng role và current permissions.
15. Đổi role, cold boot và xác minh bị yêu cầu đăng nhập thủ công.
16. Logout, login unchecked, cold boot và xác minh vào thẳng form.
17. Mô phỏng backend khởi động chậm và xác minh remember record không mất.
18. Ngắt LAN, tạo local results, kết nối lại và xác minh outbox replay.
19. Operator thử Refresh, Reconnect, Registration Refresh và History Start.
20. Operator thử Save, Reset, Disconnect và History Manage; backend phải từ chối.
21. Tạo server assignment mismatch có kiểm soát và xác minh local fail-closed.
22. Xác minh permanent 400 không retry vô hạn.
23. Xác minh log không chứa JWT, remember token, credential hoặc password.
24. Xác minh ACL sau update/save.
25. Recheck các port đã chạm, gồm 3000, 4000 và 8000 khi runtime OCR được chạy.
26. Chỉ dừng process do agent/test khởi chạy.

Pilot chỉ được mở rộng sang máy tiếp theo khi toàn bộ tiêu chí bắt buộc đạt và
không có regression production capture/outbox.

## 11. Migration và tương thích

### 11.1. Database migration

- Migration là additive trong release đầu.
- Không drop inspection, outbox, history hoặc user data.
- `RememberedLogin` ban đầu rỗng; người dùng phải login thủ công và opt-in.
- Existing Dongil config được normalize có kiểm soát.
- Migration không tự chạy seed trên production DB.
- Prisma Client phải được generate đồng bộ trước build/release khi verification
  được cho phép.

### 11.2. Env migration

- Backup file trước khi normalize.
- DB hợp lệ có ưu tiên cao hơn legacy env.
- App mới không đọc URL/type legacy làm runtime authority.
- Không xóa backup trong release đầu.
- Downgrade dùng recovery procedure để phục hồi env tương thích với app cũ.
- Nếu admin đổi IP sau khi dùng app mới rồi downgrade, recovery phải cảnh báo
  backup env có thể chứa IP trước update và yêu cầu xác nhận IP hiện tại.

### 11.3. Remembered session migration

- Không chuyển access JWT cũ thành remember token mới.
- Legacy browser token chỉ được dùng như current-session compatibility trong
  cửa sổ nâng cấp nếu còn hợp lệ.
- Người dùng phải nhập password và tích lại Ghi nhớ đăng nhập một lần để tạo
  secure remembered credential.
- Sau khi secure credential được xác nhận, xóa application-owned legacy token.

## 12. Rollback

### 12.1. Điều kiện kích hoạt

- App mới không hoàn tất startup/preflight.
- Migration thất bại.
- Config migration làm mất khả năng kết nối máy đã hoạt động.
- Production capture hoặc outbox bị regression.
- Remembered login làm sai role/permission.
- ACL hoặc secret handling không đạt yêu cầu.

### 12.2. Quy trình

1. Dừng chỉ app/service thuộc bản pilot.
2. Giữ nguyên log và failure evidence.
3. Phục hồi previous known-good application version.
4. Phục hồi ProgramData env từ backup đã xác minh checksum khi app cũ cần.
5. Không drop bảng/column mới trong rollback khẩn cấp; app cũ phải bỏ qua chúng.
6. Restore DB backup chỉ khi migration làm dữ liệu hiện tại không thể dùng và
   sau khi xác nhận không làm mất inspection mới phát sinh.
7. Kiểm tra PostgreSQL, backend, frontend và Tool port ownership.
8. Xác minh login thủ công, production capture và outbox trên bản cũ.
9. Ghi audit/incident record và chặn rollout các máy còn lại.

### 12.3. Trạng thái an toàn khi một phần thất bại

- Remembered migration lỗi: login thủ công vẫn hoạt động.
- SafeStorage ghi lỗi: login thành công nhưng remember không được bật; DB hash
  orphan được revoke/cleanup.
- Dongil config migration lỗi: chặn connect, giữ outbox/history.
- Server assignment sai: local fixed type không đổi; chờ sửa server assignment.
- Network outage: local production tiếp tục, outbox giữ pending.

## 13. Rủi ro và giảm thiểu

| Rủi ro | Mức độ | Giảm thiểu |
| --- | --- | --- |
| Admin/dev tự đăng nhập trên máy có người truy cập vật lý | High | Dongle thật + machine binding + safeStorage token + role-change revoke + audit |
| DB và safeStorage không có distributed transaction | Medium | Compensating revoke; orphan DB hash không dùng được nếu thiếu token gốc |
| User profile Windows thay đổi làm mất safeStorage token | Medium | Mở form login; không xóa DB cho lỗi transient; admin có thể revoke/re-enable |
| Migration config chọn sai nguồn | High | Decision matrix, backup, diagnostics, pilot một máy |
| Rollback app cũ dùng env IP cũ | Medium | Recovery cảnh báo và xác nhận IP sau update |
| Permission seed ghi đè customization | High | Dùng migration idempotent; không chạy seed tùy tiện |
| Type mismatch làm dừng sync đang hoạt động | Medium | Hiển thị local/server values; sửa assignment server có kiểm soát |
| Dongle single-flight cache làm chậm phát hiện rút dongle | Medium | Chia sẻ in-flight, không cache success dài hạn, schedule sau completion |
| Refactor config chạm file lớn | High | Thay đổi theo phase nhỏ, không trộn refactor ngoài scope |
| Log vô tình lộ credential | High | Central redaction, tests với failure paths, review log payload |

## 14. Definition of Done

Kế hoạch chỉ hoàn thành khi đáp ứng toàn bộ điều kiện áp dụng sau:

- Parser xử lý đúng CRLF, LF, CR-only và BOM.
- Duplicate/blank critical key không âm thầm ghi đè config hợp lệ.
- Runtime config được nạp trước khi tính port/origin.
- PostgreSQL là authority duy nhất của Dongil Server URL.
- UI, Electron và backend báo cùng URL.
- Local machine type luôn là `WASHING_MACHINE`.
- Type mismatch chặn socket và gửi kết quả.
- Test connection phân biệt reachability, registration, credential và socket.
- Permanent 400 không retry vô hạn.
- Operator có đúng quyền đã duyệt và backend chặn thao tác vượt quyền.
- Tất cả role có thể dùng Ghi nhớ đăng nhập.
- Password và access JWT dài hạn không nằm trong remember storage.
- Raw remember token chỉ ở Electron safeStorage; DB chỉ giữ hash.
- Cold boot restore phát JWT mới và tải current permissions.
- Role change, disable, delete, password reset, logout và unchecked login thu hồi
  remembered login đúng quy tắc.
- Lỗi transient không thu hồi remembered login.
- Dongle checks không chạy chồng.
- Outbox/history không mất hoặc bị xóa.
- Audit/log không chứa secret.
- Tài liệu và ADR khớp implementation.
- Không có thay đổi trong `tool/` hoặc protected license paths.
- Pilot cold boot, network interruption, permission denial và rollback evidence
  được ghi nhận trên ít nhất một máy thật trước rollout rộng.

## 15. Theo dõi trạng thái

| Phase | Trạng thái |
| --- | --- |
| Phase 0 — Plan và baseline | Done — documentation and feasibility only |
| Phase 1 — Env parser/bootstrap | Source runtime user-accepted — packaged cold boot pending |
| Phase 2 — Fixed machine type | Source fixed type/live assignment user-accepted — packaged verification pending |
| Phase 3 — DB-authoritative Dongil config | Workstation schema current and source runtime user-accepted — packaged migration pending |
| Phase 4 — Dongil reliability | Live source Dongil/outbox flow user-accepted — packaged verification pending |
| Phase 5 — Operator permissions | Source operator UI/runtime boundary user-accepted — packaged verification pending |
| Phase 6 — Secure remembered login | Source Electron opt-in, restart and cold boot user-accepted — packaged verification pending |
| Phase 7 — Dongle coordination | Physical dongle and source cold-boot coordination accepted — packaged verification pending |
| Phase 8 — UI/i18n/logging/docs | Source visual/runtime/log review accepted — packaged Electron UI pending |
| Phase 9 — Verification/pilot | Automated/isolated checks complete and manual source pilot user-accepted — packaged pilot pending |

Mọi thay đổi architecture, database, API, permission, security hoặc rollback
khác với plan này phải dừng triển khai, cập nhật plan và được duyệt lại trước
khi tiếp tục.
