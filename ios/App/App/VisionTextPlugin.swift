import Capacitor
import UIKit
import Vision

@objc(VisionTextPlugin)
public class VisionTextPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VisionTextPlugin"
    public let jsName = "VisionText"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "recognize", returnType: CAPPluginReturnPromise)]

    @objc func recognize(_ call: CAPPluginCall) {
        guard let dataURL = call.getString("image"), let comma = dataURL.firstIndex(of: ","),
              let data = Data(base64Encoded: String(dataURL[dataURL.index(after: comma)...])),
              let image = UIImage(data: data), let cgImage = image.cgImage else {
            call.reject("画像を読み取れませんでした。"); return
        }
        let request = VNRecognizeTextRequest { request, error in
            if let error { call.reject("文字を読み取れませんでした: \(error.localizedDescription)"); return }
            let items: [JSObject] = (request.results as? [VNRecognizedTextObservation] ?? []).compactMap { observation in
                guard let candidate = observation.topCandidates(1).first else { return nil }
                let box = observation.boundingBox
                return ["text": candidate.string, "confidence": candidate.confidence,
                        "x": box.minX, "y": 1 - box.maxY, "width": box.width, "height": box.height]
            }
            call.resolve(["items": items])
        }
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        request.recognitionLanguages = ["ja-JP", "en-US"]
        DispatchQueue.global(qos: .userInitiated).async {
            do { try VNImageRequestHandler(cgImage: cgImage, options: [:]).perform([request]) }
            catch { call.reject("文字を読み取れませんでした: \(error.localizedDescription)") }
        }
    }
}
