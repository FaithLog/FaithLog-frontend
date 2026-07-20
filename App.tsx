import {FaithLogApp} from './src/root/FaithLogApp';
import {initializeNativeFirebaseAnalytics} from './src/analytics/nativeFirebaseAnalytics';
import {initializeNativeFirebaseCrashlytics} from './src/crashlytics/nativeFirebaseCrashlytics';
import {initializeNativeFirebaseMessaging} from './src/notifications/nativeFirebaseMessaging';
import {AppUpdateGate} from './src/update/AppUpdateGate';

void initializeNativeFirebaseAnalytics();
void initializeNativeFirebaseCrashlytics();
void initializeNativeFirebaseMessaging();

export default function App() {
  return (
    <AppUpdateGate>
      <FaithLogApp />
    </AppUpdateGate>
  );
}
