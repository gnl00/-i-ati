export const computerUseActions = {
  status: { required: [], optional: [] },
  request_permissions: { required: [], optional: [] },
  apps: { required: [], optional: [] },
  running_apps: { required: [], optional: [] },
  open_app: { required: ['app'], optional: [] },
  windows: { required: ['app'], optional: [] },
  state: {
    required: ['app'],
    optional: ['windowTitle', 'windowId', 'includeScreenshot']
  },
  click_element: {
    required: ['snapshotId', 'elementIndex'],
    optional: ['includeScreenshotAfter']
  },
  click_coordinate: {
    required: ['snapshotId', 'x', 'y'],
    optional: ['includeScreenshotAfter']
  },
  type_text: {
    required: ['snapshotId', 'text'],
    optional: ['elementIndex', 'includeScreenshotAfter']
  },
  set_value: {
    required: ['snapshotId', 'elementIndex', 'value'],
    optional: ['includeScreenshotAfter']
  },
  press_key: {
    required: ['snapshotId', 'key'],
    optional: ['includeScreenshotAfter']
  },
  scroll: {
    required: ['snapshotId', 'elementIndex', 'direction'],
    optional: ['pages', 'includeScreenshotAfter']
  },
  drag: {
    required: ['snapshotId', 'fromX', 'fromY', 'toX', 'toY'],
    optional: ['includeScreenshotAfter']
  },
  finish: { required: [], optional: [] }
} as const

export type ComputerUseAction = keyof typeof computerUseActions
