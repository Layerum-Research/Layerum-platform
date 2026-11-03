import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsOptional,
  IsBoolean,
  IsNumber,
  Min,
  Max,
} from 'class-validator';

export class PublicQueryRequestDto {
  @IsUUID()
  entityId: string;

  @IsUUID()
  modelConfigId: string;

  @IsString()
  @IsNotEmpty()
  query: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  topK?: number;

  @IsOptional()
  @IsBoolean()
  includeParentScopes?: boolean;
}
