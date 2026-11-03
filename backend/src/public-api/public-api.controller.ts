import {
  Body,
  Controller,
  Delete,
  GoneException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiKeyAuthGuard } from '../common/guards/api-key-auth.guard';
import { ApiKeyPrincipalParam } from '../common/decorators/api-key-principal.decorator';
import type { ApiKeyPrincipal } from '../common/interfaces/api-key-principal.interface';
import { PublicApiService } from './public-api.service';
import { PublicQueryRequestDto } from './dto/public-query-request.dto';
import { CreateEntityDto } from '../entities/dto/create-entity.dto';
import { CreateEntityTypeDto } from '../entity-types/dto/create-entity-type.dto';
import { CreateDataSourceDto } from '../data-sources/dto/create-data-source.dto';
import { InitUploadDto } from '../data-sources/dto/init-upload.dto';
import { CompleteUploadDto } from '../data-sources/dto/complete-upload.dto';
import { CreateProviderDto } from '../provider-connections/dto/create-provider.dto';
import { CreateModelConfigDto } from '../model-configs/dto/create-model-config.dto';

@ApiTags('public-api')
@UseGuards(ApiKeyAuthGuard)
@Controller('v1')
export class PublicApiController {
  constructor(private readonly service: PublicApiService) {}

  @Get('entities')
  listEntities(@ApiKeyPrincipalParam() principal: ApiKeyPrincipal) {
    return this.service.listEntities(principal);
  }

  @Get('entities/tree')
  listEntityTree(@ApiKeyPrincipalParam() principal: ApiKeyPrincipal) {
    return this.service.listEntityTree(principal);
  }

  @Post('entities')
  createEntity(
    @ApiKeyPrincipalParam() principal: ApiKeyPrincipal,
    @Body() dto: CreateEntityDto,
  ) {
    return this.service.createEntity(principal, dto);
  }

  @Get('entity-types')
  listEntityTypes(@ApiKeyPrincipalParam() principal: ApiKeyPrincipal) {
    return this.service.listEntityTypes(principal);
  }

  @Get('entity-types/:id')
  getEntityType(
    @ApiKeyPrincipalParam() principal: ApiKeyPrincipal,
    @Param('id') id: string,
  ) {
    return this.service.getEntityType(principal, id);
  }

  @Post('entity-types')
  createEntityType(
    @ApiKeyPrincipalParam() principal: ApiKeyPrincipal,
    @Body() dto: CreateEntityTypeDto,
  ) {
    return this.service.createEntityType(principal, dto);
  }

  @Delete('entity-types/:id')
  deleteEntityType(
    @ApiKeyPrincipalParam() principal: ApiKeyPrincipal,
    @Param('id') id: string,
  ) {
    return this.service.deleteEntityType(principal, id);
  }

  @Delete('entities/:id')
  deleteEntity(
    @ApiKeyPrincipalParam() principal: ApiKeyPrincipal,
    @Param('id') id: string,
  ) {
    return this.service.deleteEntity(principal, id);
  }

  @Get('entities/:entityId/documents')
  listEntityDocuments(
    @ApiKeyPrincipalParam() principal: ApiKeyPrincipal,
    @Param('entityId') entityId: string,
  ) {
    return this.service.listEntityDocuments(principal, entityId);
  }

  @Get('documents')
  listWorkspaceDocuments(@ApiKeyPrincipalParam() principal: ApiKeyPrincipal) {
    return this.service.listWorkspaceDocuments(principal);
  }

  @Get('entities/:entityId/documents/:id')
  getDocument(
    @ApiKeyPrincipalParam() principal: ApiKeyPrincipal,
    @Param('entityId') entityId: string,
    @Param('id') id: string,
  ) {
    return this.service.getDocument(principal, entityId, id);
  }

  @Post('entities/:entityId/documents')
  createDocument(
    @ApiKeyPrincipalParam() principal: ApiKeyPrincipal,
    @Param('entityId') entityId: string,
    @Body() dto: CreateDataSourceDto,
  ) {
    return this.service.createDocument(principal, entityId, dto);
  }

  @Post('entities/:entityId/documents/upload')
  uploadDocument() {
    throw new GoneException(
      'Direct upload endpoint is disabled. Use /documents/upload/init and /documents/upload/complete.',
    );
  }

