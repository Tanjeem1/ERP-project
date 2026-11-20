export function allocateMinor(totalMinor: number, basisValues: number[]) {
  if (!Number.isSafeInteger(totalMinor) || totalMinor < 0) throw new Error("Allocation total must be a non-negative integer in minor currency units.");
  if (basisValues.length === 0) {
    if (totalMinor !== 0) throw new Error("Cannot allocate costs without receipt lines.");
    return [];
  }
  if (basisValues.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("Allocation basis values must be finite and non-negative.");
  }
  if (totalMinor === 0) return basisValues.map(() => 0);

  const basisTotal = basisValues.reduce((sum, value) => sum + value, 0);
  if (basisTotal <= 0) throw new Error("The selected allocation basis has a zero total. Choose another method.");
  const allocations = basisValues.map((basis, index) => {
    const exact = (totalMinor * basis) / basisTotal;
    const allocated = Math.floor(exact);
    return { index, allocated, fraction: exact - allocated };
  });
  let remainder = totalMinor - allocations.reduce((sum, item) => sum + item.allocated, 0);
  const ranking = [...allocations].sort((left, right) => right.fraction - left.fraction || left.index - right.index);

  for (let index = 0; remainder > 0; index += 1, remainder -= 1) {
    const target = ranking[index % ranking.length];
    if (!target) throw new Error("Unable to distribute the allocation remainder.");
    target.allocated += 1;
  }
  return allocations.map((item) => item.allocated);
}

export function toMinor(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100);
}

export function fromMinor(value: number) {
  return value / 100;
}
