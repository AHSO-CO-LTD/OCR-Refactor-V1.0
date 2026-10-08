# Kế hoạch hotfix RC2: API local và uninstall an toàn

Status: **Done — Packaged acceptance pending**
Approved date: **2026-10-08**
Target version: **1.5.0-rc.2**

## Mục tiêu

- Loại bỏ URL backend dev `localhost:3980` khỏi frontend production bundle.
- Đóng gói frontend với API local cố định của packaged runtime:
  `http://127.0.0.1:3979/api`.
- Dừng release build nếu frontend bundle còn URL API dev hoặc thiếu URL production.
- Đổi mặc định uninstall thành chỉ gỡ ứng dụng và shortcut; giữ database,
  PostgreSQL, ProgramData, config, log, backup và runtime frameworks.

## Bằng chứng lỗi hiện tại

- Backend packaged đang nghe tại `127.0.0.1:3979` và `/api/health` trả HTTP 200.
- Frontend bundle của `1.5.0-rc.1` chứa `http://localhost:3980/api`.
- `frontend/.env` là cấu hình dev bị Git ignore nhưng vẫn được Next.js đọc lúc
  `next build`.
- Installer ghi `NEXT_PUBLIC_API_BASE_URL` đúng vào ProgramData sau build; giá trị
  này không thể thay đổi biến `NEXT_PUBLIC_*` đã được nhúng vào browser bundle.
- Uninstaller hiện khởi tạo `KeepDatabase` và `KeepFrameworks` thành `false`, kể
  cả silent uninstall.

## Phạm vi được duyệt

- Release build script và post-build validation.
- NSIS uninstall defaults và nội dung giải thích tương ứng.
- Version metadata `1.5.0-rc.2` và tài liệu release liên quan.
- Build installer mới không publish và kiểm tra artifact tĩnh.

## Ngoài phạm vi

- Không sửa Dongil Server, Device Tool, `tool/`, ROI hoặc protected license
  source/binary.
- Không đổi database schema, migration, API contract, permission hoặc business
  flow.
- Không xóa database/config/runtime đang có trên workstation.
- Không commit, tag, push, publish hoặc tạo GitHub Release.

## Các bước

| Bước | Nội dung | Trạng thái |
| --- | --- | --- |
| H1 | Điều tra bundle, port, release script và uninstall flow | Done |
| H2 | Ép production API URL trước frontend build | Done |
| H3 | Thêm post-build guard chặn URL API dev | Done |
| H4 | Mặc định giữ database/config/frameworks khi uninstall | Done |
| H5 | Đồng bộ version và tài liệu RC2 | Done |
| H6 | Chạy các kiểm tra/build đã duyệt và kiểm tra artifact | Done |
| H7 | Packaged acceptance trên máy thật | Pending |

## Rollback

- Nếu static check/build lỗi, không phát hành artifact và giữ nguyên installer cũ.
- Không chạy uninstall hoặc sửa dữ liệu workstation trong phase source/build.
- Không dùng Git reset/checkout để tránh làm mất các thay đổi hiện hữu.

## Definition of Done

- Frontend production bundle chứa `http://127.0.0.1:3979/api`.
- Bundle không chứa `localhost:3980/api` hoặc `127.0.0.1:3980/api`.
- Release build tự dừng nếu điều kiện trên bị vi phạm.
- Uninstall tương tác mở ra với cả hai lựa chọn giữ dữ liệu/framework đã được chọn.
- Silent uninstall mặc định cũng giữ database/config/frameworks.
- Installer mới có version riêng và không ghi đè artifact RC1.
- Tài liệu mô tả đúng hành vi mới và ghi rõ packaged acceptance còn hay đã hoàn tất.

## Bằng chứng thực thi — 2026-10-08

- PowerShell parser chấp nhận `prepare-runtime.ps1` và `uninstall-runtime.ps1`.
- Version root/backend/frontend/Electron/shared, package lock và Swagger đồng bộ
  `1.5.0-rc.2`.
- Release preparation chạy bằng Node portable `v22.23.3`.
- Post-build guard đạt: ba browser chunk chứa
  `http://127.0.0.1:3979/api`; không có chunk chứa URL API dev trên port `3980`
  hoặc `localhost:3979`.
- Electron Builder/NSIS hoàn tất với publish bị tắt.
- Installer:
  `release/AHSO-OCR-Setup-1.5.0-rc.2-x64.exe`, 112.899.135 byte,
  SHA-256
  `EFEB014AA300844710FD58E83AD782CC0880BB0962E68C40BFA9E33A7149F73C`.
- Blockmap SHA-256:
  `C69A4B0A5BD0114A4B01035B4C9082D5274C96F74F076D7B9B0E2D186908442F`.
- `latest.yml` khớp version, filename, size và SHA-512 của RC2.
- Runtime package báo `1.5.0-rc.2`; không có `.env*` trong packaged runtime.
- Installer RC1 giữ nguyên SHA-256
  `B7D00C2E48302B9EBA350E7EB5DF1218EF924B368CEF0FEBE6F47878A569B726`.
- `tool/` sạch tại tree `fe9dcc6071a841537fe79760ea412476550a9430`; không có
  diff trong Tool hoặc protected license paths.
- `git diff --check` không báo whitespace error; cảnh báo line-ending hiện hữu
  không phải lỗi check.
- Chưa chạy installer/uninstaller RC2, login, cold boot, restart, PLC, camera,
  dongle runtime hoặc Dongil trên packaged app. Đây là H7.
