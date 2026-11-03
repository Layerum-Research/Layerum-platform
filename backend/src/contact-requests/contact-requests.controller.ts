import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ContactRequestsService } from './contact-requests.service';
import { CreateContactRequestDto } from './dto/create-contact-request.dto';

@ApiTags('contact-requests')
@Controller('contact-requests')
export class ContactRequestsController {
  constructor(private readonly service: ContactRequestsService) {}

  @Post()
  submit(@Body() dto: CreateContactRequestDto) {
    return this.service.submit(dto);
  }
}
