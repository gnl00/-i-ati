import Foundation

public enum BridgeProtocol {
  public static let jsonrpcVersion = "2.0"
}

public struct BridgeRequest: Decodable {
  public let jsonrpc: String?
  public let id: RequestID
  public let method: String
  public let params: JSONObject?
}

public enum RequestID: Codable, Hashable, Sendable {
  case string(String)
  case int(Int)

  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    if let value = try? container.decode(String.self) {
      self = .string(value)
      return
    }
    if let value = try? container.decode(Int.self) {
      self = .int(value)
      return
    }
    throw DecodingError.typeMismatch(
      RequestID.self,
      DecodingError.Context(codingPath: decoder.codingPath, debugDescription: "JSON-RPC id must be a string or integer")
    )
  }

  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .string(let value):
      try container.encode(value)
    case .int(let value):
      try container.encode(value)
    }
  }
}

public enum JSONValue: Codable, Equatable, Sendable {
  case string(String)
  case int(Int)
  case double(Double)
  case bool(Bool)
  case object([String: JSONValue])
  case array([JSONValue])
  case null

  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    if container.decodeNil() {
      self = .null
      return
    }
    if let value = try? container.decode(Bool.self) {
      self = .bool(value)
      return
    }
    if let value = try? container.decode(Int.self) {
      self = .int(value)
      return
    }
    if let value = try? container.decode(Double.self) {
      self = .double(value)
      return
    }
    if let value = try? container.decode(String.self) {
      self = .string(value)
      return
    }
    if let value = try? container.decode([String: JSONValue].self) {
      self = .object(value)
      return
    }
    if let value = try? container.decode([JSONValue].self) {
      self = .array(value)
      return
    }
    throw DecodingError.typeMismatch(
      JSONValue.self,
      DecodingError.Context(codingPath: decoder.codingPath, debugDescription: "Unsupported JSON value")
    )
  }

  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .string(let value):
      try container.encode(value)
    case .int(let value):
      try container.encode(value)
    case .double(let value):
      try container.encode(value)
    case .bool(let value):
      try container.encode(value)
    case .object(let value):
      try container.encode(value)
    case .array(let value):
      try container.encode(value)
    case .null:
      try container.encodeNil()
    }
  }
}

public typealias JSONObject = [String: JSONValue]

public extension JSONObject {
  func string(_ key: String) throws -> String {
    guard let value = self[key] else {
      throw BridgeError.invalidParams("Missing required string param: \(key)")
    }
    if case .string(let string) = value {
      return string
    }
    throw BridgeError.invalidParams("Param \(key) must be a string")
  }

  func optionalString(_ key: String) throws -> String? {
    guard let value = self[key], value != .null else {
      return nil
    }
    if case .string(let string) = value {
      return string
    }
    throw BridgeError.invalidParams("Param \(key) must be a string")
  }

  func int(_ key: String) throws -> Int {
    guard let value = self[key] else {
      throw BridgeError.invalidParams("Missing required integer param: \(key)")
    }
    switch value {
    case .int(let int):
      return int
    case .double(let double) where double.rounded() == double:
      return Int(double)
    default:
      throw BridgeError.invalidParams("Param \(key) must be an integer")
    }
  }

  func optionalInt(_ key: String) throws -> Int? {
    guard let value = self[key], value != .null else {
      return nil
    }
    switch value {
    case .int(let int):
      return int
    case .double(let double) where double.rounded() == double:
      return Int(double)
    default:
      throw BridgeError.invalidParams("Param \(key) must be an integer")
    }
  }

  func double(_ key: String) throws -> Double {
    guard let value = self[key] else {
      throw BridgeError.invalidParams("Missing required number param: \(key)")
    }
    switch value {
    case .int(let int):
      return Double(int)
    case .double(let double):
      return double
    default:
      throw BridgeError.invalidParams("Param \(key) must be a number")
    }
  }

  func optionalDouble(_ key: String, default defaultValue: Double) throws -> Double {
    guard let value = self[key], value != .null else {
      return defaultValue
    }
    switch value {
    case .int(let int):
      return Double(int)
    case .double(let double):
      return double
    default:
      throw BridgeError.invalidParams("Param \(key) must be a number")
    }
  }

  func optionalBool(_ key: String, default defaultValue: Bool = false) throws -> Bool {
    guard let value = self[key], value != .null else {
      return defaultValue
    }
    if case .bool(let bool) = value {
      return bool
    }
    throw BridgeError.invalidParams("Param \(key) must be a boolean")
  }
}

public struct BridgeError: Error, Encodable {
  public let code: String
  public let message: String
  public let data: JSONValue?

  public static func invalidParams(_ message: String) -> BridgeError {
    BridgeError(code: "INVALID_PARAMS", message: message, data: nil)
  }

  public static func methodNotFound(_ method: String) -> BridgeError {
    BridgeError(code: "METHOD_NOT_FOUND", message: "Unknown method: \(method)", data: nil)
  }

  public static func decodeFailed(_ message: String) -> BridgeError {
    BridgeError(code: "PARSE_ERROR", message: message, data: nil)
  }

  public static func actionFailed(_ error: Error) -> BridgeError {
    let message = String(describing: error)
    return BridgeError(code: mapNativeErrorCode(message: message), message: message, data: nil)
  }

  private static func mapNativeErrorCode(message: String) -> String {
    let lower = message.lowercased()
    if lower.contains("accessibility") || lower.contains("permission") {
      return "AX_PERMISSION_MISSING"
    }
    if lower.contains("screen") && lower.contains("permission") {
      return "SCREEN_CAPTURE_PERMISSION_MISSING"
    }
    if lower.contains("appnotfound") || (lower.contains("app") && lower.contains("not found")) {
      return "APP_NOT_FOUND"
    }
    if lower.contains("windownotfound") || (lower.contains("window") && lower.contains("not found")) {
      return "WINDOW_NOT_FOUND"
    }
    if lower.contains("snapshotnotfound") || lower.contains("snapshot") {
      return "SNAPSHOT_EXPIRED"
    }
    return "ACTION_FAILED"
  }
}

public struct BridgeSuccess<T: Encodable>: Encodable {
  let jsonrpc = BridgeProtocol.jsonrpcVersion
  let id: RequestID
  let result: T
}

public struct BridgeFailure: Encodable {
  public let jsonrpc = BridgeProtocol.jsonrpcVersion
  public let id: RequestID?
  public let error: BridgeError

  public init(id: RequestID?, error: BridgeError) {
    self.id = id
    self.error = error
  }
}

public struct EmptyResult: Encodable {}
