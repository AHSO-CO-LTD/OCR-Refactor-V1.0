# Kiểm tra toàn bộ dự án OCR

Status: **Completed with findings**
Approved date: **2026-10-09**
Baseline branch/commit: **remote / e152c9d4c5fe203c94682279b1fa9ab7cf9c6620**

## Mục tiêu

Kiểm tra toàn bộ source repository theo hướng không phá hủy để xác định lỗi
compile, test, lint, cấu hình, migration, dependency, release guard, bảo mật và
ranh giới protected source trước khi chuẩn bị phát hành tiếp theo.

## Phạm vi được duyệt

- Git/workspace/package/version/configuration audit.
- Prisma schema validation và Prisma Client generation; không kết nối hoặc ghi DB.
- Unit test và harness không cần PostgreSQL, Electron UI hoặc phần cứng.
- Typecheck và ESLint ở chế độ không tự sửa.
- Production build cho backend, frontend và Electron.
- Release-preparation guard nếu không publish, không chạy installer và không
  tác động database/runtime máy.
- Dependency audit và static secret/boundary scan.

## Không thực hiện trong vòng này

- Không chạy `prisma migrate`, seed, E2E/integration dùng database thật.
- Không mở Electron desktop, không chạy installer/uninstaller.
- Không kết nối camera, PLC, dongle, Device Tool hoặc Dongil Server thật.
- Không sửa source để làm các check đạt; lỗi được ghi nhận trước khi lập plan sửa.
- Không sửa `tool/`, protected license, ROI hoặc Dongil Server.
- Không commit, push, tag hoặc publish.

## Toolchain

- Source yêu cầu Node.js 22+; release RC2 trước đó dùng Node `22.23.3`.
- Node hệ thống khi bắt đầu kiểm tra là `24.14.1`, nên verification sẽ dùng
  Node 22 portable được kiểm tra checksum nếu có thể tải từ nguồn chính thức.
- npm workspace và lockfile hiện tại được giữ nguyên; không chạy install có thể
  thay đổi lockfile.

## Các phase

| Phase | Nội dung | Trạng thái |
| --- | --- | --- |
| V0 | Baseline Git, toolchain, scripts, ports và protected boundaries | Done |
| V1 | Config, lockfile, Prisma schema/migration và contract audit | Done |
| V2 | Unit tests và release/env harness | Done |
| V3 | Typecheck và non-fixing lint | Done with findings |
| V4 | Production build và release-preparation guard | Done |
| V5 | Dependency/security/secret/boundary audit | Done with findings |
| V6 | Tổng hợp lỗi, residual hardware/installer gates và kết luận | Done |

## Nguyên tắc kết quả

- `PASS` chỉ khi command thực tế trả thành công.
- `FAIL` ghi command, phạm vi và nguyên nhân đầu tiên có thể hành động.
- `BLOCKED` dùng khi cần DB/hardware/credential hoặc gây thay đổi ngoài phạm vi.
- User-reported packaged acceptance vẫn được giữ riêng, không dùng thay cho
  command verification trong vòng này.

## Definition of Done

- Mọi workspace và nhóm kiểm tra trên đều có kết quả rõ PASS/FAIL/BLOCKED.
- Không có file source bị sửa bởi lint/build/generate ngoài generated ignored output.
- Worktree tài liệu có sẵn được bảo toàn.
- `tool/` và protected license source/binary không có diff.
- Báo cáo phân biệt lỗi cần sửa với giới hạn chưa thể kiểm chứng không phần cứng.

## Kết quả ngày 2026-10-09

### Baseline và ranh giới

- Branch `remote`, baseline `e152c9d4c5fe203c94682279b1fa9ab7cf9c6620`; trùng
  `origin/remote` tại thời điểm kiểm tra.
- Toàn bộ package metadata ở phiên bản `1.5.0-rc.2`.
- Dùng Node.js `22.23.3` portable từ archive chính thức, checksum SHA-256
  khớp `SHASUMS256.txt`; npm `10.9.9`.
- `tool/` sạch tại commit `fe9dcc6071a841537fe79760ea412476550a9430`.
- Không có diff trong protected license source/binary, Dongil Server hay ROI.
- Các cổng `3000`, `3970`, `3979`, `3980`, `4000`, `8000`, `8668` đều
  trống trước khi chạy kiểm tra.

### PASS

