import { useEffect, useRef } from 'react';

interface NotificationOptions {
  title: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
}

interface UseUpsNotificationsOptions {
  dataSource: any;
  performerAeTitle: string | undefined;
  onAssigned: (workitemUID: string) => void;
  onRefresh: () => void;
  uiNotificationService: { show: (opts: NotificationOptions) => void };
}

const GLOBAL_UPS_UID = '1.2.840.10008.5.1.4.34.5';
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 2000;

/**
 * Opens a UPS-RS WebSocket subscription channel for real-time workitem
 * assignment notifications (FR-009, FR-011, P3).
 *
 * If `performerAeTitle` is not configured this hook is a no-op.
 */
export function useUpsNotifications({
  dataSource,
  performerAeTitle,
  onAssigned,
  onRefresh,
  uiNotificationService,
}: UseUpsNotificationsOptions): void {
  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const unmountedRef = useRef(false);

  useEffect(() => {
    if (!performerAeTitle) {
      return;
    }

    unmountedRef.current = false;

    let retryTimeout: ReturnType<typeof setTimeout> | null = null;

    const handleMessage = (event: MessageEvent) => {
      let data: any;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      // UPS State Report event — DICOM PS3.18 §11.11
      const eventType: string = data?.['00001000']?.Value?.[0] ?? '';
      const workitemUID: string = data?.['00080018']?.Value?.[0] ?? '';
      const assignedAe: string = data?.['00404025']?.Value?.[0]?.['00080100']?.Value?.[0] ?? '';

      if (eventType !== 'UPS State Report') {
        return;
      }

      if (assignedAe && assignedAe === performerAeTitle && workitemUID) {
        onAssigned(workitemUID);
        uiNotificationService.show({
          title: 'Workitem Assigned',
          message: `A new workitem has been assigned to you (${performerAeTitle}).`,
          type: 'info',
          duration: 6000,
        });
        onRefresh();
      }
    };

    const openChannel = async (retryCount: number) => {
      if (unmountedRef.current) return;

      try {
        // Subscribe to all global UPS events for this AE title
        await dataSource.store.subscribe(GLOBAL_UPS_UID, performerAeTitle);

        // Derive WebSocket URL from the HTTP subscription channel response.
        // The GET /subscribers/{aeTitle} returns a 200 with the channel URL,
        // but in practice many servers accept a direct WebSocket upgrade on the
        // same path. We derive the ws:// URL from the current origin.
        const upsRoot: string = (dataSource as any).getConfig?.()?.upsRoot ?? '';
        const httpBase = new URL(upsRoot || '/', window.location.origin).toString();
        const wsBase = httpBase.replace(/^http/, 'ws').replace(/\/$/, '');
        const wsUrl = `${wsBase}/subscribers/${encodeURIComponent(performerAeTitle)}`;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.addEventListener('message', handleMessage);

        ws.addEventListener('open', () => {
          retryCountRef.current = 0;
        });

        ws.addEventListener('close', () => {
          if (unmountedRef.current) return;
          const nextRetry = retryCountRef.current + 1;
          retryCountRef.current = nextRetry;
          if (nextRetry <= MAX_RETRIES) {
            const delay = BASE_RETRY_DELAY_MS * Math.pow(2, nextRetry - 1);
            retryTimeout = setTimeout(() => openChannel(nextRetry), delay);
          }
        });

        ws.addEventListener('error', () => {
          ws.close();
        });
      } catch (err) {
        if (unmountedRef.current) return;
        const nextRetry = retryCountRef.current + 1;
        retryCountRef.current = nextRetry;
        if (nextRetry <= MAX_RETRIES) {
          const delay = BASE_RETRY_DELAY_MS * Math.pow(2, nextRetry - 1);
          retryTimeout = setTimeout(() => openChannel(nextRetry), delay);
        }
      }
    };

    openChannel(0);

    return () => {
      unmountedRef.current = true;
      if (retryTimeout !== null) {
        clearTimeout(retryTimeout);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
    // Intentionally omit callbacks from deps — they are stable refs in practice;
    // re-opening the WebSocket on every render would be incorrect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [performerAeTitle, dataSource]);
}
