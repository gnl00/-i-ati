import Foundation
import KwwkComputerUseBridgeCore

@main
enum KwwkComputerUseBridgeMain {
  static func main() async {
    let server = BridgeServer()

    while let line = readLine() {
      let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !trimmed.isEmpty else {
        continue
      }

      let response = await server.handle(line: trimmed)
      print(response)
      fflush(stdout)
    }
  }
}
