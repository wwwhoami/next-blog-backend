import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import Ajv, { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { CommentController } from '../../comment/comment.controller';
import { DraftController } from '../../draft/draft.controller';
import { MediaController } from '../../media/media.controller';
import metadata from '../../metadata';
import { PostController } from '../../post/post.controller';

const uuid = 'ab182222-5603-4b01-909b-a68fbb3a2153';
const timestamp = '2026-01-01T12:00:00.000Z';
const revisionPath = '/post/{id}/draft';

describe('Core Swagger response contracts', () => {
  let app: INestApplication;
  let document: OpenAPIObject;
  const ajv = addFormats(new Ajv({ strict: false }));

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [
        CommentController,
        DraftController,
        MediaController,
        PostController,
      ],
    })
      .useMocker(() => ({}))
      .compile();

    app = module.createNestApplication();
    await SwaggerModule.loadPluginMetadata(metadata);
    document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
    expect(document.openapi).toMatch(/^3\.0\./);
  });

  afterAll(async () => {
    await app?.close();
  });

  function response(
    path: string,
    method: 'get' | 'post' | 'delete',
    status: number,
  ) {
    const result = document.paths[path]?.[method]?.responses[status];
    if (!result || '$ref' in result) {
      throw new Error(
        `Expected an inline response for ${method} ${path} (${status})`,
      );
    }
    return result;
  }

  function validator(
    path: string,
    method: 'get' | 'post' | 'delete',
    status: number,
  ) {
    const schema = response(path, method, status).content?.['application/json']
      ?.schema;
    expect(schema).toBeDefined();
    return ajv.compile({ ...schema, components: document.components });
  }

  function expectValid(validate: ValidateFunction, payload: unknown) {
    validate(payload);
    expect(validate.errors).toBeNull();
  }

  it('accepts an omitted, null, or populated post on a draft', () => {
    const validate = validator('/draft/{id}', 'get', 200);
    const draft = {
      id: uuid,
      ownerId: uuid,
      title: 'Title',
      excerpt: '',
      content: '',
      categoryNames: [],
      coverMediaId: null,
      postId: null,
      sourceVersion: null,
      deletedPostId: null,
      status: 'ACTIVE',
      publicationAttemptId: null,
      validationError: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
      revisionMode: 'NEW',
      draftMedia: [],
      media: [],
      effectiveMedia: [],
    };
    const post = {
      id: 1,
      title: 'Title',
      content: 'Published content',
      published: true,
      coverImage: '',
      authorId: uuid,
      createdAt: timestamp,
      updatedAt: timestamp,
      excerpt: '',
      slug: 'title',
      likesCount: 0,
      language: 'en',
      version: 2,
    };
    const revision = {
      ...draft,
      revisionMode: 'REVISION',
      postId: 1,
      sourceVersion: 2,
    };

    expectValid(validate, draft);
    expectValid(validate, { ...draft, post: null });
    expectValid(validate, { ...revision, post });
    expect(validate({ ...revision, post: { id: 1 } })).toBe(false);
  });

  it.each(['/comment/{id}/replies', '/comment/article/{articleId}'])(
    'validates recursive list items returned by %s',
    (path) => {
      const validate = validator(path, 'get', 200);
      const { components } = document;
      expect(components?.schemas?.CommentListItem).toMatchObject({
        properties: {
          depth: { type: 'integer' },
          childrenCount: { type: 'integer' },
        },
      });
      expect(components?.schemas?.CommentListItem).not.toHaveProperty(
        'properties.likesCount',
      );

      const root = {
        id: 1,
        postId: 1,
        ancestorId: path.endsWith('/replies') ? 3 : null,
        authorId: null,
        content: '',
        createdAt: timestamp,
        updatedAt: timestamp,
        isDeleted: true,
        depth: 1,
        images: [],
      };
      const reply = {
        ...root,
        id: 2,
        ancestorId: 1,
        authorId: uuid,
        content: 'Reply',
        isDeleted: false,
        depth: 2,
        images: [
          {
            id: uuid,
            publicUrl: 'https://example.com/image.webp',
            mimeType: 'image/webp',
          },
        ],
        childrenCount: 0,
      };

      expectValid(validate, [root, reply]);
      expect(validate([{ ...root, depth: undefined }])).toBe(false);
      expect(validate([{ ...root, depth: 1.5 }])).toBe(false);
      expect(validate([{ ...root, images: undefined }])).toBe(false);
      expect(validate([{ ...reply, images: [{ id: uuid }] }])).toBe(false);
      expect(validate([{ ...reply, childrenCount: 0.5 }])).toBe(false);
    },
  );

  it('retains likesCount on single comments', () => {
    expect(document.components?.schemas?.CommentEntity).toMatchObject({
      required: expect.arrayContaining(['likesCount']),
    });
  });

  it('validates media deletion conflicts', () => {
    const validate = validator('/media/{id}', 'delete', 409);
    const message = 'Media cannot be deleted';
    expectValid(validate, { code: 'MEDIA_IN_USE', message, canForce: true });
    expectValid(validate, {
      code: 'MEDIA_DRAFT_PUBLISHING',
      message,
      canForce: false,
    });
    expectValid(validate, { code: 'MEDIA_VARIANT', message, canForce: false });
    expect(validate({ code: 'UNKNOWN', message, canForce: false })).toBe(false);
    expect(validate({ message, canForce: false })).toBe(false);
    expect(validate({ code: 'MEDIA_VARIANT', canForce: false })).toBe(false);
    expect(validate({ code: 'MEDIA_IN_USE', message, canForce: 'true' })).toBe(
      false,
    );
    expect(validate({ code: 'MEDIA_IN_USE', message })).toBe(false);
    expect(response('/media/{id}', 'delete', 409).description).toMatch(
      /MEDIA_IN_USE.*only this code.*force=true.*confirms/i,
    );
  });

  it('validates the publishing conflict and documents revision recovery', () => {
    const validate = validator(revisionPath, 'post', 409);
    const conflict = {
      message: 'Post revision is already being published',
      draftId: uuid,
      status: 'PUBLISHING',
    };
    expectValid(validate, conflict);
    expect(validate({ ...conflict, message: undefined })).toBe(false);
    expect(validate({ ...conflict, draftId: undefined })).toBe(false);
    expect(validate({ ...conflict, status: undefined })).toBe(false);
    expect(validate({ ...conflict, draftId: 'invalid' })).toBe(false);
    expect(validate({ ...conflict, status: 'ACTIVE' })).toBe(false);
    expect(response(revisionPath, 'post', 409).description).toContain(
      'GET /draft/{draftId}',
    );
    expect(response(revisionPath, 'post', 201).description).toMatch(
      /sourceVersion.*matches the post version.*stale active revision is archived and replaced.*returned draft ID/i,
    );
    expect(response(revisionPath, 'post', 400).description).toMatch(
      /post ID must be an integer.*repair ineligible media.*managed image changed during attachment locking, retry/i,
    );
  });
});
