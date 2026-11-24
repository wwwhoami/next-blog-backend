import { ApiPayloadTooLargeResponse } from '@nestjs/swagger';

export function ApiJsonBodyLimit(limit = '100 KiB') {
  return ApiPayloadTooLargeResponse({
    description: `JSON body exceeds ${limit}.`,
  });
}
