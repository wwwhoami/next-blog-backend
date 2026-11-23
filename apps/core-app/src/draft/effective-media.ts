export function effectiveMedia<T>({
  draftMedia = [],
}: {
  draftMedia?: { media: T }[];
}): T[] {
  return draftMedia.map(({ media }) => media);
}
