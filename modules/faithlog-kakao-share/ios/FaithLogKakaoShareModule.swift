import KakaoSDKShare
import KakaoSDKTemplate
import KakaoSDKCommon
import React
import UIKit

@objc(FaithLogKakaoShare)
public final class FaithLogKakaoShareModule: NSObject {
  private static var initialized = false

  @objc public static func requiresMainQueueSetup() -> Bool {
    true
  }

  @objc public func share(
    _ title: String,
    description: String,
    buttonTitle: String,
    url: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let shareURL = URL(string: url),
          let imageURL = URL(string: "https://app.faithlog.kr/og-faithlog.png") else {
      reject("KAKAO_SHARE_INVALID_URL", "카카오톡 공유를 사용할 수 없습니다.", nil)
      return
    }
    guard let appKey = Bundle.main.object(forInfoDictionaryKey: "KAKAO_NATIVE_APP_KEY") as? String,
          !appKey.isEmpty else {
      reject("KAKAO_APP_KEY_MISSING", "카카오톡 공유를 사용할 수 없습니다.", nil)
      return
    }
    if !Self.initialized {
      KakaoSDK.initSDK(appKey: appKey)
      Self.initialized = true
    }
    let link = Link(webUrl: shareURL, mobileWebUrl: shareURL)
    let template = FeedTemplate(
      content: Content(title: title, imageUrl: imageURL, description: description, link: link),
      buttons: [Button(title: buttonTitle, link: link)]
    )
    ShareApi.shared.shareDefault(templatable: template) { result, error in
      guard error == nil, let result else {
        reject("KAKAO_SHARE_FAILED", "카카오톡 공유를 열지 못했습니다.", nil)
        return
      }
      DispatchQueue.main.async {
        UIApplication.shared.open(result.url, options: [:]) { opened in
          if opened {
            resolve("completed")
          } else {
            reject("KAKAO_SHARE_OPEN_FAILED", "카카오톡 공유를 열지 못했습니다.", nil)
          }
        }
      }
    }
  }
}
