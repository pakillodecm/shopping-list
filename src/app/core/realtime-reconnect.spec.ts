import { describe, expect, it, vi } from 'vitest';

import { createReconnectHandler } from './realtime-reconnect';

describe('createReconnectHandler', () => {
  it('does not call onReconnect on the initial SUBSCRIBED (first connect, not a reconnect)', () => {
    const onReconnect = vi.fn();
    const handler = createReconnectHandler(onReconnect);

    handler('SUBSCRIBED');

    expect(onReconnect).not.toHaveBeenCalled();
  });

  it('calls onReconnect when SUBSCRIBED follows a CLOSED', () => {
    const onReconnect = vi.fn();
    const handler = createReconnectHandler(onReconnect);

    handler('SUBSCRIBED');
    handler('CLOSED');
    handler('SUBSCRIBED');

    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('calls onReconnect when SUBSCRIBED follows a TIMED_OUT', () => {
    const onReconnect = vi.fn();
    const handler = createReconnectHandler(onReconnect);

    handler('SUBSCRIBED');
    handler('TIMED_OUT');
    handler('SUBSCRIBED');

    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('calls onReconnect when SUBSCRIBED follows a CHANNEL_ERROR', () => {
    const onReconnect = vi.fn();
    const handler = createReconnectHandler(onReconnect);

    handler('SUBSCRIBED');
    handler('CHANNEL_ERROR');
    handler('SUBSCRIBED');

    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('does not call onReconnect again for consecutive SUBSCRIBED statuses', () => {
    const onReconnect = vi.fn();
    const handler = createReconnectHandler(onReconnect);

    handler('SUBSCRIBED');
    handler('CLOSED');
    handler('SUBSCRIBED');
    handler('SUBSCRIBED');

    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('calls onReconnect again after a second disconnect/reconnect cycle', () => {
    const onReconnect = vi.fn();
    const handler = createReconnectHandler(onReconnect);

    handler('SUBSCRIBED');
    handler('CLOSED');
    handler('SUBSCRIBED');
    handler('TIMED_OUT');
    handler('SUBSCRIBED');

    expect(onReconnect).toHaveBeenCalledTimes(2);
  });
});
