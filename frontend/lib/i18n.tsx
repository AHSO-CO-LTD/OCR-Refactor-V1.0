"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type Language = "en" | "vi";

const LANGUAGE_KEY = "ocr_language";

const translations = {
  en: {
    "app.brand": "Metalcore AI",
    "app.line": "Metalcore washing",
    "app.loading": "Loading...",
    "common.clear": "Clear",
    "common.cancel": "Cancel",
    "error.notFoundTitle": "Page not found",
    "error.notFoundDescription":
      "The screen you opened does not exist or is not available in this local station.",
    "error.runtimeTitle": "This screen failed to load",
    "error.runtimeDescription":
      "Please retry the screen. If the issue continues, report it to the maintenance team.",
    "error.globalTitle": "The application hit a system error",
    "error.globalDescription":
      "The renderer could not recover automatically. Retry once, then report the issue if it happens again.",
    "error.retry": "Retry",
    "error.backHome": "Back to dashboard",
    "error.report": "Report issue",
    "error.reported": "Issue report noted. Please contact maintenance if it repeats.",
    "apiError.Invalid username or password": "Invalid username or password.",
    "apiError.Invalid session": "Session expired. Please sign in again.",
    "apiError.Missing bearer token": "Session expired. Please sign in again.",
    "apiError.Invalid bearer token": "Session expired. Please sign in again.",
    "apiError.User is not allowed": "You do not have permission for this action.",
    "apiError.Missing required permission":
      "You do not have permission for this action.",
    "apiError.Username already exists": "Username already exists.",
    "apiError.Role is not assignable": "This role cannot be assigned.",
    "apiError.Only dev can create dev users":
      "Only dev can create developer users.",
    "apiError.Only dev can update dev users":
      "Only dev can update developer users.",
    "apiError.Only dev can assign dev role":
      "Only dev can assign developer role.",
    "apiError.Only dev can delete dev users":
      "Only dev can delete developer users.",
    "apiError.User not found": "User not found.",
    "apiError.Current user cannot delete own account":
      "You cannot delete the account currently signed in.",
    "apiError.User has related records and cannot be deleted":
      "This user has related records and cannot be deleted.",
    "apiError.At least one admin account is required":
      "At least one admin account is required.",
    "apiError.At least one active admin account is required":
      "At least one active admin account is required.",
    "apiError.Only dev can manage the dev role":
      "Only dev can manage the developer role.",
    "apiError.Only dev can manage protected roles":
      "Only dev can manage protected roles.",
    "apiError.Product not found": "Product not found.",
    "apiError.Source product not found": "Source product not found.",
    "apiError.Product code or name already exists":
      "Product code or name already exists.",
    "apiError.ROI indexes must be unique": "ROI indexes must be unique.",
    "apiError.Target products are required": "Target products are required.",
    "apiError.No target products found": "No target products found.",
    "apiError.Windows virtual keyboard is only available on Windows":
      "Windows virtual keyboard is only available on Windows.",
    "apiError.Windows virtual keyboard is not available on this machine":
      "Windows virtual keyboard is not available on this machine.",
    "apiError.Cannot open Windows virtual keyboard":
      "Cannot open Windows virtual keyboard.",
    "auth.signIn": "Sign in",
    "auth.subtitle": "Use your local operator account to continue.",
    "auth.username": "Username",
    "auth.password": "Password",
    "auth.login": "Login",
    "auth.checking": "Checking...",
    "auth.signingIn": "Signing in...",
    "auth.connectionError": "Cannot connect to local API service.",
    "login.runtime": "Runtime",
    "login.localPc": "Local PC",
    "login.api": "API",
    "login.security": "Security",
    "login.dongleGate": "Dongle Gate",
    "nav.dashboard": "Dashboard",
    "nav.users": "Users",
    "nav.roles": "Roles",
    "nav.products": "Products",
    "nav.camera": "Camera",
    "nav.roi": "ROI",
    "nav.history": "History",
    "nav.reports": "Reports",
    "session.hiddenDev": "hidden dev",
    "session.logout": "Logout",
    "dashboard.title": "Dashboard",
    "dashboard.description": "Runtime overview for the local inspection station.",
    "dashboard.apiSession": "API Session",
    "dashboard.connected": "Connected",
    "dashboard.inspection": "Inspection",
    "dashboard.idle": "Idle",
    "dashboard.okNg": "OK / NG",
    "dashboard.license": "License",
    "dashboard.pending": "Pending",
    "operator.title": "Line operation",
    "operator.description":
      "Choose today's product, preview the line, and run inspection.",
    "operator.productToday": "Today's product",
    "operator.sourceApi": "API",
    "operator.sourceDemo": "Sample",
    "operator.demoCamera": "Line camera simulator",
    "operator.productsFallback":
      "Cannot load product profiles. Demo product is being used for local testing.",
    "operator.soundBlocked": "The browser blocked inspection sound playback.",
    "operator.lineControls": "Line controls",
    "operator.startLine": "Start line",
    "operator.stopLine": "Stop line",
    "operator.runStarted": "Line started.",
    "operator.runStopped": "Line stopped.",
    "operator.running": "Running",
    "operator.stopped": "Stopped",
    "operator.auto": "Auto",
    "operator.manual": "Manual",
    "operator.liveCamera": "Live camera",
    "operator.realTimeAi": "Real-time AI",
    "operator.cameraOn": "Camera on",
    "operator.cameraOff": "Camera off",
    "operator.aiOn": "AI on",
    "operator.aiOff": "AI off",
    "operator.counter": "Counter",
    "operator.ok": "OK",
    "operator.ng": "NG",
    "operator.total": "Total",
    "operator.batch": "Batch",
    "operator.count": "Count",
    "operator.quantity": "Quantity",
    "operator.packSize": "Pack size",
    "operator.savePackSize": "Save",
    "operator.savingPackSize": "Saving...",
    "operator.packSizeSaved": "Batch size saved.",
    "operator.targetQuantity": "Target",
    "operator.lastResult": "Last result",
    "operator.time": "Time",
    "operator.livePreview": "Preview",
    "operator.currentProduct": "Product",
    "operator.referenceImage": "Reference image",
    "operator.grab": "Grab",
    "operator.grabQueued": "Grab command queued for the next camera API.",
    "operator.triggerOk": "Trigger OK",
    "operator.triggerNg": "Trigger NG",
    "operator.resetCounter": "Reset counter",
    "operator.resetDone": "Counter reset.",
    "products.title": "Products",
    "products.description":
      "Manage product profiles with product code, camera settings, ROI points, and profile template apply tools.",
    "products.loadError": "Cannot load product profiles.",
    "products.saveError": "Cannot save product profile.",
    "products.deleteError": "Cannot delete product profile.",
    "products.applyError": "Cannot apply product profile.",
    "products.createSuccess": "Product profile created.",
    "products.updateSuccess": "Product profile updated.",
    "products.deleteSuccess": "Product profile deleted.",
    "products.applySuccess": "Applied product profile to targets:",
    "products.loading": "Loading product profiles...",
    "products.saving": "Saving...",
    "products.deleting": "Deleting...",
    "products.applying": "Applying...",
    "products.createProfile": "Create profile",
    "products.editProfile": "Edit profile",
    "products.saveProfile": "Save profile",
    "products.profileHint":
      "Each product profile stores product code, camera settings, and ROI points.",
    "products.groupBasic": "Basic information",
    "products.groupProduct": "Product",
    "products.groupCamera": "Camera",
    "products.groupRoi": "ROI",
    "products.groupStatus": "Status",
    "products.advancedProfile": "Advanced profile",
    "products.templateProfile": "Template profile",
    "products.selectTemplate": "Select template",
    "products.copyTemplate": "Copy template",
    "products.copyTemplateHint":
      "Copy product settings, camera settings, ROI points, and status from an existing profile.",
    "products.touchHint":
      "This screen is optimized for single-screen factory touch input and virtual keyboard entry.",
    "products.templateCopied": "Template profile copied into the form.",
    "products.applyProfile": "Apply profile",
    "products.applyToAll": "Apply to all products",
    "products.applyAllHint":
      "Camera and ROI data will be copied to every other product.",
    "products.applySelectedHint":
      "Camera and ROI data will be copied only to checked product codes.",
    "products.confirmApplyTitle": "Confirm applying product profile",
    "products.confirmApplyDescription":
      "Camera and ROI settings from the selected template will overwrite the target products.",
    "products.confirmApply": "Confirm apply",
    "products.confirmDeleteTitle": "Confirm product deletion",
    "products.confirmDeleteDescription":
      "This product profile will be deleted after confirmation:",
    "products.confirmDelete": "Confirm delete",
    "products.listTitle": "Product profile list",
    "products.listHint":
      "Select target product codes here before applying a template profile.",
    "products.emptyTitle": "No product profiles",
    "products.emptyDescription":
      "Create the first product profile to configure camera and ROI data.",
    "products.select": "Select",
    "products.code": "Product code",
    "products.name": "Product name",
    "products.defaultNumber": "Default number",
    "products.batchSize": "Batch size",
    "products.exposure": "Exposure",
    "products.thresholdAccept": "Accept threshold",
    "products.thresholdMns": "MNS threshold",
    "products.modelPath": "Model path",
    "products.camera": "Camera",
    "products.roi": "ROI",
    "products.status": "Status",
    "products.actions": "Actions",
    "products.active": "Active",
    "products.inactive": "Inactive",
    "products.sourceType": "Source type",
    "products.deviceName": "Device name",
    "products.cameraExposure": "Camera exposure",
    "products.zoomFactor": "Zoom factor",
    "products.imageWidth": "Image width",
    "products.imageHeight": "Image height",
    "products.offsetX": "Offset X",
    "products.offsetY": "Offset Y",
    "products.roiIndex": "Region",
    "products.addRoiPoint": "Add region",
    "products.removeRoiPoint": "Remove region",
    "products.roiPreviewHint":
      "Draw and adjust ROI rectangles directly on the 3000x1000 camera preview.",
    "products.drawRoiHint": "Drag on the preview to draw a new ROI rectangle.",
    "products.roiShortcutHint":
      "Select an ROI, then use Ctrl+C/Ctrl+V to copy and paste, Delete/Backspace to remove, Ctrl+Z/Ctrl+Y to undo and redo.",
    "products.roiLimit": "ROI regions",
    "products.undoRoi": "Undo ROI change",
    "products.redoRoi": "Redo ROI change",
    "products.rotateRoi": "Drag to rotate",
    "products.resizeRoi": "Drag to resize",
    "products.rotateLeft": "Rotate left",
    "products.rotateRight": "Rotate right",
    "products.selectRoiFirst": "Please select an ROI first.",
    "products.copyRoiFirst": "Please copy an ROI first.",
    "products.roiCopied": "ROI copied.",
    "products.roiPasted": "ROI pasted.",
    "products.roiDeleted": "ROI deleted.",
    "products.duplicateRoi": "Duplicate ROI",
    "products.deleteSelectedRoi": "Delete ROI",
    "products.undoApplied": "ROI change undone.",
    "products.redoApplied": "ROI change redone.",
    "products.undoUnavailable": "No ROI change to undo.",
    "products.redoUnavailable": "No ROI change to redo.",
    "products.roiAssistStraight": "Angle snapped to a straight reference.",
    "products.roiAssistAligned": "ROI aligned with another region.",
    "products.roiAssistEqualSpacing": "ROI spacing is close to equal.",
    "products.validationCode": "Product code is required.",
    "products.validationName": "Product name is required.",
    "products.validationBatchSize": "Batch size must be at least 1.",
    "products.validationRoi": "At least one ROI region is required.",
    "products.validationMaxRoi": "A profile can have at most 5 ROI regions.",
    "products.validationRoiOverlap":
      "ROI regions must not overlap. Please separate them before saving.",
    "products.validationTemplate": "Please select a template profile first.",
    "products.edit": "Edit",
    "products.delete": "Delete",
    "roles.title": "Role permissions",
    "roles.description":
      "Assign feature access by role. User-level overrides will be added next.",
    "roles.roles": "Roles",
    "roles.loading": "Loading permissions...",
    "roles.devHidden": "Developer role is hidden from normal users.",
    "roles.normalHint": "Changes apply to users without personal overrides.",
    "roles.save": "Save changes",
    "roles.saving": "Saving...",
    "roles.saved": "Role permissions updated.",
    "roles.loadError": "Cannot load role permissions.",
    "roles.updateError": "Cannot update role permissions.",
    "roles.devOnly": "dev only",
    "roles.noManageableRoles": "No manageable roles are available.",
    "users.title": "Users",
    "users.description":
      "Create accounts, review access status, and keep role assignment aligned with backend permissions.",
    "users.loadError": "Cannot load users.",
    "users.createError": "Cannot create user.",
    "users.updateError": "Cannot update user.",
    "users.deleteError": "Cannot delete user.",
    "users.createSuccess": "User account created.",
    "users.updateSuccess": "User account updated.",
    "users.deleteSuccess": "User account deleted.",
    "users.refreshSuccess": "User list refreshed.",
    "users.missingSession": "Session expired. Please sign in again.",
    "users.username": "Username",
    "users.password": "Password",
    "users.fullName": "Full name",
    "users.fullNamePlaceholder": "Engineer 1",
    "users.department": "Department",
    "users.departmentPlaceholder": "Engineering",
    "users.employeeNo": "Employee no.",
    "users.role": "Role",
    "users.status": "Status",
    "users.lastLogin": "Last login",
    "users.active": "Active",
    "users.inactive": "Inactive",
    "users.activeHint": "The account can sign in after creation.",
    "users.advancedTab": "Advanced",
    "users.showAdvanced": "Show",
    "users.hideAdvanced": "Hide",
    "users.create": "Create user",
    "users.creating": "Creating user...",
    "users.saving": "Saving changes...",
    "users.deleting": "Deleting user...",
    "users.refresh": "Refresh",
    "users.refreshing": "Refreshing...",
    "users.managementTitle": "Account management",
    "users.managementHint":
      "Create accounts from the action bar and review existing users in the table below.",
    "users.actions": "Actions",
    "users.edit": "Edit",
    "users.delete": "Delete",
    "users.editTitle": "Edit account",
    "users.saveChanges": "Save changes",
    "users.confirmUpdateTitle": "Confirm account update",
    "users.confirmUpdateDescription":
      "Please confirm before applying these account changes.",
    "users.confirmUpdate": "Confirm update",
    "users.confirmDeleteTitle": "Confirm account deletion",
    "users.confirmDeleteDescription":
      "This account will be deleted after confirmation:",
    "users.confirmDelete": "Confirm delete",
    "users.quickToggleStatus": "Change account status",
    "users.confirmStatusTitle": "Confirm account status change",
    "users.confirmStatusDescription":
      "Please confirm before changing the status for:",
    "users.confirmStatus": "Confirm status change",
    "users.createTitle": "Create account",
    "users.createHint": "Assignable roles come from the local API.",
    "users.assignableRoleHint":
      "The backend hides protected roles from normal admins.",
    "users.noAssignableRoles": "No assignable roles",
    "users.listTitle": "Account list",
    "users.listHint": "Only users visible to the current manager are shown.",
    "users.emptyTitle": "No user accounts",
    "users.emptyDescription":
      "Create the first operator or engineer account to start managing access.",
    "users.totalAccounts": "Total",
    "users.activeAccounts": "Active",
    "users.inactiveAccounts": "Inactive",
    "users.visibleRoles": "Roles",
    "users.live": "Live",
    "users.validationUsername": "Username must be at least 3 characters.",
    "users.validationPassword": "Password must be at least 6 characters.",
    "users.validationFullName": "Full name is required.",
    "users.validationRole": "Please select a role.",
    "users.virtualKeyboard": "Virtual keyboard",
    "users.virtualKeyboardOpening": "Opening keyboard...",
    "users.virtualKeyboardOpenSuccess": "Windows virtual keyboard opened.",
    "users.virtualKeyboardOpenError": "Cannot open Windows virtual keyboard.",
    "role.dev": "Developer",
    "role.admin": "Admin",
    "role.engineer": "Engineer",
    "role.operator": "Operator",
    "permission.user.manage": "Manage users",
    "permission.role.manage": "Manage roles",
    "permission.permission.manage": "Manage permissions",
    "permission.product.manage": "Manage products",
    "permission.camera.manage": "Manage camera settings",
    "permission.roi.edit": "Edit ROI",
    "permission.inspection.start": "Start inspection",
    "permission.inspection.stop": "Stop inspection",
    "permission.inspection.override": "Override inspection",
    "permission.history.view": "View history",
    "permission.report.view": "View reports",
    "permission.system.shutdown": "Shutdown system",
    "permission.system.debug": "Debug system",
    "permission.license.view": "View license state",
    "permission.group.user": "User",
    "permission.group.role": "Role",
    "permission.group.product": "Product",
    "permission.group.camera": "Camera",
    "permission.group.inspection": "Inspection",
    "permission.group.history": "History",
    "permission.group.report": "Report",
    "permission.group.system": "System",
  },
  vi: {
    "app.brand": "Metalcore AI",
    "app.line": "Metalcore washing",
    "app.loading": "Đang tải...",
    "common.clear": "Xóa số",
    "common.cancel": "Hủy",
    "error.notFoundTitle": "Không tìm thấy trang",
    "error.notFoundDescription":
      "Màn hình bạn mở không tồn tại hoặc chưa khả dụng trên trạm local này.",
    "error.runtimeTitle": "Màn hình này không tải được",
    "error.runtimeDescription":
      "Vui lòng thử tải lại màn hình. Nếu lỗi tiếp tục xảy ra, hãy báo cho bộ phận bảo trì.",
    "error.globalTitle": "Ứng dụng gặp lỗi hệ thống",
    "error.globalDescription":
      "Renderer không thể tự khôi phục. Hãy thử lại một lần, sau đó báo lỗi nếu sự cố lặp lại.",
    "error.retry": "Thử lại",
    "error.backHome": "Về tổng quan",
    "error.report": "Báo lỗi",
    "error.reported": "Đã ghi nhận báo lỗi. Vui lòng liên hệ bảo trì nếu lỗi lặp lại.",
    "apiError.Invalid username or password":
      "Tên đăng nhập hoặc mật khẩu không đúng.",
    "apiError.Invalid session": "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
    "apiError.Missing bearer token": "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
    "apiError.Invalid bearer token": "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
    "apiError.User is not allowed": "Bạn không có quyền thực hiện thao tác này.",
    "apiError.Missing required permission":
      "Bạn không có quyền thực hiện thao tác này.",
    "apiError.Username already exists": "Tên đăng nhập đã tồn tại.",
    "apiError.Role is not assignable": "Vai trò này không thể gán.",
    "apiError.Only dev can create dev users":
      "Chỉ dev mới có thể tạo tài khoản developer.",
    "apiError.Only dev can update dev users":
      "Chỉ dev mới có thể cập nhật tài khoản developer.",
    "apiError.Only dev can assign dev role":
      "Chỉ dev mới có thể gán vai trò developer.",
    "apiError.Only dev can delete dev users":
      "Chỉ dev mới có thể xóa tài khoản developer.",
    "apiError.User not found": "Không tìm thấy user.",
    "apiError.Current user cannot delete own account":
      "Không thể xóa tài khoản đang đăng nhập.",
    "apiError.User has related records and cannot be deleted":
      "User này đã có dữ liệu liên quan nên không thể xóa.",
    "apiError.At least one admin account is required":
      "Hệ thống phải luôn còn ít nhất 1 tài khoản admin.",
    "apiError.At least one active admin account is required":
      "Hệ thống phải luôn còn ít nhất 1 tài khoản admin đang hoạt động.",
    "apiError.Only dev can manage the dev role":
      "Chỉ dev mới có thể quản lý vai trò developer.",
    "apiError.Only dev can manage protected roles":
      "Chỉ dev mới có thể quản lý các vai trò được bảo vệ.",
    "apiError.Product not found": "Không tìm thấy sản phẩm.",
    "apiError.Source product not found": "Không tìm thấy sản phẩm mẫu.",
    "apiError.Product code or name already exists":
      "Mã hoặc tên sản phẩm đã tồn tại.",
    "apiError.ROI indexes must be unique": "Thứ tự điểm ROI không được trùng.",
    "apiError.Target products are required":
      "Vui lòng chọn sản phẩm đích.",
    "apiError.No target products found": "Không tìm thấy sản phẩm đích.",
    "apiError.Windows virtual keyboard is only available on Windows":
      "Bàn phím ảo Windows chỉ khả dụng trên máy Windows.",
    "apiError.Windows virtual keyboard is not available on this machine":
      "Máy này không có sẵn bàn phím ảo Windows.",
    "apiError.Cannot open Windows virtual keyboard":
      "Không thể mở bàn phím ảo Windows.",
    "auth.signIn": "Đăng nhập",
    "auth.subtitle": "Dùng tài khoản vận hành nội bộ để tiếp tục.",
    "auth.username": "Tên đăng nhập",
    "auth.password": "Mật khẩu",
    "auth.login": "Đăng nhập",
    "auth.checking": "Đang kiểm tra...",
    "auth.signingIn": "Đang đăng nhập...",
    "auth.connectionError": "Không thể kết nối đến API local.",
    "login.runtime": "Môi trường chạy",
    "login.localPc": "Máy local",
    "login.api": "API",
    "login.security": "Bảo mật",
    "login.dongleGate": "Khóa dongle",
    "nav.dashboard": "Tổng quan",
    "nav.users": "Người dùng",
    "nav.roles": "Vai trò",
    "nav.products": "Sản phẩm",
    "nav.camera": "Camera",
    "nav.roi": "ROI",
    "nav.history": "Lịch sử",
    "nav.reports": "Báo cáo",
    "session.hiddenDev": "dev ẩn",
    "session.logout": "Đăng xuất",
    "dashboard.title": "Tổng quan",
    "dashboard.description": "Tổng quan trạng thái trạm kiểm tra local.",
    "dashboard.apiSession": "Kết nối API",
    "dashboard.connected": "Đã kết nối",
    "dashboard.inspection": "Kiểm tra",
    "dashboard.idle": "Đang chờ",
    "dashboard.okNg": "OK / NG",
    "dashboard.license": "Bản quyền",
    "dashboard.pending": "Chờ kiểm tra",
    "operator.title": "Vận hành line",
    "operator.description":
      "Chọn sản phẩm chạy trong ngày, xem preview line và bắt đầu kiểm tra.",
    "operator.productToday": "Sản phẩm hôm nay",
    "operator.sourceApi": "API",
    "operator.sourceDemo": "Mẫu",
    "operator.demoCamera": "Camera line mô phỏng",
    "operator.productsFallback":
      "Không thể tải profile sản phẩm. Đang dùng sản phẩm demo để test local.",
    "operator.soundBlocked": "Trình duyệt đã chặn âm thanh kiểm tra.",
    "operator.lineControls": "Điều khiển line",
    "operator.startLine": "Chạy line",
    "operator.stopLine": "Dừng line",
    "operator.runStarted": "Line đã bắt đầu chạy.",
    "operator.runStopped": "Line đã dừng.",
    "operator.running": "Đang chạy",
    "operator.stopped": "Đang dừng",
    "operator.auto": "Tự động",
    "operator.manual": "Thủ công",
    "operator.liveCamera": "Camera live",
    "operator.realTimeAi": "AI thời gian thực",
    "operator.cameraOn": "Camera bật",
    "operator.cameraOff": "Camera tắt",
    "operator.aiOn": "AI bật",
    "operator.aiOff": "AI tắt",
    "operator.counter": "Bộ đếm",
    "operator.ok": "OK",
    "operator.ng": "NG",
    "operator.total": "Tổng",
    "operator.batch": "Batch",
    "operator.count": "Số lượng",
    "operator.quantity": "Trong pack",
    "operator.packSize": "Số lượng một pack",
    "operator.savePackSize": "Lưu",
    "operator.savingPackSize": "Đang lưu...",
    "operator.packSizeSaved": "Đã lưu số lượng một batch.",
    "operator.targetQuantity": "Mục tiêu",
    "operator.lastResult": "Kết quả gần nhất",
    "operator.time": "Thời gian",
    "operator.livePreview": "Xem trước",
    "operator.currentProduct": "Sản phẩm",
    "operator.referenceImage": "Ảnh tham chiếu",
    "operator.grab": "Chụp ảnh",
    "operator.grabQueued": "Lệnh chụp ảnh đã sẵn sàng cho API camera sau này.",
    "operator.triggerOk": "Kích OK",
    "operator.triggerNg": "Kích NG",
    "operator.resetCounter": "Reset bộ đếm",
    "operator.resetDone": "Đã reset bộ đếm.",
    "products.title": "Sản phẩm",
    "products.description":
      "Quản lý profile sản phẩm gồm mã product, thông số camera, điểm ROI và công cụ áp profile mẫu.",
    "products.loadError": "Không thể tải danh sách profile sản phẩm.",
    "products.saveError": "Không thể lưu profile sản phẩm.",
    "products.deleteError": "Không thể xóa profile sản phẩm.",
    "products.applyError": "Không thể áp profile sản phẩm.",
    "products.createSuccess": "Đã tạo profile sản phẩm.",
    "products.updateSuccess": "Đã cập nhật profile sản phẩm.",
    "products.deleteSuccess": "Đã xóa profile sản phẩm.",
    "products.applySuccess": "Đã áp profile cho số sản phẩm:",
    "products.loading": "Đang tải profile sản phẩm...",
    "products.saving": "Đang lưu...",
    "products.deleting": "Đang xóa...",
    "products.applying": "Đang áp dụng...",
    "products.createProfile": "Tạo profile",
    "products.editProfile": "Sửa profile",
    "products.saveProfile": "Lưu profile",
    "products.profileHint":
      "Mỗi profile lưu mã sản phẩm, thông số camera và các điểm ROI.",
    "products.groupBasic": "Thông tin cơ bản",
    "products.groupProduct": "Sản phẩm",
    "products.groupCamera": "Camera",
    "products.groupRoi": "ROI",
    "products.groupStatus": "Trạng thái",
    "products.advancedProfile": "Nâng cao profile",
    "products.templateProfile": "Profile mẫu",
    "products.selectTemplate": "Chọn profile mẫu",
    "products.copyTemplate": "Copy mẫu",
    "products.copyTemplateHint":
      "Sao chép thông số sản phẩm, camera, ROI và trạng thái từ profile đã tạo trước đó.",
    "products.touchHint":
      "Màn hình này ưu tiên thao tác cảm ứng một màn hình và nhập liệu bằng bàn phím ảo.",
    "products.templateCopied": "Đã copy profile mẫu vào form.",
    "products.applyProfile": "Áp profile",
    "products.applyToAll": "Áp cho tất cả sản phẩm",
    "products.applyAllHint":
      "Camera và ROI sẽ được sao chép sang toàn bộ sản phẩm khác.",
    "products.applySelectedHint":
      "Camera và ROI chỉ được sao chép sang các mã sản phẩm đã chọn.",
    "products.confirmApplyTitle": "Xác nhận áp profile sản phẩm",
    "products.confirmApplyDescription":
      "Thông số camera và ROI từ profile mẫu sẽ ghi đè lên các sản phẩm đích.",
    "products.confirmApply": "Xác nhận áp dụng",
    "products.confirmDeleteTitle": "Xác nhận xóa sản phẩm",
    "products.confirmDeleteDescription":
      "Profile sản phẩm này sẽ bị xóa sau khi xác nhận:",
    "products.confirmDelete": "Xác nhận xóa",
    "products.listTitle": "Danh sách profile sản phẩm",
    "products.listHint":
      "Chọn mã sản phẩm đích tại đây trước khi áp một profile mẫu.",
    "products.emptyTitle": "Chưa có profile sản phẩm",
    "products.emptyDescription":
      "Tạo profile sản phẩm đầu tiên để cấu hình camera và ROI.",
    "products.select": "Chọn",
    "products.code": "Mã product",
    "products.name": "Tên sản phẩm",
    "products.defaultNumber": "Số mặc định",
    "products.batchSize": "Số lượng một batch",
    "products.exposure": "Exposure",
    "products.thresholdAccept": "Ngưỡng Accept",
    "products.thresholdMns": "Ngưỡng MNS",
    "products.modelPath": "Đường dẫn model",
    "products.camera": "Camera",
    "products.roi": "ROI",
    "products.status": "Trạng thái",
    "products.actions": "Thao tác",
    "products.active": "Hoạt động",
    "products.inactive": "Tạm khóa",
    "products.sourceType": "Nguồn camera",
    "products.deviceName": "Tên thiết bị",
    "products.cameraExposure": "Exposure camera",
    "products.zoomFactor": "Tỉ lệ zoom",
    "products.imageWidth": "Rộng ảnh",
    "products.imageHeight": "Cao ảnh",
    "products.offsetX": "Offset X",
    "products.offsetY": "Offset Y",
    "products.roiIndex": "Vùng",
    "products.addRoiPoint": "Thêm vùng",
    "products.removeRoiPoint": "Xóa vùng",
    "products.roiPreviewHint":
      "Vẽ và chỉnh vùng ROI hình chữ nhật trực tiếp trên preview camera tỷ lệ 3000x1000.",
    "products.drawRoiHint": "Kéo trực tiếp trên preview để vẽ vùng ROI mới.",
    "products.roiShortcutHint":
      "Chọn một ROI, sau đó dùng Ctrl+C/Ctrl+V để copy và dán, Delete/Backspace để xóa, Ctrl+Z/Ctrl+Y để hoàn tác và làm lại.",
    "products.roiLimit": "vùng ROI",
    "products.undoRoi": "Hoàn tác thay đổi ROI",
    "products.redoRoi": "Làm lại thay đổi ROI",
    "products.rotateRoi": "Kéo để xoay",
    "products.resizeRoi": "Kéo để đổi kích thước",
    "products.rotateLeft": "Xoay trái",
    "products.rotateRight": "Xoay phải",
    "products.selectRoiFirst": "Vui lòng chọn ROI trước.",
    "products.copyRoiFirst": "Vui lòng copy ROI trước.",
    "products.roiCopied": "Đã copy ROI.",
    "products.roiPasted": "Đã dán ROI.",
    "products.roiDeleted": "Đã xóa ROI.",
    "products.duplicateRoi": "Nhân bản ROI",
    "products.deleteSelectedRoi": "Xóa ROI",
    "products.undoApplied": "Đã hoàn tác thay đổi ROI.",
    "products.redoApplied": "Đã làm lại thay đổi ROI.",
    "products.undoUnavailable": "Không có thay đổi ROI để hoàn tác.",
    "products.redoUnavailable": "Không có thay đổi ROI để làm lại.",
    "products.roiAssistStraight": "Góc đã bắt vào mốc thẳng.",
    "products.roiAssistAligned": "ROI đã căn hàng với vùng khác.",
    "products.roiAssistEqualSpacing": "Khoảng cách ROI gần bằng nhau.",
    "products.validationCode": "Mã product là bắt buộc.",
    "products.validationName": "Tên sản phẩm là bắt buộc.",
    "products.validationBatchSize": "Số lượng một batch phải lớn hơn hoặc bằng 1.",
    "products.validationRoi": "Cần ít nhất 1 vùng ROI.",
    "products.validationMaxRoi": "Mỗi profile chỉ được có tối đa 5 vùng ROI.",
    "products.validationRoiOverlap":
      "Các vùng ROI không được chồng lên nhau. Vui lòng tách vùng trước khi lưu.",
    "products.validationTemplate": "Vui lòng chọn profile mẫu trước.",
    "products.edit": "Sửa",
    "products.delete": "Xóa",
    "roles.title": "Phân quyền vai trò",
    "roles.description":
      "Cấp quyền chức năng theo vai trò. Phân quyền riêng theo user sẽ bổ sung sau.",
    "roles.roles": "Vai trò",
    "roles.loading": "Đang tải danh sách quyền...",
    "roles.devHidden": "Vai trò Developer được ẩn với người dùng thông thường.",
    "roles.normalHint": "Thay đổi áp dụng cho user chưa có quyền riêng.",
    "roles.save": "Lưu thay đổi",
    "roles.saving": "Đang lưu...",
    "roles.saved": "Đã cập nhật quyền vai trò.",
    "roles.loadError": "Không thể tải quyền vai trò.",
    "roles.updateError": "Không thể cập nhật quyền vai trò.",
    "roles.devOnly": "chỉ dành cho dev",
    "roles.noManageableRoles": "Không có vai trò nào được phép quản lý.",
    "users.title": "Người dùng",
    "users.description":
      "Tạo tài khoản, kiểm tra trạng thái truy cập và giữ phân quyền đúng theo backend.",
    "users.loadError": "Không thể tải danh sách user.",
    "users.createError": "Không thể tạo user.",
    "users.updateError": "Không thể cập nhật user.",
    "users.deleteError": "Không thể xóa user.",
    "users.createSuccess": "Đã tạo tài khoản người dùng.",
    "users.updateSuccess": "Đã cập nhật tài khoản người dùng.",
    "users.deleteSuccess": "Đã xóa tài khoản người dùng.",
    "users.refreshSuccess": "Đã làm mới danh sách user.",
    "users.missingSession": "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
    "users.username": "Tên đăng nhập",
    "users.password": "Mật khẩu",
    "users.fullName": "Họ tên",
    "users.fullNamePlaceholder": "Kỹ sư 1",
    "users.department": "Bộ phận",
    "users.departmentPlaceholder": "Kỹ thuật",
    "users.employeeNo": "Mã nhân viên",
    "users.role": "Vai trò",
    "users.status": "Trạng thái",
    "users.lastLogin": "Đăng nhập gần nhất",
    "users.active": "Hoạt động",
    "users.inactive": "Tạm khóa",
    "users.activeHint": "Tài khoản có thể đăng nhập sau khi được tạo.",
    "users.advancedTab": "Nâng cao",
    "users.showAdvanced": "Hiện",
    "users.hideAdvanced": "Ẩn",
    "users.create": "Tạo user",
    "users.creating": "Đang tạo user...",
    "users.saving": "Đang lưu thay đổi...",
    "users.deleting": "Đang xóa user...",
    "users.refresh": "Làm mới",
    "users.refreshing": "Đang làm mới...",
    "users.managementTitle": "Quản trị tài khoản",
    "users.managementHint":
      "Tạo tài khoản từ thanh thao tác và kiểm tra user hiện có trong bảng bên dưới.",
    "users.actions": "Thao tác",
    "users.edit": "Sửa",
    "users.delete": "Xóa",
    "users.editTitle": "Sửa tài khoản",
    "users.saveChanges": "Lưu thay đổi",
    "users.confirmUpdateTitle": "Xác nhận cập nhật tài khoản",
    "users.confirmUpdateDescription":
      "Vui lòng xác nhận trước khi áp dụng thay đổi tài khoản.",
    "users.confirmUpdate": "Xác nhận cập nhật",
    "users.confirmDeleteTitle": "Xác nhận xóa tài khoản",
    "users.confirmDeleteDescription":
      "Tài khoản này sẽ bị xóa sau khi xác nhận:",
    "users.confirmDelete": "Xác nhận xóa",
    "users.quickToggleStatus": "Đổi trạng thái tài khoản",
    "users.confirmStatusTitle": "Xác nhận đổi trạng thái tài khoản",
    "users.confirmStatusDescription":
      "Vui lòng xác nhận trước khi đổi trạng thái cho:",
    "users.confirmStatus": "Xác nhận đổi trạng thái",
    "users.createTitle": "Tạo tài khoản",
    "users.createHint": "Vai trò có thể gán được lấy từ API local.",
    "users.assignableRoleHint":
      "Backend tự ẩn vai trò được bảo vệ với admin thông thường.",
    "users.noAssignableRoles": "Không có vai trò có thể gán",
    "users.listTitle": "Danh sách tài khoản",
    "users.listHint": "Chỉ hiển thị user mà người quản lý hiện tại được phép xem.",
    "users.emptyTitle": "Chưa có tài khoản user",
    "users.emptyDescription":
      "Tạo tài khoản operator hoặc engineer đầu tiên để bắt đầu quản lý truy cập.",
    "users.totalAccounts": "Tổng",
    "users.activeAccounts": "Hoạt động",
    "users.inactiveAccounts": "Tạm khóa",
    "users.visibleRoles": "Vai trò",
    "users.live": "Live",
    "users.validationUsername": "Tên đăng nhập phải có ít nhất 3 ký tự.",
    "users.validationPassword": "Mật khẩu phải có ít nhất 6 ký tự.",
    "users.validationFullName": "Họ tên là bắt buộc.",
    "users.validationRole": "Vui lòng chọn vai trò.",
    "users.virtualKeyboard": "Bàn phím ảo",
    "users.virtualKeyboardOpening": "Đang mở bàn phím...",
    "users.virtualKeyboardOpenSuccess": "Đã mở bàn phím ảo Windows.",
    "users.virtualKeyboardOpenError": "Không thể mở bàn phím ảo Windows.",
    "role.dev": "Developer",
    "role.admin": "Admin",
    "role.engineer": "Kỹ sư",
    "role.operator": "Công nhân",
    "permission.user.manage": "Quản lý người dùng",
    "permission.role.manage": "Quản lý vai trò",
    "permission.permission.manage": "Quản lý quyền",
    "permission.product.manage": "Quản lý sản phẩm",
    "permission.camera.manage": "Quản lý cấu hình camera",
    "permission.roi.edit": "Chỉnh sửa ROI",
    "permission.inspection.start": "Bắt đầu kiểm tra",
    "permission.inspection.stop": "Dừng kiểm tra",
    "permission.inspection.override": "Ghi đè kết quả kiểm tra",
    "permission.history.view": "Xem lịch sử",
    "permission.report.view": "Xem báo cáo",
    "permission.system.shutdown": "Tắt hệ thống",
    "permission.system.debug": "Debug hệ thống",
    "permission.license.view": "Xem trạng thái bản quyền",
    "permission.group.user": "Người dùng",
    "permission.group.role": "Vai trò",
    "permission.group.product": "Sản phẩm",
    "permission.group.camera": "Camera",
    "permission.group.inspection": "Kiểm tra",
    "permission.group.history": "Lịch sử",
    "permission.group.report": "Báo cáo",
    "permission.group.system": "Hệ thống",
  },
} as const;

