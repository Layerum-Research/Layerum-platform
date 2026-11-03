import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ModelDefinitionsService } from './model-definitions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('model-definitions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('model-definitions')
export class ModelDefinitionsController {
  constructor(private readonly service: ModelDefinitionsService) {}

  @Get()
  findAll(@Query('type') type?: string) {
    return this.service.findAll(type);
  }
}
