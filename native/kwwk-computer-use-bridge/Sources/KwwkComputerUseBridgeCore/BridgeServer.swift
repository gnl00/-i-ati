import Foundation
import AppKit
import KWWKComputerUseCore

public struct AnyEncodable: Encodable {
  private let encodeValue: (Encoder) throws -> Void

  public init<T: Encodable>(_ value: T) {
    self.encodeValue = value.encode(to:)
  }

  public func encode(to encoder: Encoder) throws {
    try encodeValue(encoder)
  }
}

@MainActor
public final class BridgeServer {
  private let client: ComputerUseClient
  private let encoder: JSONEncoder
  private let decoder: JSONDecoder

  public init(
    client: ComputerUseClient = ComputerUseClient(),
    encoder: JSONEncoder = JSONEncoder(),
    decoder: JSONDecoder = JSONDecoder()
  ) {
    self.client = client
    self.encoder = encoder
    self.decoder = decoder
  }

  public func handle(line: String) async -> String {
    let request: BridgeRequest
    do {
      request = try decoder.decode(BridgeRequest.self, from: Data(line.utf8))
    } catch {
      return encodeFailure(id: nil, error: .decodeFailed(String(describing: error)))
    }

    do {
      let result = try await dispatch(request)
      return try encodeSuccess(id: request.id, result: result)
    } catch let error as BridgeError {
      return encodeFailure(id: request.id, error: error)
    } catch {
      return encodeFailure(id: request.id, error: .actionFailed(error))
    }
  }

  private func dispatch(_ request: BridgeRequest) async throws -> AnyEncodable {
    let params = request.params ?? [:]

    switch request.method {
    case "diagnostics":
      return AnyEncodable(BridgeDiagnostics.runtime())

    case "requestPermissions":
      return AnyEncodable(BridgeDiagnostics.requestPermissions())

    case "apps":
      return AnyEncodable(client.apps().map(BridgeAppDescriptor.init))

    case "runningApps":
      return AnyEncodable(client.runningApps().map(BridgeRunningAppDescriptor.init))

    case "openApp":
      return try await AnyEncodable(openApp(params.string("app")))

    case "windows":
      return try AnyEncodable(client.windows(app: params.string("app")).map(BridgeWindowDescriptor.init))

    case "state":
      return try AnyEncodable(client.state(
        app: params.string("app"),
        windowTitle: try params.optionalString("windowTitle"),
        windowID: try params.optionalInt("windowId"),
        includeScreenshot: try params.optionalBool("includeScreenshot")
      ))

    case "click":
      _ = try params.string("snapshotId")
      if let elementIndex = try params.optionalInt("elementIndex") {
        return try await AnyEncodable(client.click(
          elementIndex: elementIndex,
          includeScreenshotAfter: try params.optionalBool("includeScreenshotAfter")
        ))
      }
      return try await AnyEncodable(client.click(
        x: params.double("x"),
        y: params.double("y"),
        includeScreenshotAfter: try params.optionalBool("includeScreenshotAfter")
      ))

    case "typeText":
      _ = try params.string("snapshotId")
      return try await AnyEncodable(client.typeText(
        text: params.string("text"),
        elementIndex: try params.optionalInt("elementIndex"),
        includeScreenshotAfter: try params.optionalBool("includeScreenshotAfter")
      ))

    case "setValue":
      _ = try params.string("snapshotId")
      return try await AnyEncodable(client.setValue(
        elementIndex: params.int("elementIndex"),
        value: params.string("value"),
        includeScreenshotAfter: try params.optionalBool("includeScreenshotAfter")
      ))

    case "pressKey":
      _ = try params.string("snapshotId")
      return try await AnyEncodable(client.pressKey(
        key: params.string("key"),
        includeScreenshotAfter: try params.optionalBool("includeScreenshotAfter")
      ))

    case "scroll":
      _ = try params.string("snapshotId")
      return try await AnyEncodable(client.scroll(
        elementIndex: params.int("elementIndex"),
        direction: params.string("direction"),
        pages: try params.optionalDouble("pages", default: 1),
        includeScreenshotAfter: try params.optionalBool("includeScreenshotAfter")
      ))

    case "drag":
      _ = try params.string("snapshotId")
      return try await AnyEncodable(client.drag(
        fromX: params.double("fromX"),
        fromY: params.double("fromY"),
        toX: params.double("toX"),
        toY: params.double("toY"),
        includeScreenshotAfter: try params.optionalBool("includeScreenshotAfter")
      ))

    case "finish":
      client.finish()
      return AnyEncodable(EmptyResult())

    default:
      throw BridgeError.methodNotFound(request.method)
    }
  }

  private func encodeSuccess<T: Encodable>(id: RequestID, result: T) throws -> String {
    let data = try encoder.encode(BridgeSuccess(id: id, result: result))
    return String(decoding: data, as: UTF8.self)
  }

  private func encodeFailure(id: RequestID?, error: BridgeError) -> String {
    do {
      let data = try encoder.encode(BridgeFailure(id: id, error: error))
      return String(decoding: data, as: UTF8.self)
    } catch {
      return #"{"jsonrpc":"2.0","error":{"code":"ENCODE_ERROR","message":"Failed to encode bridge error"}}"#
    }
  }

  private func openApp(_ appIdentifier: String) async throws -> ComputerUseCommandOutput {
    do {
      return try await client.openApp(appIdentifier)
    } catch {
      if let runningApp = Self.runningApplication(matching: appIdentifier) {
        return ComputerUseCommandOutput(text: """
        App already running:
        \(Self.formatRunningApp(runningApp))
        """)
      }
      throw error
    }
  }

  private static func runningApplication(matching identifier: String) -> NSRunningApplication? {
    let trimmed = identifier.trimmingCharacters(in: .whitespacesAndNewlines)
    let runningApps = NSWorkspace.shared.runningApplications
      .filter { app in
        app.activationPolicy != .prohibited
      }

    if let exactBundleID = runningApps.first(where: { app in
      app.bundleIdentifier?.localizedCaseInsensitiveCompare(trimmed) == .orderedSame
    }) {
      return exactBundleID
    }

    if let exactName = runningApps.first(where: { app in
      app.localizedName?.localizedCaseInsensitiveCompare(trimmed) == .orderedSame
    }) {
      return exactName
    }

    return runningApps.first { app in
      app.localizedName?.localizedCaseInsensitiveContains(trimmed) == true
    }
  }

  private static func formatRunningApp(_ app: NSRunningApplication) -> String {
    let name = app.localizedName ?? app.bundleIdentifier ?? "Unknown"
    let bundleID = app.bundleIdentifier ?? ""
    return "\(name) - \(bundleID) [pid \(app.processIdentifier)]"
  }
}
