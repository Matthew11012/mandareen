const rawIds = process.env.CURRICULUM_FREE_UNIT_IDS ?? '';

const parsedIds = rawIds
  .split(',')
  .map((value) => parseInt(value.trim(), 10))
  .filter((value) => Number.isFinite(value) && value > 0);

export const FREE_CURRICULUM_UNIT_IDS: number[] = parsedIds;
const DEFAULT_FREE_UNIT_COUNT = 2;

export function isFreeSampleUnit(
  unitId: number,
  unitOrder?: number | null,
): boolean {
  if (FREE_CURRICULUM_UNIT_IDS.length > 0) {
    return FREE_CURRICULUM_UNIT_IDS.includes(unitId);
  }
  if (typeof unitOrder === 'number') {
    return unitOrder >= 1 && unitOrder <= DEFAULT_FREE_UNIT_COUNT;
  }
  return false;
}
