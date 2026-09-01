import AppKit
import CoreGraphics
import Foundation
import KWWKComputerUseCore
import QuartzCore

final class BridgeComputerUseVisualEffects: ComputerUseVisualEffectHook, @unchecked Sendable {
  private let delegate: AppKitComputerUseVisualEffects
  private let trail: CursorTrailOverlay

  @MainActor
  init(
    delegate: AppKitComputerUseVisualEffects = AppKitComputerUseVisualEffects(),
    trail: CursorTrailOverlay = CursorTrailOverlay()
  ) {
    self.delegate = delegate
    self.trail = trail
  }

  func perform<T>(
    _ event: ComputerUseVisualEffectEvent,
    action: () throws -> T
  ) throws -> T {
    let capturesTrail: Bool
    if cursorTrailIsEligible(for: event) {
      capturesTrail = try runOnMain {
        guard NSWorkspace.shared.accessibilityDisplayShouldReduceMotion == false else {
          DaemonCursor.shared.onPoseApplied = nil
          self.trail.finish()
          return false
        }

        guard self.trail.begin(forWindowID: event.windowID) else {
          DaemonCursor.shared.onPoseApplied = nil
          return false
        }
        DaemonCursor.shared.onPoseApplied = { [weak trail = self.trail] point in
          guard Thread.isMainThread else { return }
          MainActor.assumeIsolated {
            trail?.append(screenPoint: point)
          }
        }
        return true
      }
    } else {
      capturesTrail = false
      try? runOnMain {
        DaemonCursor.shared.onPoseApplied = nil
      }
    }

    defer {
      if capturesTrail {
        try? runOnMain {
          self.trail.end()
          DaemonCursor.shared.onPoseApplied = nil
        }
      }
    }

    return try delegate.perform(event, action: action)
  }

  func finish() {
    try? runOnMain {
      DaemonCursor.shared.onPoseApplied = nil
      self.trail.finish()
    }
    delegate.finish()
  }

  private func runOnMain<T>(_ body: @MainActor () throws -> T) throws -> T {
    try withoutActuallyEscaping(body) { escapable in
      if Thread.isMainThread {
        let unchecked = unsafeBitCast(escapable, to: (() throws -> T).self)
        return try unchecked()
      }

      let operation = BridgeMainSyncOperation(escapable)
      DispatchQueue.main.sync {
        operation.run()
      }
      return try operation.result!.get()
    }
  }
}

struct CursorTrailRoute: Equatable, Sendable {
  static let maximumPointCount = 96
  static let minimumPointDistance: CGFloat = 1

  private(set) var points: [CGPoint] = []

  mutating func reset() {
    points.removeAll(keepingCapacity: true)
  }

  @discardableResult
  mutating func append(_ point: CGPoint) -> Bool {
    if let last = points.last {
      let distance = hypot(point.x - last.x, point.y - last.y)
      guard distance >= Self.minimumPointDistance else {
        return false
      }
    }

    if points.count == Self.maximumPointCount {
      points.removeFirst()
    }
    points.append(point)
    return true
  }
}

func cursorTrailIsEligible(for event: ComputerUseVisualEffectEvent) -> Bool {
  guard event.surfaceKind == .window else {
    return false
  }

  switch event.action {
  case .targetWindow, .click, .scroll, .drag, .accessibilityAction:
    return true
  case .keyboard:
    return false
  }
}

func cursorTrailDesktopFrame(for screenFrames: [CGRect]) -> CGRect? {
  guard let first = screenFrames.first else {
    return nil
  }

  return screenFrames.dropFirst().reduce(first) { result, frame in
    result.union(frame)
  }
}

func cursorTrailPanelPoint(for screenPoint: CGPoint, in desktopFrame: CGRect) -> CGPoint {
  CGPoint(
    x: screenPoint.x - desktopFrame.minX,
    y: screenPoint.y - desktopFrame.minY
  )
}

@MainActor
private final class CursorTrailPanel: NSPanel {
  override var canBecomeKey: Bool { false }

  override var canBecomeMain: Bool { false }
}

@MainActor
final class CursorTrailOverlay {
  private static let maximumOpacity: Float = 0.42
  private static let fadeDuration: TimeInterval = 0.24

  private let contentView = NSView(frame: .zero)
  private let trailLayer = CAShapeLayer()
  private var panel: CursorTrailPanel?
  private var desktopFrame: CGRect = .zero
  private var route = CursorTrailRoute()
  private var hideWorkItem: DispatchWorkItem?
  private var isCapturing = false

  init() {
    contentView.wantsLayer = true
    contentView.layer?.addSublayer(trailLayer)

    trailLayer.fillColor = nil
    trailLayer.strokeColor = NSColor.systemTeal.cgColor
    trailLayer.lineWidth = 2
    trailLayer.lineCap = .round
    trailLayer.lineJoin = .round
    trailLayer.opacity = 0
  }

