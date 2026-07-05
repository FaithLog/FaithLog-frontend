const fs = require('fs');
const path = require('path');
const {withDangerousMod, withMainApplication} = require('@expo/config-plugins');

const PACKAGE_REGISTRATION = 'add(AndroidNavigationModePackage())';

function withAndroidNavigationMode(config) {
  config = withMainApplication(config, (config) => {
    const contents = config.modResults.contents;

    if (contents.includes(PACKAGE_REGISTRATION)) {
      return config;
    }

    config.modResults.contents = contents.replace(
      /PackageList\(this\)\.packages\.apply\s*\{/,
      (match) => `${match}\n          ${PACKAGE_REGISTRATION}`,
    );

    return config;
  });

  return withDangerousMod(config, [
    'android',
    async (config) => {
      const packageName = config.android?.package || 'com.faithlog.app';
      const packageDir = path.join(
        config.modRequest.platformProjectRoot,
        'app/src/main/java',
        ...packageName.split('.'),
      );

      fs.mkdirSync(packageDir, {recursive: true});
      fs.writeFileSync(
        path.join(packageDir, 'AndroidNavigationModeModule.kt'),
        createModuleSource(packageName),
      );
      fs.writeFileSync(
        path.join(packageDir, 'AndroidNavigationModePackage.kt'),
        createPackageSource(packageName),
      );

      return config;
    },
  ]);
}

function createModuleSource(packageName) {
  return `package ${packageName}

import android.provider.Settings
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AndroidNavigationModeModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "AndroidNavigationMode"

  override fun getConstants(): MutableMap<String, Any> =
    mutableMapOf("navigationMode" to resolveNavigationMode())

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun getNavigationMode(): String = resolveNavigationMode()

  private fun resolveNavigationMode(): String {
    return try {
      when (Settings.Secure.getInt(reactContext.contentResolver, "navigation_mode", -1)) {
        0, 1 -> "buttons"
        2 -> "gesture"
        else -> "unknown"
      }
    } catch (_: Exception) {
      "unknown"
    }
  }
}
`;
}

function createPackageSource(packageName) {
  return `package ${packageName}

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class AndroidNavigationModePackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
    listOf(AndroidNavigationModeModule(reactContext))

  override fun createViewManagers(
    reactContext: ReactApplicationContext
  ): List<ViewManager<*, *>> = emptyList()
}
`;
}

module.exports = withAndroidNavigationMode;
