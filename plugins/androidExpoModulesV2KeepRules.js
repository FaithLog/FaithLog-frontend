// Expo Modules v2 discovers this provider by name, then instantiates modules
// through reflection. R8 cannot infer the constructors or generated JS bindings.
// The v2 JNI runtime also looks up fields (including NativeObject.nativePointer)
// and methods by their original names. Its published libraries omit consumer rules.
module.exports = `
-keep class expo.modules.ExpoModulesV2ModuleList {
  public <init>();
  public java.util.List getModules();
}
-keep class * extends io.github.expo.modules.v2.Module { *; }
-keep class io.github.expo.modules.v2.** { *; }
-keep class io.github.expo.kolibri.** { *; }
# Crypto codecs and enum values are accessed by the v2 runtime.
-keep class expo.modules.crypto.** { *; }
-keep class expo.modules.application.** { *; }
`;
