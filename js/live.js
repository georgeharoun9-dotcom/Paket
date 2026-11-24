// Livestatus via extern spårningstjänst.
//
// API-nyckeln skrivs in av användaren under Inställningar och sparas bara
// lokalt i webbläsaren (localStorage). Ingen nyckel finns i koden.
//
// För att lägga till en ny tjänst: lägg till ett objekt i PROVIDERS med
// `track(number, carrierId, settings)` som returnerar ett normaliserat svar:
//   { status: 'pending'|'transit'|'pickup'|'delivered'|'exception'|'unknown',
//     statusText: string, eta?: ISO-sträng,
//     events: [{ time: ISO-sträng, text: string, location?: string }] }
//
// OBS: Många spårnings-API:er tillåter inte anrop direkt från webbläsaren
// (CORS). Ange i så fall en egen proxy-URL i inställningarna. Proxyn får
// målets URL tillagd efter sig (t.ex. https://min-proxy.example/?url=).

const STATUS_TEXT = {
  pending: 'Väntar på info', transit: 'På väg', pickup: 'Redo att hämtas',
  delivered: 'Levererat', exception: 'Problem', unknown: 'Okänd status',
};
export const statusText = s => STATUS_TEXT[s] || STATUS_TEXT.unknown;

function viaProxy(url, settings) {
  const p = (settings.liveProxy || '').trim();
  return p ? p + encodeURIComponent(url) : url;
}

async function request(url, opts, settings) {
  const res = await fetch(viaProxy(url, settings), opts);
  if (!res.ok) throw new Error(`Tjänsten svarade ${res.status} ${res.statusText}`);
  return res.json();
}

export const PROVIDERS = {
  none: { name: 'Ingen (endast länkar)' },

  ship24: {
    name: 'Ship24',
    keyHelp: 'API-nyckel från dashboard.ship24.com',
    async track(number, _carrier, settings) {
      const data = await request('https://api.ship24.com/public/v1/trackers/track', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings.liveKey}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({ trackingNumber: number }),
      }, settings);
      const t = data?.data?.trackings?.[0] || {};
      const map = {
        pending: 'pending', info_received: 'pending', in_transit: 'transit',
        out_for_delivery: 'transit', available_for_pickup: 'pickup',
        delivered: 'delivered', exception: 'exception', failed_attempt: 'exception',
      };
      const status = map[t.shipment?.statusMilestone] || 'unknown';
      return {
        status,
        statusText: statusText(status),
        eta: t.shipment?.delivery?.estimatedDeliveryDate || null,
        events: (t.events || []).map(e => ({
          time: e.occurrenceDatetime, text: e.status, location: e.location || '',
        })),
      };
    },
  },

  '17track': {
    name: '17TRACK',
    keyHelp: 'Säkerhetsnyckel (17token) från api.17track.net',
    async track(number, _carrier, settings) {
      const headers = { '17token': settings.liveKey, 'Content-Type': 'application/json' };
      const body = JSON.stringify([{ number }]);
      // Registrera (ignorera fel om redan registrerat) och hämta sedan info.
      await request('https://api.17track.net/track/v2.2/register',
        { method: 'POST', headers, body }, settings).catch(() => {});
      const data = await request('https://api.17track.net/track/v2.2/gettrackinfo',
        { method: 'POST', headers, body }, settings);
      const info = data?.data?.accepted?.[0]?.track_info || {};
      const map = {
        NotFound: 'pending', InfoReceived: 'pending', InTransit: 'transit',
        OutForDelivery: 'transit', AvailableForPickup: 'pickup', Delivered: 'delivered',
        DeliveryFailure: 'exception', Exception: 'exception', Expired: 'exception',
      };
      const status = map[info.latest_status?.status] || 'unknown';
      const events = (info.tracking?.providers?.[0]?.events || []).map(e => ({
        time: e.time_iso || e.time_utc, text: e.description, location: e.location || '',
      }));
      return {
        status, statusText: statusText(status),
        eta: info.time_metrics?.estimated_delivery_date?.from || null, events,
      };
    },
  },
};

export function liveEnabled(settings) {
  const p = PROVIDERS[settings.liveProvider];
  return !!(p && p.track && settings.liveKey);
}

export async function fetchLive(pkg, settings) {
  if (!liveEnabled(settings)) throw new Error('Ingen spårningstjänst är inställd.');
  return PROVIDERS[settings.liveProvider].track(pkg.number, pkg.carrier, settings);
}
