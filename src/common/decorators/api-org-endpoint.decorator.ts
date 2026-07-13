import { applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';

/**
 * Common Swagger decorators for authenticated org-scoped endpoints.
 */
export function ApiOrgEndpoint(summary: string, description?: string) {
  return applyDecorators(
    ApiBearerAuth(),
    ApiHeader({
      name: 'x-organization-id',
      description: 'Organization ID for multi-tenant scope',
      required: true,
    }),
    ApiOperation({ summary, description }),
    ApiResponse({ status: 401, description: 'Unauthorized' }),
    ApiResponse({ status: 403, description: 'Forbidden' }),
  );
}
