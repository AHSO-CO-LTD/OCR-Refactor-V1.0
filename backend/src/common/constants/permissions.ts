export const PERMISSIONS = {
  USER_MANAGE: 'user.manage',
  ROLE_MANAGE: 'role.manage',
  PERMISSION_MANAGE: 'permission.manage',
  PRODUCT_MANAGE: 'product.manage',
  CAMERA_MANAGE: 'camera.manage',
  ROI_EDIT: 'roi.edit',
  INSPECTION_START: 'inspection.start',
  INSPECTION_STOP: 'inspection.stop',
  INSPECTION_OVERRIDE: 'inspection.override',
  HISTORY_VIEW: 'history.view',
  REPORT_VIEW: 'report.view',
  SYSTEM_SHUTDOWN: 'system.shutdown',
  SYSTEM_DEBUG: 'system.debug',
  LICENSE_VIEW: 'license.view',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
