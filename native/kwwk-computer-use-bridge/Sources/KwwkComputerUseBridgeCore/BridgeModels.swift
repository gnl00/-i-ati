import Foundation
import KWWKComputerUseCore

public struct BridgeRunningAppDescriptor: Codable, Equatable, Sendable {
  public let name: String
  public let bundleID: String
  public let pid: pid_t
  public let isActive: Bool

  public init(_ app: RunningAppDescriptor) {
    self.name = app.name
    self.bundleID = app.bundleID
    self.pid = app.pid
    self.isActive = app.isActive
  }
}

public struct BridgeAppDescriptor: Codable, Equatable, Sendable {
  public let name: String
  public let bundleID: String
  public let pid: pid_t?
  public let isRunning: Bool
  public let isFrontmost: Bool
  public let lastUsedDate: Date?
  public let useCount: Int?

  public init(_ app: ComputerUseAppDescriptor) {
    self.name = app.name
    self.bundleID = app.bundleID
    self.pid = app.pid
    self.isRunning = app.isRunning
    self.isFrontmost = app.isFrontmost
    self.lastUsedDate = app.lastUsedDate
    self.useCount = app.useCount
  }
}

public struct BridgeWindowDescriptor: Codable, Equatable, Sendable {
  public let appName: String
  public let bundleID: String
  public let pid: pid_t
  public let windowID: Int
  public let title: String
  public let isMain: Bool

  public init(_ window: ComputerUseWindowDescriptor) {
    self.appName = window.appName
    self.bundleID = window.bundleID
    self.pid = window.pid
    self.windowID = window.windowID
    self.title = window.title
    self.isMain = window.isMain
  }
}
