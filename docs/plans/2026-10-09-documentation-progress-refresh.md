# Rà soát tài liệu và cập nhật tiến trình RC2

Status: **Done**
Approved date: **2026-10-09**
Baseline branch/commit: **remote / e152c9d4c5fe203c94682279b1fa9ab7cf9c6620**

## Mục tiêu

Đọc toàn bộ tài liệu được theo dõi trong repository và đồng bộ các thông tin
hiện hành với source `1.5.0-rc.2`, 49 Prisma migrations, trạng thái GitHub
Release và kết quả nghiệm thu bản cài do người dùng báo cáo.

## Phạm vi được duyệt

- Tài liệu gốc, workspace README, tài liệu `docs/`, ADR và kế hoạch lịch sử.
- Cập nhật status, mốc review, version, migration count, release state và việc
  tiếp theo.
- Giữ nguyên bằng chứng lịch sử; chỉ bổ sung trạng thái mới, không viết lại kết
  quả cũ như thể agent đã trực tiếp kiểm thử.
- Kiểm tra liên kết Markdown nội bộ, UTF-8, whitespace và phạm vi Git diff.

## Ranh giới

- Không sửa source chức năng, schema, migration, dependency hoặc artifact build.
- Không sửa `tool/`, Dongil Server, ROI hoặc source/binary license được bảo vệ.
- Không chạy build, test, lint, typecheck, migration, Electron, installer hoặc
  hardware flow.
- Không commit, push, tag hoặc publish.

## Quy tắc bằng chứng

- `Agent-verified`: chỉ dùng cho check thực sự đã chạy và có kết quả ghi nhận.
- `User-reported`: dùng cho nghiệm thu RC2 trên máy đã cài; không nâng thành
  bằng chứng agent-captured.
- `Pending`: giữ lại cho các ma trận chưa được quan sát riêng như update/
  rollback, migration trên dữ liệu đại diện, từng trường hợp revoke và policy
  mạng của Device Tool.

## Công việc

- [Done] Liệt kê và đọc toàn bộ 50 tệp tài liệu có sẵn trong phạm vi; tài liệu
  kế hoạch này nâng tổng số được kiểm tra sau cập nhật lên 51.
- [Done] Đối chiếu version workspace, Swagger, migration count, branch/commit,
  tag và GitHub Release hiện tại.
- [Done] Cập nhật tài liệu hiện hành, ADR và plan bị lỗi thời.
- [Done] Kiểm tra liên kết, UTF-8, nội dung stale, whitespace và protected paths.
- [Done] Chốt trạng thái kế hoạch và bàn giao việc còn lại trước phát hành.

## Kết quả kiểm tra tài liệu

- 51 tệp tài liệu đọc được bằng strict UTF-8; không có replacement character.
- Không phát hiện liên kết Markdown nội bộ bị hỏng.
- `git diff --check` không báo lỗi whitespace; các cảnh báo LF/CRLF là hành vi
  checkout hiện hữu của Git trên Windows.
- Diff chỉ chứa Markdown; không có source, `tool/` hoặc protected license path.
- README release đã được sửa từ Tool tag/asset cũ `2026.Jul.06.2` sang manifest
  hiện hành `2026.Jul.22.3`.
- RC1 được đánh dấu đúng là đã bị packaged pilot loại do URL dev và được RC2
  thay thế; RC2 được đánh dấu nghiệm thu packaged theo báo cáo người dùng.

## Trạng thái đối chiếu ban đầu

- Source/workspace version: `1.5.0-rc.2`.
- Branch/HEAD: `remote` / `e152c9d4c5fe203c94682279b1fa9ab7cf9c6620`.
- Prisma migrations: 49.
- Last published GitHub Release: `v1.4.0`; chưa có tag/release `v1.5.0*`.
- RC2 installer đã được build cục bộ và kiểm tra tĩnh trước đó.
- Người dùng báo cáo bản cài RC2 hoạt động, gồm local API/login, remembered
  login qua restart/cold boot, restart app, safe uninstall defaults, PLC,
  camera và Dongil. Đây là nghiệm thu do người dùng báo cáo.

## Definition of Done

- Tài liệu hiện hành không còn mô tả toàn bộ RC2 packaged acceptance là pending.
- Các giới hạn chưa được quan sát riêng vẫn được giữ rõ ràng.
- Planner chỉ ra đúng bước tiếp theo: quyết định version phát hành, đồng bộ
  metadata nếu cần, commit/push/tag, theo dõi workflow và xác minh asset.
- Không có liên kết nội bộ hỏng, lỗi UTF-8 hoặc whitespace mới.
- Git diff chỉ chứa tài liệu trong phạm vi và không chạm protected boundaries.
