import {FaithLogApp} from './src/root/FaithLogApp';
import {initializeNativeFirebaseAnalytics} from './src/analytics/nativeFirebaseAnalytics';
import {initializeNativeFirebaseMessaging} from './src/notifications/nativeFirebaseMessaging';

void initializeNativeFirebaseAnalytics();
void initializeNativeFirebaseMessaging();

export default function App() {
  return <FaithLogApp />;
}
