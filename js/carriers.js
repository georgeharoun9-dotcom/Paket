// Fraktbolag: igenkänning av spårningsnummer och länkar till spårningssidor.
// Mönstren är heuristiska – flera bolag kan matcha samma nummer, därför
// returnerar detect() en rangordnad lista och användaren kan byta bolag.

export const CARRIERS = {
  postnord: {
    name: 'PostNord', short: 'PN', color: '#00A0D6',
    url: id => `https://tracking.postnord.com/se/?id=${id}`,
  },
  dhl: {
    name: 'DHL', short: 'DHL', color: '#D40511', text: '#FFCC00',
    url: id => `https://www.dhl.com/se-sv/home/tracking.html?tracking-id=${id}&submit=1`,
  },
  ups: {
    name: 'UPS', short: 'UPS', color: '#351C15', text: '#FFB500',
    url: id => `https://www.ups.com/track?loc=sv_SE&tracknum=${id}`,
  },
  fedex: {
    name: 'FedEx', short: 'FX', color: '#4D148C', text: '#FF6600',
    url: id => `https://www.fedex.com/fedextrack/?trknbr=${id}`,
  },
  bring: {
    name: 'Bring', short: 'BR', color: '#7BC144',
    url: id => `https://tracking.bring.se/tracking/${id}`,
  },
  dbschenker: {
    name: 'DB Schenker', short: 'DBS', color: '#EC0016',
    url: id => `https://www.dbschenker.com/app/tracking-public/?refNumber=${id}`,
  },
  gls: {
    name: 'GLS', short: 'GLS', color: '#061AB1', text: '#FFD100',
    url: id => `https://gls-group.com/SE/sv/spara-paket?match=${id}`,
  },
  dpd: {
    name: 'DPD', short: 'DPD', color: '#DC0032',
    url: id => `https://tracking.dpd.de/status/sv_SE/parcel/${id}`,
  },
  budbee: {
    name: 'Budbee', short: 'BB', color: '#2C2C54', text: '#7FFFD4',
    url: id => `https://tracking.budbee.com/${id}`,
  },
  instabox: {
    name: 'Instabox', short: 'IB', color: '#FF4E6A',
    url: id => `https://track.instabox.io/${id}`,
  },
  usps: {
    name: 'USPS', short: 'USPS', color: '#333366',
    url: id => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${id}`,
  },
  royalmail: {
    name: 'Royal Mail', short: 'RM', color: '#DA202A', text: '#FFD200',
    url: id => `https://www.royalmail.com/track-your-item#/tracking-results/${id}`,
  },
  amazon: {
    name: 'Amazon', short: 'AMZ', color: '#232F3E', text: '#FF9900',
    url: id => `https://track.amazon.com/tracking/${id}`,
  },
  cainiao: {
    name: 'Cainiao', short: 'CN', color: '#FF6A00',
    url: id => `https://global.cainiao.com/newDetail.htm?mailNoList=${id}`,
  },
  yunexpress: {
    name: 'YunExpress', short: 'YUN', color: '#0055A5',
    url: id => `https://www.yuntrack.com/parcelTracking?id=${id}`,
  },
  other: {
    name: 'Annat / okänt', short: '?', color: '#8E8E93',
    url: id => `https://t.17track.net/sv#nums=${id}`,
  },
};

// [regex, carrierId] i prioritetsordning.
const RULES = [
  [/^1Z[0-9A-Z]{16}$/, 'ups'],
  [/^TBA\d{12}$/, 'amazon'],
  [/^JJD\d{10,}$/, 'dhl'],
  [/^JVGL\d+$/, 'dhl'],
  [/^(GM|LX|RX)\d{16,}$/, 'dhl'],
  [/^YT\d{16}$/, 'yunexpress'],
  [/^LP\d{12,16}$/, 'cainiao'],
  [/^CNG?\d{10,}$/, 'cainiao'],
  [/^[A-Z]{2}\d{9}(SE|DK)$/, 'postnord'],
  [/^[A-Z]{2}\d{9}NO$/, 'bring'],
  [/^[A-Z]{2}\d{9}DE$/, 'dhl'],
  [/^[A-Z]{2}\d{9}US$/, 'usps'],
  [/^[A-Z]{2}\d{9}GB$/, 'royalmail'],
  [/^[A-Z]{2}\d{9}CN$/, 'cainiao'],
  [/^00\d{18}$/, 'postnord'],        // SSCC – vanligast PostNord i Sverige
  [/^00\d{18}$/, 'dbschenker'],
  [/^00\d{18}$/, 'dhl'],
  [/^370\d{14}$/, 'bring'],
  [/^70\d{15}$/, 'bring'],
  [/^(94|93|92|95)\d{20}$/, 'usps'],
  [/^\d{10}$/, 'dhl'],               // DHL Express
  [/^\d{10}$/, 'dbschenker'],
  [/^\d{11}$/, 'gls'],
  [/^\d{12}$/, 'fedex'],
  [/^\d{12}$/, 'gls'],
  [/^\d{15}$/, 'fedex'],
  [/^\d{14}$/, 'dpd'],
  [/^[A-Z]{2}\d{9}[A-Z]{2}$/, 'other'], // Internationellt postnummer (UPU S10)
];

export function normalize(raw) {
  return String(raw || '').toUpperCase().replace(/[\s\-_.]/g, '');
}

/** Returnerar rangordnade carrier-id:n som matchar numret (tom lista om okänt). */
export function detect(raw) {
  const id = normalize(raw);
  if (!id) return [];
  const out = [];
  for (const [re, c] of RULES) if (re.test(id) && !out.includes(c)) out.push(c);
  return out.length > 1 ? out.filter(c => c !== 'other') : out;
}

export function carrier(id) {
  return CARRIERS[id] || CARRIERS.other;
}

export function trackingUrl(carrierId, number) {
  return carrier(carrierId).url(encodeURIComponent(normalize(number)));
}
