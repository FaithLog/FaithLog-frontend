package expo.modules.faithlogkakaoshare

import android.content.Intent
import android.content.pm.PackageManager
import com.kakao.sdk.common.KakaoSdk
import com.kakao.sdk.share.ShareClient
import com.kakao.sdk.template.model.Content
import com.kakao.sdk.template.model.FeedTemplate
import com.kakao.sdk.template.model.Link
import com.kakao.sdk.template.model.Social
import com.kakao.sdk.template.model.Button
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class FaithLogKakaoShareModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FaithLogKakaoShare")
    AsyncFunction("share") { title: String, description: String, buttonTitle: String, url: String, promise: Promise ->
      val context = appContext.reactContext ?: run {
        promise.reject("KAKAO_CONTEXT_UNAVAILABLE", "Kakao share is unavailable.", null)
        return@AsyncFunction
      }
      val applicationInfo = context.packageManager.getApplicationInfo(
        context.packageName,
        PackageManager.GET_META_DATA
      )
      val appKey = applicationInfo.metaData?.getString("com.kakao.sdk.AppKey")
      if (appKey.isNullOrBlank()) {
        promise.reject("KAKAO_APP_KEY_MISSING", "Kakao share is unavailable.", null)
        return@AsyncFunction
      }
      KakaoSdk.init(context.applicationContext, appKey)
      val template = FeedTemplate(
        content = Content(title = title, description = description, imageUrl = "https://app.faithlog.kr/og-faithlog.png", link = Link(webUrl = url, mobileWebUrl = url)),
        social = Social(),
        buttons = listOf(Button(buttonTitle, Link(webUrl = url, mobileWebUrl = url)))
      )
      if (ShareClient.instance.isKakaoTalkSharingAvailable(context)) {
        ShareClient.instance.shareDefault(context, template) { sharingResult, error ->
          if (error != null || sharingResult == null) {
            promise.reject("KAKAO_SHARE_FAILED", "Kakao share failed.", error)
          } else {
            context.startActivity(sharingResult.intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            promise.resolve("completed")
          }
        }
      } else {
        ShareClient.instance.shareDefault(context, template) { sharingResult, error ->
          if (error != null || sharingResult == null) {
            promise.reject("KAKAO_SHARE_FAILED", "Kakao share failed.", error)
          } else {
            context.startActivity(sharingResult.intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            promise.resolve("completed")
          }
        }
      }
    }
  }
}
