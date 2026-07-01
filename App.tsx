import {FaithLogApp} from './src/root/FaithLogApp';
import {initializeNativeFirebaseMessaging} from './src/notifications/nativeFirebaseMessaging';

void initializeNativeFirebaseMessaging();

export default function App() {
  return <FaithLogApp />;
}
