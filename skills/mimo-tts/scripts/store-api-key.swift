import Foundation
import Security
import Darwin

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}

guard isatty(STDIN_FILENO) == 1 else {
    fail("Run this script directly in an interactive terminal. Do not pipe or pass the key as an argument.")
}
guard CommandLine.arguments.count == 1 else {
    fail("This script accepts no arguments. Enter the key only at the hidden prompt.")
}

print("Save Xiaomi MiMo API key to your default macOS keychain (replaces this skill's existing entry).")
print("Input is hidden. An empty value cancels without changing Keychain.")
guard let input = getpass("MIMO_API_KEY: ") else {
    fail("Could not read hidden input.")
}
let inputLength = strlen(input)
defer { memset(input, 0, inputLength) }
guard inputLength > 0 else { fail("Cancelled; Keychain was not changed.") }
guard let keyText = String(validatingUTF8: input),
      !keyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
      keyText == keyText.trimmingCharacters(in: .whitespacesAndNewlines) else {
    fail("Invalid input: the key must be nonempty and have no surrounding whitespace.")
}

let query: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: "com.github.copilot.mimo-tts",
    kSecAttrAccount as String: "MIMO_API_KEY",
]
let attributes: [String: Any] = [
    kSecValueData as String: Data(bytes: input, count: inputLength),
    kSecAttrLabel as String: "MiMo TTS - Xiaomi MiMo API Key",
]
var result = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
if result == errSecItemNotFound {
    var entry = query
    entry.merge(attributes) { _, newValue in newValue }
    result = SecItemAdd(entry as CFDictionary, nil)
}
guard result == errSecSuccess else {
    fail("Keychain save failed (OSStatus \(result)). No key was printed. Check local Keychain permissions.")
}
print("Saved to macOS Keychain. The key was not printed or written to a file.")