  @Post('entities/:entityId/documents/upload/init')
  uploadDocumentInit(
    @ApiKeyPrincipalParam() principal: ApiKeyPrincipal,
    @Param('entityId') entityId: string,
    @Body() dto: InitUploadDto,
  ) {
    return this.service.uploadDocumentInit(principal, entityId, dto);
  }

  @Post('entities/:entityId/documents/upload/complete')
  uploadDocumentComplete(
    @ApiKeyPrincipalParam() principal: ApiKeyPrincipal,
    @Param('entityId') entityId: string,
    @Body() dto: CompleteUploadDto,
  ) {
    return this.service.uploadDocumentComplete(principal, entityId, dto);
  }

  @Delete('entities/:entityId/documents/:id')
  deleteDocument(
    @ApiKeyPrincipalParam() principal: ApiKeyPrincipal,
    @Param('entityId') entityId: string,
    @Param('id') id: string,
  ) {
    return this.service.deleteDocument(principal, entityId, id);
  }

  @Post('entities/:entityId/documents/:id/retry')
  retryDocumentIngestion(
    @ApiKeyPrincipalParam() principal: ApiKeyPrincipal,
    @Param('entityId') entityId: string,
    @Param('id') id: string,
  ) {
    return this.service.retryDocumentIngestion(principal, entityId, id);
  }

  @Get('entities/:entityId/documents/:id/error')
  getDocumentError(
    @ApiKeyPrincipalParam() principal: ApiKeyPrincipal,
    @Param('entityId') entityId: string,
    @Param('id') id: string,
  ) {
    return this.service.getDocumentError(principal, entityId, id);
  }

  @Get('models')
  listModels(@ApiKeyPrincipalParam() principal: ApiKeyPrincipal) {
    return this.service.listModels(principal);
  }

  @Get('models/:id')
  getModel(
    @ApiKeyPrincipalParam() principal: ApiKeyPrincipal,
    @Param('id') id: string,
  ) {
    return this.service.getModel(principal, id);
  }

  @Post('models')
  createModel(
    @ApiKeyPrincipalParam() principal: ApiKeyPrincipal,
    @Body() dto: CreateModelConfigDto,
  ) {
    return this.service.createModel(principal, dto);
  }

  @Patch('models/:id')
  updateModel(
    @ApiKeyPrincipalParam() principal: ApiKeyPrincipal,
    @Param('id') id: string,
    @Body() dto: Partial<CreateModelConfigDto>,
  ) {
    return this.service.updateModel(principal, id, dto);
  }

  @Delete('models/:id')
  deleteModel(
    @ApiKeyPrincipalParam() principal: ApiKeyPrincipal,
    @Param('id') id: string,
  ) {
    return this.service.deleteModel(principal, id);
  }

  @Get('providers')
  listProviders(@ApiKeyPrincipalParam() principal: ApiKeyPrincipal) {
    return this.service.listProviders(principal);
  }

  @Get('providers/:id')
  getProvider(
    @ApiKeyPrincipalParam() principal: ApiKeyPrincipal,
    @Param('id') id: string,
  ) {
    return this.service.getProvider(principal, id);
  }

  @Post('providers')
  createProvider(
    @ApiKeyPrincipalParam() principal: ApiKeyPrincipal,
    @Body() dto: CreateProviderDto,
  ) {
    return this.service.createProvider(principal, dto);
  }

  @Post('providers/:id/test')
  testProvider(
    @ApiKeyPrincipalParam() principal: ApiKeyPrincipal,
    @Param('id') id: string,
  ) {
    return this.service.testProvider(principal, id);
  }

  @Delete('providers/:id')
  deleteProvider(
    @ApiKeyPrincipalParam() principal: ApiKeyPrincipal,
    @Param('id') id: string,
  ) {
    return this.service.deleteProvider(principal, id);
  }

  @Get('model-definitions')
  listModelDefinitions(
    @ApiKeyPrincipalParam() principal: ApiKeyPrincipal,
    @Query('type') type?: string,
  ) {
    return this.service.listModelDefinitions(principal, type);
  }

  @Post('query')
  query(
    @ApiKeyPrincipalParam() principal: ApiKeyPrincipal,
    @Body() dto: PublicQueryRequestDto,
  ) {
    return this.service.query(principal, dto);
  }

  @Post('query/debug')
  queryDebug(
    @ApiKeyPrincipalParam() principal: ApiKeyPrincipal,
    @Body() dto: PublicQueryRequestDto,
  ) {
    return this.service.queryDebug(principal, dto);
  }
}
