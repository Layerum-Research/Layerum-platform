import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsNumber,
  IsBoolean,
  Min,
  Max,
  IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateModelConfigDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty()
  @IsUUID()
  llm_model_id: string;

  @ApiProperty()
  @IsUUID()
  embedding_model_id: string;

  // temporarily disabled:
  // @ApiPropertyOptional()
  // @IsOptional()
  // @IsUUID()
  // reranker_model_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  provider_connection_id?: string;

  @ApiPropertyOptional({
    description: 'Provider connection used for the LLM call.',
  })
  @IsOptional()
  @IsUUID()
  llm_provider_connection_id?: string;

  @ApiPropertyOptional({
    description: 'Provider connection used for embedding calls.',
  })
  @IsOptional()
  @IsUUID()
  embedding_provider_connection_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  entity_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  system_prompt?: string;

  @ApiPropertyOptional({
    description: 'Prefix prepended to each document chunk before embedding.',
  })
  @IsOptional()
  @IsString()
  embedding_doc_prefix?: string;

  @ApiPropertyOptional({
    description: 'Prefix prepended to user query before embedding.',
  })
  @IsOptional()
  @IsString()
  embedding_query_prefix?: string;

  @ApiPropertyOptional({ default: 0.7 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @ApiPropertyOptional({ default: 8 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  top_k?: number;

  @ApiPropertyOptional({ enum: ['fixed', 'sliding', 'semantic'] })
  @IsOptional()
  @IsString()
  @IsIn(['fixed', 'sliding', 'semantic'])
  chunk_strategy?: 'fixed' | 'sliding' | 'semantic';

  @ApiPropertyOptional({ default: 512 })
  @IsOptional()
  @IsNumber()
  chunk_size?: number;

  @ApiPropertyOptional({ default: 64 })
  @IsOptional()
  @IsNumber()
  chunk_overlap?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_default?: boolean;
}