export type TranslationKey = keyof typeof translations.en;

type I18nContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string) => string;
  apiError: (message: string, fallbackKey: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("vi");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const storedLanguage = localStorage.getItem(
        LANGUAGE_KEY,
      ) as Language | null;

      if (storedLanguage === "en" || storedLanguage === "vi") {
        setLanguageState(storedLanguage);
      }

      setReady(true);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (!ready) {
      return;
    }

    localStorage.setItem(LANGUAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language, ready]);

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      setLanguage: setLanguageState,
      t: (key) => {
        const currentTranslations = translations[language] as Record<
          string,
          string
        >;
        const englishTranslations = translations.en as Record<string, string>;

        return currentTranslations[key] ?? englishTranslations[key] ?? key;
      },
      apiError: (message, fallbackKey) => {
        const currentTranslations = translations[language] as Record<
          string,
          string
        >;
        const englishTranslations = translations.en as Record<string, string>;
        const normalizedMessage = message.trim();
        const apiErrorKey = `apiError.${normalizedMessage}`;

        return (
          currentTranslations[apiErrorKey] ??
          englishTranslations[apiErrorKey] ??
          currentTranslations[fallbackKey] ??
          englishTranslations[fallbackKey] ??
          normalizedMessage
        );
      },
    }),
    [language],
  );

  return (
    <I18nContext.Provider value={value}>
      {ready ? (
        children
      ) : (
        <main className="flex min-h-[100dvh] items-center justify-center bg-slate-100 text-slate-950">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
        </main>
      )}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider");
  }

  return context;
}
