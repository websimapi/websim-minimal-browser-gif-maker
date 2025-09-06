// Minimal in-browser GIF builder using gif.js and its worker

let gifWorkerBlob = null;

// Fetch the worker script once (required by gif.js)
(async function preloadWorker() {
  const resp = await fetch('https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js');
  gifWorkerBlob = await resp.blob();
})();

const el = (id) => document.getElementById(id);
const fileInput = el('fileInput');
const btn = el('generateGif');
const statusEl = el('status');
const resultImg = el('resultImg');
const downloadLink = el('downloadLink');

btn.addEventListener('click', async () => {
  const files = Array.from(fileInput.files || []);
  if (!files.length) {
    statusEl.textContent = 'Add at least one image.';
    return;
  }

  const width = clampInt(parseInt(el('gifWidth').value, 10), 16, 2048);
  const height = clampInt(parseInt(el('gifHeight').value, 10), 16, 2048);
  const fps = clampInt(parseInt(el('fps').value, 10), 1, 60);
  const quality = clampInt(parseInt(el('quality').value, 10), 1, 30);
  const delay = Math.round(1000 / fps);

  if (!gifWorkerBlob) {
    statusEl.textContent = 'Loading worker...';
    await waitFor(() => !!gifWorkerBlob);
  }

  btn.disabled = true;
  statusEl.textContent = 'Building GIF...';

  const workerUrl = URL.createObjectURL(gifWorkerBlob);
  const gif = new GIF({
    workers: 2,
    quality,
    width,
    height,
    workerScript: workerUrl,
    transparent: 0x00000000
  });

  // Canvas used to normalize/scale each input frame to the target size
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = height;
  const tempCtx = tempCanvas.getContext('2d');

  // Load, scale, and add each frame
  for (const file of files) {
    const bmp = await createImageBitmap(file);
    tempCtx.clearRect(0, 0, width, height);

    // Contain image inside target width/height, centered
    const scale = Math.min(width / bmp.width, height / bmp.height);
    const dw = Math.round(bmp.width * scale);
    const dh = Math.round(bmp.height * scale);
    const dx = Math.floor((width - dw) / 2);
    const dy = Math.floor((height - dh) / 2);

    tempCtx.save();
    tempCtx.imageSmoothingEnabled = true;
    tempCtx.imageSmoothingQuality = 'high';
    tempCtx.drawImage(bmp, dx, dy, dw, dh);
    tempCtx.restore();

    gif.addFrame(tempCanvas, { delay, copy: true });
  }

  gif.on('finished', (blob) => {
    URL.revokeObjectURL(workerUrl);
    const url = URL.createObjectURL(blob);
    resultImg.src = url;
    downloadLink.href = url;
    downloadLink.style.display = 'inline-block';
    statusEl.textContent = 'Done.';
    btn.disabled = false;
  });

  gif.on('progress', (p) => {
    statusEl.textContent = `Building GIF… ${(p * 100).toFixed(0)}%`;
  });

  gif.render();
});

function clampInt(v, min, max) {
  if (Number.isNaN(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function waitFor(fn, interval = 50, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const t = setInterval(() => {
      if (fn()) {
        clearInterval(t);
        resolve();
      } else if (performance.now() - start > timeout) {
        clearInterval(t);
        reject(new Error('Timeout waiting for condition'));
      }
    }, interval);
  });
}

