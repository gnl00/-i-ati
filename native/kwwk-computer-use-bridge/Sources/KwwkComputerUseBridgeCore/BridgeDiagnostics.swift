import ApplicationServices
import CoreGraphics
import Foundation
import Security

public struct BridgeCodeSigningDiagnostics: Codable, Equatable, Sendable {
  public let signed: Bool
  public let identifier: String?
  public let teamIdentifier: String?
  public let error: String?
}

public struct BridgePermissionDiagnostics: Codable, Equatable, Sendable {
  public let accessibilityTrusted: Bool
  public let screenCaptureTrusted: Bool
}

public struct BridgeRuntimeDiagnostics: Codable, Equatable, Sendable {
  public let helperPath: String
  public let processIdentifier: Int32
  public let permissions: BridgePermissionDiagnostics
  public let codeSigning: BridgeCodeSigningDiagnostics
}

public enum BridgeDiagnostics {
  public static func runtime() -> BridgeRuntimeDiagnostics {
    BridgeRuntimeDiagnostics(
      helperPath: CommandLine.arguments.first ?? "",
      processIdentifier: ProcessInfo.processInfo.processIdentifier,
      permissions: permissions(prompt: false),
      codeSigning: codeSigning()
    )
  }

  public static func requestPermissions() -> BridgePermissionDiagnostics {
    permissions(prompt: true)
  }

  private static func permissions(prompt: Bool) -> BridgePermissionDiagnostics {
    let accessibilityTrusted: Bool
    if prompt {
      let options = [
        "AXTrustedCheckOptionPrompt": true
      ] as CFDictionary
      accessibilityTrusted = AXIsProcessTrustedWithOptions(options)
    } else {
      accessibilityTrusted = AXIsProcessTrusted()
    }

    let screenCaptureTrusted: Bool
    if prompt {
      screenCaptureTrusted = CGRequestScreenCaptureAccess()
    } else {
      screenCaptureTrusted = CGPreflightScreenCaptureAccess()
    }

    return BridgePermissionDiagnostics(
      accessibilityTrusted: accessibilityTrusted,
      screenCaptureTrusted: screenCaptureTrusted
    )
  }

  private static func codeSigning() -> BridgeCodeSigningDiagnostics {
    var selfCode: SecCode?
    let selfStatus = SecCodeCopySelf([], &selfCode)
    guard selfStatus == errSecSuccess, let selfCode else {
      return BridgeCodeSigningDiagnostics(
        signed: false,
        identifier: nil,
        teamIdentifier: nil,
        error: "SecCodeCopySelf failed: \(selfStatus)"
      )
    }

    var staticCode: SecStaticCode?
    let staticStatus = SecCodeCopyStaticCode(selfCode, [], &staticCode)
    guard staticStatus == errSecSuccess, let staticCode else {
      return BridgeCodeSigningDiagnostics(
        signed: false,
        identifier: nil,
        teamIdentifier: nil,
        error: "SecCodeCopyStaticCode failed: \(staticStatus)"
      )
    }

    var info: CFDictionary?
    let infoStatus = SecCodeCopySigningInformation(
      staticCode,
      SecCSFlags(rawValue: kSecCSSigningInformation),
      &info
    )
    guard infoStatus == errSecSuccess, let info = info as? [String: Any] else {
      return BridgeCodeSigningDiagnostics(
        signed: false,
        identifier: nil,
        teamIdentifier: nil,
        error: "SecCodeCopySigningInformation failed: \(infoStatus)"
      )
    }

    let identifier = info[kSecCodeInfoIdentifier as String] as? String
    let teamIdentifier = info[kSecCodeInfoTeamIdentifier as String] as? String

    return BridgeCodeSigningDiagnostics(
      signed: true,
      identifier: identifier,
      teamIdentifier: teamIdentifier,
      error: nil
    )
  }
}
