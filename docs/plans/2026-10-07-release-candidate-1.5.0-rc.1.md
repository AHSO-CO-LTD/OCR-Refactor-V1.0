# Kế hoạch build release candidate 1.5.0-rc.1

Status: **Done — Packaged pilot pending**
Approved date: **2026-10-07**
Baseline branch/commit: **remote / 149b944c7d1d7f29d00bb369cada1330cf72f829**

## 1. Mục tiêu

Tạo installer Windows `1.5.0-rc.1` từ source candidate hiện tại để chuẩn bị
pilot packaged trên một máy rửa, với bằng chứng kiểm tra source, manifest và
checksum có thể truy vết.

`v1.4.0` đã được phát hành chính thức nên không được tạo binary mới mang cùng
version. Sau khi pilot RC đạt, version final `1.5.0` sẽ là một phase riêng.

## 2. Phạm vi được duyệt

- Đồng bộ version workspace và Swagger thành `1.5.0-rc.1`.
- Dùng Node.js 22 portable đã kiểm tra checksum, không thay Node hệ thống.
- Chạy Prisma validate/generate, targeted tests, typecheck, non-fixing lint và
  các harness release liên quan.
- Tái tạo generated output `release-runtime/`, `release/win-unpacked/` và
  `release/latest.yml`.
- Download encrypted Tool release đã pin và xác minh SHA-256.
- Đọc/copy protected license runtime và compile dongle helper vào generated
  output; không sửa source hoặc binary gốc.
- Build NSIS x64 với publish bị tắt.
- Kiểm tra version, manifest, checksum, secret exclusion và protected boundary.
- Cập nhật tài liệu bằng bằng chứng thực tế.

## 3. Ngoài phạm vi

- Không chạy installer hoặc Electron packaged app.
- Không migrate/seed/ghi DB workstation.
- Không chạy camera, PLC, dongle hoặc hardware flow.
- Không sửa Dongil Server, `tool/`, protected license source/binary hoặc ROI.
- Không commit, tag, push, publish hoặc tạo GitHub Release.
- Không thêm dependency hay thay đổi business/API/permission/security contract.

## 4. Baseline và bảo toàn artifact

- Giữ nguyên mọi installer version cũ trong `release/`.
- Ghi checksum installer known-good cục bộ trước build.
- Lưu bản sao metadata generated sẽ bị ghi đè vào thư mục backup có tên cố định
  theo RC trước khi chạy release script.
- `release-runtime/` là generated output và được phép tái tạo theo script hiện
  hữu; source `tool/` không được dùng làm nơi stage hoặc chỉnh sửa.
- Mọi source/schema/dependency change phát sinh ngoài version metadata phải dừng
  và xin duyệt lại.

## 5. Các bước thực hiện

| Bước | Nội dung | Trạng thái |
| --- | --- | --- |
| B1 | Ghi baseline version, Git, toolchain, artifact và protected boundary | Done |
| B2 | Đồng bộ version `1.5.0-rc.1` và tài liệu RC | Done |
| B3 | Chuẩn bị Node 22 portable và xác minh checksum/version | Done |
| B4 | Prisma, targeted tests, typecheck, non-fixing lint và release harness | Done |
| B5 | Backup generated metadata và chạy `release:win` không publish | Done |
| B6 | Xác minh installer/runtime manifest/checksum/secret/boundary | Done |
| B7 | Cập nhật bằng chứng và handoff cho packaged pilot | Done |

## 6. Rollback

- Nếu static check hoặc build lỗi, dừng trước pilot và giữ log chẩn đoán không
  chứa secret.
- Khôi phục generated metadata từ backup nếu cần đối chiếu artifact cũ.
- Version metadata chỉ được rollback đồng bộ bằng source edit; không dùng Git
  reset/checkout để làm mất worktree hiện tại.
- Không có DB rollback trong Phase B vì không chạy migration hay installer.

## 7. Definition of Done

- Tất cả workspace và Swagger báo `1.5.0-rc.1`.
- Node 22 portable được xác minh và chỉ dùng trong process Phase B.
- Các check được duyệt đạt hoặc blocker được ghi rõ, không che lỗi.
- Installer RC tồn tại, có checksum và không ghi đè installer cũ.
- Runtime manifest dùng đúng encrypted Tool release đã pin.
- Artifact không chứa `.env`, secret hoặc protected Tool source.
- `tool/`, license source/binary, Dongil Server/client flow và ROI không có diff.
- Không có commit/tag/push/publish và không chạm DB workstation.

## 8. Bằng chứng thực thi — 2026-10-07

- Node portable: `v22.23.3`, npm `10.9.9`; archive Windows x64 khớp
  SHA-256 chính thức
  `2B0FF57B049CDA1BBCEA2240EEC20467018713C1EFE1F7360C2681859B90ED71`.
  PATH hệ thống không bị thay đổi.
- Prisma `validate` và `generate` đạt; không chạy migration/seed.
- Targeted Jest: 7 suite, 30 test đạt. Workspace typecheck đạt cho frontend,
  backend và Electron; `shared` vẫn chỉ có placeholder typecheck như baseline.
- Non-fixing lint trên toàn bộ file TypeScript thuộc candidate đạt. Lint toàn repo
  không đạt do baseline ngoài candidate: 216 lỗi Prettier/CRLF ở backend và một
  lỗi, một cảnh báo React ở `dongil-history-sync-processing.tsx`; không tự sửa.
  Electron lint đạt.
- Runtime-env harness và Dongil bootstrap harness đều đạt.
- `npm run release:win` đạt với publish `never`; backend, Next.js production và
  Electron/NSIS đều build thành công.
- Installer: `release/AHSO-OCR-Setup-1.5.0-rc.1-x64.exe`, 112.898.301 byte,
  SHA-256
  `B7D00C2E48302B9EBA350E7EB5DF1218EF924B368CEF0FEBE6F47878A569B726`.
- Blockmap SHA-256:
  `87052654FFFD4EDE885ED481DC7EF672EBE4EA0364FDEC040DEEF9C4C8B3C4F1`.
- `latest.yml` khớp version, tên file, size và SHA-512 của installer. Package
  version trong ASAR là `1.5.0-rc.1`.
- Runtime manifest khớp Tool private release `2026.Jul.22.3` và archive SHA-256
  `f57f23f4cf26d0e0831a1a5af85972e1514d44d9d23dabd07e6c01549c918d54`.
- Không có `.env`, private key hoặc giá trị secret cục bộ trong các file runtime
  đã quét; phần Tool application chỉ có loader `main.py`, không có plaintext
  `api.py`, `core.py` hoặc `drivers.py`.
- Sáu file protected đã đối chiếu hash, `tool/` giữ nguyên Git tree
  `fe9dcc6071a841537fe79760ea412476550a9430`, và không có protected diff.
  38 artifact release cũ giữ nguyên metadata; installer `1.3.0` giữ nguyên
  SHA-256 `3BC6AF86C6C4145628E835995C85FFBA6BBA8FD5D953BA0F797C46EA592F65B1`.
- Installer hiện chưa có chữ ký Authenticode công khai (`NotSigned`), phù hợp
  baseline nội bộ nhưng phải được xem là cảnh báo khi pilot.
- Chưa chạy installer, packaged Electron, migration trên workstation, camera,
  PLC, dongle, OCR, Dongil runtime hay rollback. Đây là phạm vi Phase C.
