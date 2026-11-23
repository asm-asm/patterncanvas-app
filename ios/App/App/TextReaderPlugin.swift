import Capacitor
import UIKit
import Vision

/// Reads the text printed on a photographed chart page with Apple's on-device text recognition (Vision), so the
/// import can leave notes out of the chart and read the row and stitch numbers. The image never leaves the device.
@objc(TextReaderPlugin)
public class TextReaderPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TextReaderPlugin"
    public let jsName = "TextReader"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise)
    ]

    /// image: base64 JPEG. Returns items: [{text, confidence, x, y, w, h}] and numbers: [{value, x, y, w, h}],
    /// boxes in 0-1 with the origin at the top left. Numbers are each run of digits (or one circled number) in the
    /// text, with its own box, so 「15 10 5 1」 under a chart gives four numbers.
    @objc func read(_ call: CAPPluginCall) {
        guard let encoded = call.getString("image"),
              let data = Data(base64Encoded: encoded),
              let image = UIImage(data: data)?.cgImage else {
            call.reject("画像を読み込めませんでした。")
            return
        }
        DispatchQueue.global(qos: .userInitiated).async {
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.recognitionLanguages = ["ja-JP", "en-US"]
            request.usesLanguageCorrection = false
            let handler = VNImageRequestHandler(cgImage: image, options: [:])
            do {
                try handler.perform([request])
            } catch {
                call.reject("文字を読み取れませんでした。")
                return
            }
            var items: [[String: Any]] = []
            var numbers: [[String: Any]] = []
            let box: (CGRect) -> [String: Any] = { r in
                ["x": r.minX, "y": 1 - r.maxY, "w": r.width, "h": r.height]
            }
            for observation in request.results ?? [] {
                guard let top = observation.topCandidates(1).first else { continue }
                var item = box(observation.boundingBox)
                item["text"] = top.string
                item["confidence"] = top.confidence
                items.append(item)
                for (value, range) in TextReaderPlugin.numbers(in: top.string) {
                    guard let rect = try? top.boundingBox(for: range)?.boundingBox else { continue }
                    var number = box(rect)
                    number["value"] = value
                    numbers.append(number)
                }
            }
            call.resolve(["items": items, "numbers": numbers])
        }
    }

    /// Runs of ASCII or full-width digits, and circled numbers ①-⑳ ㉑-㉟ ㊱-㊿, with their ranges.
    static func numbers(in text: String) -> [(Int, Range<String.Index>)] {
        var found: [(Int, Range<String.Index>)] = []
        var start: String.Index? = nil
        var value = 0
        var index = text.startIndex
        func flush(_ end: String.Index) {
            if let s = start { found.append((value, s..<end)) }
            start = nil
            value = 0
        }
        while index < text.endIndex {
            let ch = text[index]
            let scalar = ch.unicodeScalars.first!.value
            var digit: Int? = nil
            if ("0"..."9").contains(ch) { digit = Int(String(ch)) }
            else if scalar >= 0xFF10 && scalar <= 0xFF19 { digit = Int(scalar - 0xFF10) }
            if let d = digit {
                if start == nil { start = index }
                value = value * 10 + d
            } else {
                flush(index)
                var circled: Int? = nil
                if scalar >= 0x2460 && scalar <= 0x2473 { circled = Int(scalar - 0x2460) + 1 }
                else if scalar >= 0x3251 && scalar <= 0x325F { circled = Int(scalar - 0x3251) + 21 }
                else if scalar >= 0x32B1 && scalar <= 0x32BF { circled = Int(scalar - 0x32B1) + 36 }
                if let c = circled { found.append((c, index..<text.index(after: index))) }
            }
            index = text.index(after: index)
        }
        flush(text.endIndex)
        return found
    }
}