- 17 tệp JSON parse thành công; package versions và lockfile đồng bộ.
- 49 thư mục migration có `migration.sql`, không trùng prefix timestamp.
- `git diff --check`, conflict-marker scan và tracked-runtime-secret scan đều qua.
- `prisma validate` và `prisma generate` qua với Prisma `6.19.3`.
- `npm ci --ignore-scripts --no-audit` qua; hash `package-lock.json` không đổi.
- Backend Jest: **32/32 suites, 184/184 tests** qua.
- Runtime env harness, Dongil bootstrap harness, Dongil address tests `3/3`, operator
  machine-flow tests `5/5` và Electron remembered-login-store verification đều qua.
- Typecheck qua cho frontend, backend và Electron.
- Production build qua cho frontend, backend và Electron; frontend sinh đủ 21 route.
- `release:prepare` qua khi dùng encrypted Tool bundle cục bộ đã có checksum/
  release metadata đúng. Runtime staging không có `.env`, không có plaintext
  `api.py`, `core.py`, `drivers.py` ở root Tool.
- Bundle frontend chứa API đích `http://127.0.0.1:3979/api`, không có
  biến thể forbidden dùng port `3980` hoặc `localhost`.
- 12 PowerShell scripts parse thành công, 5 Node scripts qua `node --check`,
  workflow YAML parse thành công.
- GitHub workflow `windows-setup.yml` tồn tại; secret name `TOOL_RELEASE_TOKEN`
  đã được cấu hình. Không đọc hoặc in giá trị secret.
- Electron giữ `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`;
  backend bind loopback `127.0.0.1`.

### Findings cần xử lý

1. **High - dependency security:** `npm audit` ghi nhận 44 advisory
   (3 critical, 26 high, 14 moderate, 1 low). Tập production còn 19 advisory
   (2 critical, 12 high, 4 moderate, 1 low). Các direct package quan trọng bị
   ảnh hưởng gồm `next`, Nest platform/Swagger, `prisma`, `sharp`; không
   tự động `audit fix` vì đề xuất có thể là major/downgrade và cần
   kiểm tra tương thích.
2. **Medium - frontend lint:** 1 error `react-hooks/set-state-in-effect` tại
   `frontend/components/dongil/dongil-history-sync-processing.tsx:92` và 1 warning
   `react-hooks/exhaustive-deps` tại dòng 132.
3. **Medium - backend lint baseline:** 216 lỗi, toàn bộ là
   `prettier/prettier`/line-ending-formatting. Không chạy `--fix` để tránh
   rewrite source ngoài phạm vi kiểm tra.
4. **High - Device Tool network exposure:** launcher hiện khởi động Uvicorn với
   host `0.0.0.0`; Tool không có application JWT layer. Đây là gap đã biết,
   không sửa vì `tool/` là read-only và cần plan riêng.
5. **Medium - release bootstrap credential:** `scripts/release/preflight-environment.ps1`
   vẫn chứa một PostgreSQL superuser bootstrap password cố định. Không ghi
   giá trị vào tài liệu/log; cần thiết kế secret provisioning riêng.
6. **Low - workspace hygiene:** `npm ls` exit 0 nhưng báo bốn package hoisted
   extraneous thuộc Emscripten/N-API runtime. Một số dependency cũ phát cảnh báo
   deprecated.
7. **Low - tooling debt:** package config Prisma sẽ bị deprecated trong Prisma 7;
   hai frontend module test phát `MODULE_TYPELESS_PACKAGE_JSON`; package `shared`
   hiện chỉ có script build/typecheck placeholder.
8. **Operational - private asset download:** GitHub metadata/auth hoạt động nhưng
   download Tool asset bị treo trong môi trường kiểm tra. Release preparation
   vẫn đã được xác minh thành công bằng encrypted bundle cục bộ;
   CI download path cần được xác nhận lại trong lần release thật.

### Không kiểm chứng trong vòng này

- Không chạy migration/seed hoặc test với PostgreSQL thật.
- Không test camera, PLC, dongle, Device Tool runtime hay Dongil Server thật.
- Không mở Electron UI, không chạy installer/uninstaller, không chạy
  packaged cold-boot/downgrade acceptance.
- Không tạo installer mới, không tag, push hoặc publish GitHub Release.

## Kết luận

Source hiện **build được, typecheck qua và test backend qua**, nhưng chưa
nên coi là release-ready tuyệt đối cho đến khi có quyết định xử lý dependency
critical/high, frontend hook lint, bootstrap credential, và hoàn tất acceptance test
trên packaged app/hardware. Backend Prettier debt nên tách thành change riêng để
tránh lẫn với functional diff.
