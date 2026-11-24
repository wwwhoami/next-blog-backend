export function getAttachedDraftMedia<T>({
  draftMedia = [],
}: {
  draftMedia?: { media: T }[];
}): T[] {
  return draftMedia.map(({ media }) => media);
}
