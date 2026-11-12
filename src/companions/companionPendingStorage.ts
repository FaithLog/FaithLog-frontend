import type {PendingStorage} from './companionServerContract';
/** Account-scoped obligation survives process death; no tokens or personal details are stored. */
export function companionPendingStorage(userId:number):PendingStorage {
 const key=`faithlog.companion.pending.${userId}`;
 return{get:async()=>{const s=await import('expo-secure-store');return s.getItemAsync(key);},set:async value=>{const s=await import('expo-secure-store');await s.setItemAsync(key,value,{keychainAccessible:s.WHEN_UNLOCKED_THIS_DEVICE_ONLY});},clear:async()=>{const s=await import('expo-secure-store');await s.deleteItemAsync(key);}};
}
