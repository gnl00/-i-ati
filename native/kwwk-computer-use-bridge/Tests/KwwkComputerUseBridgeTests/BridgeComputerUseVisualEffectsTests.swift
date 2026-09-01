import CoreGraphics
import XCTest
import KWWKComputerUseCore
@testable import KwwkComputerUseBridgeCore

final class BridgeComputerUseVisualEffectsTests: XCTestCase {
  func testEligibleWindowActionsCaptureTheCursorTrail() {
    for action in [
      ComputerUseVisualEffectAction.targetWindow,
      .click,
      .scroll,
      .drag,
      .accessibilityAction
    ] {
      XCTAssertTrue(
        cursorTrailIsEligible(for: event(action: action)),
        "Expected \(action.rawValue) to capture a window trail"
      )
    }
  }

  func testKeyboardAndNonWindowSurfacesSkipTheCursorTrail() {
    XCTAssertFalse(cursorTrailIsEligible(for: event(action: .keyboard)))
    XCTAssertFalse(
      cursorTrailIsEligible(
        for: event(action: .click, surfaceKind: .status)
      )
    )
    XCTAssertFalse(
      cursorTrailIsEligible(
        for: event(action: .click, surfaceKind: .menu)
      )
    )
  }

  func testPanelPointPreservesNegativeDesktopOrigins() {
    let desktopFrame = CGRect(x: -1440, y: -180, width: 3360, height: 1980)
    let screenPoint = CGPoint(x: -1080, y: 420)

    XCTAssertEqual(
      cursorTrailPanelPoint(for: screenPoint, in: desktopFrame),
      CGPoint(x: 360, y: 600)
    )
  }

  func testRouteSkipsNearDuplicatesAndRetainsAtMost96Points() {
    var route = CursorTrailRoute()

    XCTAssertTrue(route.append(CGPoint.zero))
    XCTAssertFalse(route.append(CGPoint(x: 0.5, y: 0.5)))
    XCTAssertTrue(route.append(CGPoint(x: 1, y: 0)))

    for index in 0..<120 {
      XCTAssertTrue(route.append(CGPoint(x: CGFloat(index + 2), y: 0)))
    }

    XCTAssertEqual(route.points.count, CursorTrailRoute.maximumPointCount)
    XCTAssertEqual(route.points.last, CGPoint(x: 121, y: 0))
  }

  private func event(
    action: ComputerUseVisualEffectAction,
    surfaceKind: ComputerUseVisualEffectSurfaceKind = .window
  ) -> ComputerUseVisualEffectEvent {
    ComputerUseVisualEffectEvent(
      action: action,
      surfaceKind: surfaceKind,
      windowID: 42,
      windowFrame: CGRectCodable(CGRect(x: 0, y: 0, width: 800, height: 600))
    )
  }
}
