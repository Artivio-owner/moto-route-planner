// Геометрия: расстояния, упрощение линии для показа на карте.

export type LonLat = [number, number];

const EARTH_RADIUS_KM = 6371.0088;

export function haversineKm(a: LonLat, b: LonLat): number {
  const toRad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toRad;
  const dLon = (b[0] - a[0]) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * toRad) * Math.cos(b[1] * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Нарастающее расстояние от первой точки, км. */
export function cumulativeKm(points: readonly LonLat[]): number[] {
  const result = [0];
  for (let i = 1; i < points.length; i++) {
    result.push((result[i - 1] ?? 0) + haversineKm(points[i - 1] as LonLat, points[i] as LonLat));
  }
  return result;
}

/** Расстояние от точки до отрезка и доля t (0…1) ближайшей точки на нём; локальная проекция. */
export function projectToSegment(p: LonLat, a: LonLat, b: LonLat): { km: number; t: number } {
  const kx = 111.32 * Math.cos((p[1] * Math.PI) / 180);
  const ky = 110.574;
  const [px, py] = [p[0] * kx, p[1] * ky];
  const [ax, ay] = [a[0] * kx, a[1] * ky];
  const [bx, by] = [b[0] * kx, b[1] * ky];
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return { km: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)), t };
}

function pointToSegmentKm(p: LonLat, a: LonLat, b: LonLat): number {
  return projectToSegment(p, a, b).km;
}

/** Индексы точек, оставшихся после упрощения Дугласа — Пекера с допуском toleranceKm. */
export function simplifyIndices(points: readonly LonLat[], toleranceKm: number): number[] {
  if (points.length <= 2) return points.map((_, i) => i);
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop() as [number, number];
    let maxDist = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = pointToSegmentKm(
        points[i] as LonLat,
        points[first] as LonLat,
        points[last] as LonLat,
      );
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (index !== -1 && maxDist > toleranceKm) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  const result: number[] = [];
  keep.forEach((k, i) => {
    if (k) result.push(i);
  });
  return result;
}

/**
 * Упрощение профиля высоты (E-01) тем же способом Дугласа — Пекера, но по расстоянию
 * и высоте: точка остаётся, если высота отклоняется от прямой между соседями больше допуска.
 */
export function simplifyProfileIndices(
  km: readonly number[],
  elevation: readonly number[],
  toleranceM: number,
): number[] {
  const n = Math.min(km.length, elevation.length);
  if (n <= 2) return Array.from({ length: n }, (_, i) => i);
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [first, last] = stack.pop() as [number, number];
    const k0 = km[first] ?? 0;
    const k1 = km[last] ?? 0;
    const e0 = elevation[first] ?? 0;
    const e1 = elevation[last] ?? 0;
    let maxDev = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const t = k1 === k0 ? 0 : ((km[i] ?? 0) - k0) / (k1 - k0);
      const dev = Math.abs((elevation[i] ?? 0) - (e0 + t * (e1 - e0)));
      if (dev > maxDev) {
        maxDev = dev;
        index = i;
      }
    }
    if (index !== -1 && maxDev > toleranceM) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  const result: number[] = [];
  keep.forEach((k, i) => {
    if (k) result.push(i);
  });
  return result;
}
