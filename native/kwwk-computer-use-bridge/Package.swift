// swift-tools-version: 6.1

import PackageDescription

let package = Package(
  name: "kwwk-computer-use-bridge",
  platforms: [
    .macOS(.v14)
  ],
  products: [
    .library(name: "KwwkComputerUseBridgeCore", targets: ["KwwkComputerUseBridgeCore"]),
    .executable(name: "kwwk-computer-use-bridge", targets: ["KwwkComputerUseBridge"])
  ],
  dependencies: [
    .package(url: "https://github.com/EYHN/kwwk-computer-use-core.git", branch: "main")
  ],
  targets: [
    .target(
      name: "KwwkComputerUseBridgeCore",
      dependencies: [
        .product(name: "KWWKComputerUseCore", package: "kwwk-computer-use-core")
      ]
    ),
    .executableTarget(
      name: "KwwkComputerUseBridge",
      dependencies: ["KwwkComputerUseBridgeCore"]
    ),
    .testTarget(
      name: "KwwkComputerUseBridgeTests",
      dependencies: ["KwwkComputerUseBridgeCore"]
    )
  ]
)
