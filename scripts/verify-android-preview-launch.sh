#!/usr/bin/env bash
set -euo pipefail

package=com.faithlog.app
adb install -r /tmp/faithlog-preview.apk
adb shell pm path "$package"
adb logcat -c
adb shell monkey -p "$package" -c android.intent.category.LAUNCHER 1
sleep 20

process="$(adb shell pidof "$package" | tr -d '\r')"
adb logcat -d -s AndroidRuntime:E > /tmp/faithlog-android-runtime.log
if [[ -z "$process" ]] || grep -Fq "Process: $package," /tmp/faithlog-android-runtime.log; then
  echo "::error::FaithLog launch did not survive or reported a fatal exception"
  tail -80 /tmp/faithlog-android-runtime.log
  exit 1
fi
adb exec-out screencap -p > /tmp/faithlog-preview-launch.png
test "$(stat -c %s /tmp/faithlog-preview-launch.png)" -gt 10000
echo "Preview APK installed and foreground-launch smoke passed"
