// Streckkodsskanner: inbyggd BarcodeDetector där den finns (Chrome/Android),
// annars ZXing (vendor/zxing) som fungerar i Safari/iOS och Firefox.

const FORMATS = ['code_128', 'code_39', 'code_93', 'codabar', 'ean_13', 'ean_8',
  'itf', 'upc_a', 'upc_e', 'qr_code', 'data_matrix', 'pdf417', 'aztec'];

let zxingLoading;
function loadZxing() {
  if (window.ZXing) return Promise.resolve();
  zxingLoading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/zxing/zxing.min.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Kunde inte ladda skannern.'));
    document.head.appendChild(s);
  });
  return zxingLoading;
}

async function nativeDetector() {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const supported = await window.BarcodeDetector.getSupportedFormats();
    const formats = FORMATS.filter(f => supported.includes(f));
    return formats.length ? new window.BarcodeDetector({ formats }) : null;
  } catch { return null; }
}

/**
 * Startar skanning i <video>. Anropar onResult(text) en gång.
 * Returnerar en stop()-funktion.
 */
export async function startScan(video, onResult) {
  let stopped = false;
  let stream;
  let zxReader;
  const stop = () => {
    stopped = true;
    try { zxReader?.reset(); } catch {}
    stream?.getTracks().forEach(t => t.stop());
    video.srcObject = null;
  };
  const done = text => { if (!stopped) { stop(); onResult(text); } };

  const detector = await nativeDetector();
  if (detector) {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false,
    });
    video.srcObject = stream;
    await video.play();
    const tick = async () => {
      if (stopped) return;
      try {
        const codes = await detector.detect(video);
        if (codes.length) return done(codes[0].rawValue);
      } catch {}
      setTimeout(tick, 150);
    };
    tick();
    return stop;
  }

  await loadZxing();
  const hints = new Map();
  hints.set(window.ZXing.DecodeHintType.TRY_HARDER, true);
  zxReader = new window.ZXing.BrowserMultiFormatReader(hints);
  await zxReader.decodeFromConstraints(
    { video: { facingMode: { ideal: 'environment' } }, audio: false },
    video,
    (result) => { if (result) done(result.getText()); },
  );
  stream = video.srcObject;
  return stop;
}
