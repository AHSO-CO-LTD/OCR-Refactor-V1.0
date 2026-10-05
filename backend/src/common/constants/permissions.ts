export const PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard.view',
  USER_MANAGE: 'user.manage',
  ROLE_MANAGE: 'role.manage',
  PERMISSION_MANAGE: 'permission.manage',
  PRODUCT_MANAGE: 'product.manage',
  ROI_EDIT: 'roi.edit',
  CAMERA_MANAGE: 'camera.manage',
  CAMERA_IDENTITY_MANAGE: 'camera.identity.manage',
  CAMERA_DEBUG_VIEW: 'camera.debug.view',
  PLC_MANAGE: 'plc.manage',
  PLC_OPERATE: 'plc.operate',
  INSPECTION_START: 'inspection.start',
  INSPECTION_STOP: 'inspection.stop',
  INSPECTION_TEST: 'inspection.test',
  REPORT_VIEW: 'report.view',
  SYSTEM_SHUTDOWN: 'system.shutdown',
  SYSTEM_DEBUG: 'system.debug',
  LICENSE_VIEW: 'license.view',
  DONGIL_HISTORY_SYNC_VIEW: 'dongil.history-sync.view',
  DONGIL_HISTORY_SYNC_MANAGE: 'dongil.history-sync.manage',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
