/**
 * Combines direct draft attachments and snapshot links into one list of originals.
 * Direct attachments include uploads made after the last manifest save.
 * Records with the same ID appear once, using the record from the snapshot link.
 *
 * @param draft - The draft's direct attachments and snapshot links.
 * @returns Original media records in order of first appearance.
 */
export function effectiveMedia<
  T extends { id: string; parentId?: string | null },
>({
  media = [],
  draftMedia = [],
}: {
  media?: T[];
  draftMedia?: { media: T }[];
}): T[] {
  return [
    ...new Map(
      [...media, ...draftMedia.map((link) => link.media)]
        .filter(({ parentId }) => parentId == null)
        .map((original) => [original.id, original]),
    ).values(),
  ];
}
