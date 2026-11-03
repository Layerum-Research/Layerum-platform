import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateProviderDto {
  @ApiProperty()
  @IsBoolean()
  is_active: boolean;
}
