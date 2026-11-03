import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsIn,
  IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const PROVIDERS = [
  'openai',
  'anthropic',
  'cohere',
  'google',
  'mistral',
  'groq',
  'together',
  'azure_openai',
  'qwen',
  'kimi',
  'deepseek',
  'custom',
];

export class CreateProviderDto {
  @ApiProperty({ enum: PROVIDERS })
  @IsString()
  @IsIn(PROVIDERS)
  provider: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  display_name: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  api_key: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  entity_id?: string;

  @ApiPropertyOptional({
    description:
      'Provider-specific runtime options (for example base_url, region, deployment, api_version).',
    type: Object,
  })
  @IsOptional()
  @IsObject()
  provider_config?: Record<string, unknown>;
}
