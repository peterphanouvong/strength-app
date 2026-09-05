// Renders a 1080×1920 story-format card for the share-preview sheet. Sharing
// hands the image to the native share sheet (Instagram shows up there when
// sharing an image) and falls back to a download when that's unavailable.

export type ShareStats = {
  dayName: string;
  weekNum: number;
  duration: string;
  volume: string;
  sets: string;
};

export async function renderShareCard({ dayName, weekNum, duration, volume, sets }: ShareStats): Promise<Blob> {
  await document.fonts.ready;

  const W = 1080;
  const H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const font = (weight: number, size: number) => `${weight} ${size}px "Space Grotesk", sans-serif`;

  // Background
  ctx.fillStyle = '#2a2ae0';
  ctx.fillRect(0, 0, W, H);

  // Confetti
  const colors = ['#f7e353', '#7bf1a8', '#ffffff', '#ff3d2e', '#b9b9f2'];
  for (let i = 0; i < 40; i++) {
    ctx.save();
    ctx.translate(((i * 263 + 97) % W), ((i * 379 + 151) % H));
    ctx.rotate(((i * 53) % 360) * (Math.PI / 180));
    ctx.fillStyle = colors[i % colors.length];
    ctx.globalAlpha = 0.9;
    ctx.fillRect(0, 0, i % 3 === 0 ? 26 : 14, i % 3 === 0 ? 14 : 30);
    ctx.restore();
  }

  const left = 96;

  // Header
  ctx.fillStyle = '#b9b9f2';
  ctx.font = font(700, 40);
  ctx.fillText('Volleyball Strength', left, 220);

  ctx.fillStyle = '#ffffff';
  ctx.font = font(500, 44);
  ctx.fillText(`Week ${weekNum} · ${dayName}`, left, 300);

  // Headline
  ctx.font = font(700, 220);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('NICE', left, 640);
  ctx.fillStyle = '#7bf1a8';
  ctx.fillText('WORK.', left, 850);

  // Stats card
  const cardY = 1000;
  const cardH = 460;
  ctx.fillStyle = '#f7e353';
  ctx.beginPath();
  ctx.roundRect(left, cardY, W - left * 2, cardH, 48);
  ctx.fill();

  const stats: [string, string][] = [
    ['Duration', duration],
    ['Volume', volume],
    ['Sets', sets],
  ];
  stats.forEach(([label, value], i) => {
    const y = cardY + 130 + i * 130;
    ctx.fillStyle = 'rgba(30, 30, 184, 0.7)';
    ctx.font = font(700, 40);
    ctx.fillText(label, left + 72, y);
    ctx.fillStyle = '#1e1eb8';
    ctx.font = font(700, 72);
    ctx.textAlign = 'right';
    ctx.fillText(value, W - left - 72, y + 4);
    ctx.textAlign = 'left';
  });

  // Footer
  ctx.fillStyle = '#b9b9f2';
  ctx.font = font(500, 40);
  ctx.fillText('12-week strength & power programme', left, H - 160);

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas export failed'))), 'image/png')
  );
}

/** Save the rendered card to disk (the "Save image" action and the no-share fallback). */
export function downloadImage(blob: Blob, weekNum: number) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `workout-week${weekNum}.png`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Share an already-rendered card: native share sheet when available, else the
 * same download fallback as always. Returns how it ended.
 */
export async function shareImage(blob: Blob, weekNum: number): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], 'workout.png', { type: 'image/png' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Workout complete' });
      return 'shared';
    } catch {
      return 'cancelled'; // user dismissed the sheet
    }
  }

  downloadImage(blob, weekNum);
  return 'downloaded';
}