  @discardableResult
  func begin(forWindowID windowID: Int) -> Bool {
    hideWorkItem?.cancel()
    hideWorkItem = nil
    trailLayer.removeAnimation(forKey: Self.fadeAnimationKey)

    guard let frame = cursorTrailDesktopFrame(for: NSScreen.screens.map(\.frame)) else {
      isCapturing = false
      panel?.orderOut(nil)
      return false
    }

    isCapturing = true
    desktopFrame = frame
    route.reset()
    updatePath()
    setOpacity(Self.maximumOpacity)

    let panel = ensurePanel(frame: frame)
    panel.setFrame(frame, display: false)
    contentView.frame = CGRect(origin: .zero, size: frame.size)
    trailLayer.frame = contentView.bounds
    order(panel, aboveWindowID: windowID)
    panel.displayIfNeeded()
    return true
  }

  func append(screenPoint: CGPoint) {
    guard isCapturing else { return }
    guard route.append(cursorTrailPanelPoint(for: screenPoint, in: desktopFrame)) else {
      return
    }
    updatePath()
  }

  func end() {
    guard isCapturing || panel != nil else { return }
    isCapturing = false
    trailLayer.removeAnimation(forKey: Self.fadeAnimationKey)

    let fade = CABasicAnimation(keyPath: "opacity")
    fade.fromValue = trailLayer.presentation()?.opacity ?? trailLayer.opacity
    fade.toValue = 0
    fade.duration = Self.fadeDuration
    setOpacity(0)
    trailLayer.add(fade, forKey: Self.fadeAnimationKey)

    let workItem = DispatchWorkItem { [weak self] in
      guard Thread.isMainThread else { return }
      MainActor.assumeIsolated {
        guard let self, self.isCapturing == false else { return }
        self.hideWorkItem = nil
        self.panel?.orderOut(nil)
        self.route.reset()
        self.updatePath()
      }
    }
    hideWorkItem = workItem
    DispatchQueue.main.asyncAfter(
      deadline: .now() + Self.fadeDuration,
      execute: workItem
    )
  }

  func finish() {
    isCapturing = false
    hideWorkItem?.cancel()
    hideWorkItem = nil
    trailLayer.removeAllAnimations()
    panel?.orderOut(nil)
    panel?.close()
    panel = nil
    route.reset()
    updatePath()
    desktopFrame = .zero
  }

  private func ensurePanel(frame: CGRect) -> CursorTrailPanel {
    if let panel {
      return panel
    }

    let panel = CursorTrailPanel(
      contentRect: frame,
      styleMask: [.borderless, .nonactivatingPanel],
      backing: .buffered,
      defer: false
    )
    panel.backgroundColor = .clear
    panel.isOpaque = false
    panel.hasShadow = false
    panel.ignoresMouseEvents = true
    panel.animationBehavior = .none
    panel.collectionBehavior = [
      .canJoinAllSpaces,
      .fullScreenAuxiliary,
      .stationary,
      .ignoresCycle
    ]
    panel.contentView = contentView
    self.panel = panel
    return panel
  }

  private func order(_ panel: CursorTrailPanel, aboveWindowID windowID: Int) {
    let fallbackLevel = Int(CGWindowLevelForKey(.normalWindow))
    let level = windowLayer(forWindowID: windowID) ?? fallbackLevel
    panel.level = NSWindow.Level(rawValue: level)

    guard windowID > 0 else {
      panel.orderOut(nil)
      return
    }
    panel.order(.above, relativeTo: windowID)
  }

  private func windowLayer(forWindowID windowID: Int) -> Int? {
    guard
      windowID > 0,
      let rows = CGWindowListCopyWindowInfo(
        [.optionIncludingWindow],
        CGWindowID(windowID)
      ) as? [[String: Any]],
      let row = rows.first
    else {
      return nil
    }

    return row[kCGWindowLayer as String] as? Int
  }

  private func updatePath() {
    let path: CGPath?
    if let first = route.points.first {
      let newPath = CGMutablePath()
      newPath.move(to: first)
      for point in route.points.dropFirst() {
        newPath.addLine(to: point)
      }
      path = newPath
    } else {
      path = nil
    }

    CATransaction.begin()
    CATransaction.setDisableActions(true)
    trailLayer.path = path
    CATransaction.commit()
  }

  private func setOpacity(_ opacity: Float) {
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    trailLayer.opacity = opacity
    CATransaction.commit()
  }

  private static let fadeAnimationKey = "kwwk.cursor-trail.fade"
}

private final class BridgeMainSyncOperation<T>: @unchecked Sendable {
  private let body: @MainActor () throws -> T
  var result: Result<T, Error>?

  init(_ body: @escaping @MainActor () throws -> T) {
    self.body = body
  }

  func run() {
    let unchecked = unsafeBitCast(body, to: (() throws -> T).self)
    result = Result { try unchecked() }
  }
}
