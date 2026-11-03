export const DRAFT_PROCESSOR_QUEUE = 'draft-processor';
export const VALIDATE_AND_PUBLISH_JOB = 'validate-and-publish';
export const CLEANUP_ARCHIVED_REVISIONS_JOB = 'cleanup-archived-revisions';

export interface DraftPublishJobData {
  draftId: string;
  ownerId: string;
}
