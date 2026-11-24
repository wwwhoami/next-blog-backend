import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';

export function ApiAccessTokenAuth() {
  return applyDecorators(
    ApiBearerAuth('accessToken'),
    ApiUnauthorizedResponse({
      description: 'Access token is missing, invalid, or expired.',
    }),
  );
}
