export abstract class EntityWithAuthorService {
  abstract getAuthorId(
    id: number | string,
  ): Promise<{ authorId: string | null }>;
}
