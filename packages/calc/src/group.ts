// Состав группы: docs/14-trip-parameters-spec.md, раздел 1.

export type Count = 1 | 2;

export interface Group {
  people: Count;
  motorcycles: Count;
}

/** При двух мотоциклах людей не меньше двух. */
export function normalizeGroup(group: Group): Group {
  if (group.motorcycles === 2 && group.people < 2) {
    return { people: 2, motorcycles: 2 };
  }
  return group;
}
