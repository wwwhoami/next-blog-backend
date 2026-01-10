import { MediaTarget, MediaType, MediaVariant } from '@prisma/client';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { Observable } from 'rxjs';
import { UploadMediaDto } from '../dto/upload-media.dto';
import { MediaEventsService } from '../media-events.service';
import { MediaController } from '../media.controller';
import { MediaService } from '../media.service';

describe('MediaController', () => {
  let controller: MediaController;
  let mockMediaService: DeepMockProxy<MediaService>;
  let mockEventsService: DeepMockProxy<MediaEventsService>;

  const mockFile: Express.Multer.File = {
    fieldname: 'file',
    originalname: 'test.jpg',
    encoding: '7bit',
    mimetype: 'image/jpeg',
    size: 1024 * 1024,
    buffer: Buffer.from('fake-image-data'),
    destination: '',
    filename: '',
    path: '',
    stream: null as any,
  };

  const mockMediaDto: UploadMediaDto = {
    type: MediaType.IMAGE,
    target: MediaTarget.POST,
  };

  const mockMediaRecord = {
    id: 'media-id-1',
    key: 'uploads/image/user-1/test.webp',
    bucket: 'test-bucket',
    ownerId: 'user-1',
    type: MediaType.IMAGE,
    target: MediaTarget.POST,
    variant: MediaVariant.ORIGINAL,
    mimeType: 'image/webp',
    sizeBytes: BigInt(1024),
    publicUrl: 'https://example.com/media/test.webp',
    hash: 'abcd1234',
    refCount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    postId: null,
    commentId: null,
    parentId: null,
    deletedAt: null,
  };

  beforeEach(async () => {
    mockMediaService = mockDeep<MediaService>();
    mockEventsService = mockDeep<MediaEventsService>();

    // Create controller instance directly to avoid guard dependencies
    controller = new MediaController(mockMediaService, mockEventsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('uploadFile', () => {
    it('should upload file successfully', async () => {
      mockMediaService.upload.mockResolvedValue(mockMediaRecord);

      const result = await controller.uploadFile(
        mockFile,
        'user-1',
        mockMediaDto,
      );

      expect(result).toEqual(mockMediaRecord);
      expect(mockMediaService.upload).toHaveBeenCalledWith(
        mockFile,
        'user-1',
        mockMediaDto,
      );
    });
  });

  describe('getMedia', () => {
    it('should get media with variants', async () => {
      const mockMediaWithVariants = {
        id: mockMediaRecord.id,
        key: mockMediaRecord.key,
        type: mockMediaRecord.type,
        target: mockMediaRecord.target,
        variant: mockMediaRecord.variant,
        publicUrl: mockMediaRecord.publicUrl,
        children: [],
      };

      mockMediaService.getMediaWithVariants.mockResolvedValue(
        mockMediaWithVariants,
      );

      const result = await controller.getMedia('media-id-1');

      expect(result).toEqual(mockMediaWithVariants);
      expect(mockMediaService.getMediaWithVariants).toHaveBeenCalledWith(
        'media-id-1',
      );
    });
  });

  describe('remove', () => {
    it('should remove media reference', async () => {
      mockMediaService.removeReference.mockResolvedValue(mockMediaRecord);

      const result = await controller.remove('media-id-1');

      expect(result).toEqual(mockMediaRecord);
      expect(mockMediaService.removeReference).toHaveBeenCalledWith(
        'media-id-1',
      );
    });
  });

  describe('stream', () => {
    it('should return observable for media variants ready events', () => {
      mockMediaService.getProcessingResult.mockResolvedValue({
        status: 'pending',
        payload: { mediaId: 'media-id-1' },
      });

      const result = controller.stream('media-id-1');
      expect(result).toBeInstanceOf(Observable);
    });
  });
});
