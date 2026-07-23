/**
 * Builds a channel status callback (for RealtimeChannel#subscribe) that calls
 * onReconnect only when the channel comes back to SUBSCRIBED after having
 * been down (CLOSED/TIMED_OUT/CHANNEL_ERROR) — never on the initial connect.
 * A dropped connection means events may have been missed while it was down,
 * so callers use this to trigger a full refetch instead of trusting the
 * merge of whatever events happen to arrive afterwards.
 */
export function createReconnectHandler(onReconnect: () => void): (status: string) => void {
  let hasDisconnected = false;

  return (status: string) => {
    if (status === 'SUBSCRIBED') {
      if (hasDisconnected) {
        hasDisconnected = false;
        onReconnect();
      }
      return;
    }
    hasDisconnected = true;
  };
}
