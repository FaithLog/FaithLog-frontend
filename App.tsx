import {FaithLogApp} from './src/root/FaithLogApp';
import {initializeNativeFirebaseAnalytics} from './src/analytics/nativeFirebaseAnalytics';
import {initializeNativeFirebaseMessaging} from './src/notifications/nativeFirebaseMessaging';
import {AppUpdateGate} from './src/update/AppUpdateGate';

void initializeNativeFirebaseAnalytics();
void initializeNativeFirebaseMessaging();

export default function App() {
  return (
    <AppUpdateGate>
      <FaithLogApp />
    </AppUpdateGate>
  );
}
