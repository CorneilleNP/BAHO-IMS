import { useEffect, useState } from 'react';
import { getSyncStatus, subscribeSyncStatus, type SyncStatus } from './store';

/** Live online/offline state and how many saves are waiting to be sent. */
export function useSyncStatus(): SyncStatus {
  const [status, setStatus] = useState(getSyncStatus);
  useEffect(() => subscribeSyncStatus(setStatus), []);
  return status;
}
