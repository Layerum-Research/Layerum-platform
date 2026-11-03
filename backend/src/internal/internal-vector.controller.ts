import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { VectorService } from '../vector/vector.service';
import { InternalAuthGuard } from './internal-auth.guard';

@UseGuards(InternalAuthGuard)
@Controller('internal/vector')
export class InternalVectorController {
  constructor(private readonly vector: VectorService) {}

  @Get('collections')
  getCollections() {
    return this.vector.getCollections();
  }

  @Post('search')
  search(
    @Body()
    body: {
      vector?: number[];
      filter?: { workspaceId?: unknown; entityIds?: unknown };
      topK?: number;
    },
  ) {
    const vector = Array.isArray(body?.vector) ? body.vector : [];
    const workspaceId = body?.filter?.workspaceId;
    const entityIds = body?.filter?.entityIds;
    if (
      typeof workspaceId !== 'string' ||
      !Array.isArray(entityIds) ||
      !entityIds.every((id) => typeof id === 'string')
    ) {
      throw new BadRequestException('filter must contain workspaceId and entityIds');
    }
    const topK = Number(body?.topK ?? 8);
    return this.vector.search(vector, { workspaceId, entityIds }, topK);
  }

  @Post('delete-points')
  deletePoints(@Body() body: { collectionName?: string; pointIds?: string[] }) {
    const collectionName = (body?.collectionName ?? '').trim();
    const pointIds = Array.isArray(body?.pointIds) ? body.pointIds : [];
    return this.vector.deletePoints(collectionName, pointIds);
  }

  @Post('delete-by-payload')
  deleteByPayload(
    @Body()
    body: { workspaceId?: string; documentId?: string; collectionName?: string },
  ) {
    const workspaceId = (body?.workspaceId ?? '').trim();
    const documentId = (body?.documentId ?? '').trim();
    const collectionName = body?.collectionName?.trim() || undefined;
    return this.vector.deleteByPayload(workspaceId, documentId, collectionName);
  }
}
