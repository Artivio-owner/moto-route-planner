// Классы дорог и время в пути: docs/14-trip-parameters-spec.md, раздел 2; задача C-01.

export const ROAD_CLASSES = ["motorway", "trunk", "regional", "local"] as const;
export type RoadClass = (typeof ROAD_CLASSES)[number];

/** Подписи классов в интерфейсе. */
export const ROAD_CLASS_LABELS: Record<RoadClass, string> = {
  motorway: "автомагистраль",
  trunk: "магистраль",
  regional: "региональная",
  local: "местная",
};

/** Скорости по классам дорог, км/ч. */
export type Speeds = Record<RoadClass, number>;

/** Участок маршрута с одним классом дороги. */
export interface Segment {
  distanceKm: number;
  roadClass: RoadClass;
  /** Паром: время берём из движка, а не из скоростей. */
  ferry?: boolean;
  /** Платный участок: сумму пользователь вводит в «Прочее». */
  toll?: boolean;
  /** Время участка, ч, если его нельзя считать по скорости (паром). */
  fixedDurationH?: number;
}

export function assertSpeeds(speeds: Speeds): void {
  for (const roadClass of ROAD_CLASSES) {
    const speed = speeds[roadClass];
    if (!Number.isFinite(speed) || speed <= 0) {
      throw new RangeError(
        `Скорость для класса «${ROAD_CLASS_LABELS[roadClass]}» должна быть больше 0`,
      );
    }
  }
}

/** Ходовое время участка, ч. */
export function segmentDurationH(segment: Segment, speeds: Speeds): number {
  if (segment.fixedDurationH !== undefined) return segment.fixedDurationH;
  return segment.distanceKm / speeds[segment.roadClass];
}

/** Ходовое время по списку участков, ч. */
export function drivingTimeH(segments: readonly Segment[], speeds: Speeds): number {
  assertSpeeds(speeds);
  return segments.reduce((sum, segment) => sum + segmentDurationH(segment, speeds), 0);
}

export function totalDistanceKm(segments: readonly Segment[]): number {
  return segments.reduce((sum, segment) => sum + segment.distanceKm, 0);
}

/**
 * Участки между отметками fromKm и toKm от начала маршрута.
 * Участок на границе режется пропорционально; фиксированное время парома тоже.
 */
export function sliceSegments(
  segments: readonly Segment[],
  fromKm: number,
  toKm: number,
): Segment[] {
  const result: Segment[] = [];
  let startKm = 0;
  for (const segment of segments) {
    const endKm = startKm + segment.distanceKm;
    const overlapFrom = Math.max(startKm, fromKm);
    const overlapTo = Math.min(endKm, toKm);
    if (overlapTo > overlapFrom) {
      const part = overlapTo - overlapFrom;
      const share = segment.distanceKm > 0 ? part / segment.distanceKm : 0;
      const piece: Segment = { ...segment, distanceKm: part };
      if (segment.fixedDurationH !== undefined)
        piece.fixedDurationH = segment.fixedDurationH * share;
      result.push(piece);
    }
    startKm = endKm;
    if (startKm >= toKm) break;
  }
  return result;
}
