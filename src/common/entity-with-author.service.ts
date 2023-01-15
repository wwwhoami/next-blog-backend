export abstract class EntityWithAuthorService {
  abstract getAuthorId(id: number): Promise<{ authorId: string }>;
}
