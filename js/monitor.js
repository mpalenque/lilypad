const REPORT_INTERVAL_MS = 180;

export class Monitor {
  constructor() {
    const params = new URLSearchParams(location.search);
    this.endpoint = params.get('monitor');
    this.token = params.get('monitorToken') || '';
    this.lastReportAt = Number.NEGATIVE_INFINITY;
  }

  report(event, payload = {}, immediate = false) {
    if (!this.endpoint) return;
    const now = performance.now();
    if (!immediate && now - this.lastReportAt < REPORT_INTERVAL_MS) return;
    this.lastReportAt = now;

    const body = JSON.stringify({
      token: this.token,
      event,
      time: Math.round(now),
      ...payload,
    });

    try {
      const sent = navigator.sendBeacon?.(this.endpoint, new Blob([body], { type: 'text/plain' }));
      if (sent) return;
      fetch(this.endpoint, { method: 'POST', body, keepalive: true, mode: 'no-cors' }).catch(() => {});
    } catch (error) {
      console.warn('[monitor] report failed:', error);
    }
  }
}
