import XCTest
@testable import KwwkComputerUseBridgeCore

final class BridgeProtocolTests: XCTestCase {
  func testDecodesStringIdRequest() throws {
    let request = try JSONDecoder().decode(
      BridgeRequest.self,
      from: #"{"jsonrpc":"2.0","id":"1","method":"state","params":{"app":"Finder","includeScreenshot":true}}"#.data(using: .utf8)!
    )

    XCTAssertEqual(request.id, .string("1"))
    XCTAssertEqual(request.method, "state")
    XCTAssertEqual(try request.params?.string("app"), "Finder")
    XCTAssertEqual(try request.params?.optionalBool("includeScreenshot"), true)
  }

  func testDecodesIntegerIdRequest() throws {
    let request = try JSONDecoder().decode(
      BridgeRequest.self,
      from: #"{"jsonrpc":"2.0","id":7,"method":"runningApps","params":{}}"#.data(using: .utf8)!
    )

    XCTAssertEqual(request.id, .int(7))
    XCTAssertEqual(request.method, "runningApps")
  }

  func testEncodesFailureResponse() throws {
    let data = try JSONEncoder().encode(BridgeFailure(
      id: .string("1"),
      error: .invalidParams("missing app")
    ))
    let text = String(decoding: data, as: UTF8.self)

    XCTAssertTrue(text.contains(#""jsonrpc":"2.0""#))
    XCTAssertTrue(text.contains(#""code":"INVALID_PARAMS""#))
    XCTAssertTrue(text.contains(#""message":"missing app""#))
  }

  func testEncodesRuntimeDiagnostics() throws {
    let data = try JSONEncoder().encode(BridgeRuntimeDiagnostics(
      helperPath: "/tmp/kwwk-computer-use-bridge",
      processIdentifier: 123,
      permissions: BridgePermissionDiagnostics(
        accessibilityTrusted: false,
        screenCaptureTrusted: true
      ),
      codeSigning: BridgeCodeSigningDiagnostics(
        signed: true,
        identifier: "com.example.bridge",
        teamIdentifier: "TEAMID",
        error: nil
      )
    ))
    let decoded = try JSONDecoder().decode(BridgeRuntimeDiagnostics.self, from: data)

    XCTAssertEqual(decoded.helperPath, "/tmp/kwwk-computer-use-bridge")
    XCTAssertEqual(decoded.permissions.accessibilityTrusted, false)
    XCTAssertEqual(decoded.permissions.screenCaptureTrusted, true)
    XCTAssertEqual(decoded.codeSigning.teamIdentifier, "TEAMID")
  }
}
