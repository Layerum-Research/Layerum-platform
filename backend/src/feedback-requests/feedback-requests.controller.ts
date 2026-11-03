import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FeedbackRequestsService } from './feedback-requests.service';
import { CreateFeedbackRequestDto } from './dto/create-feedback-request.dto';

@ApiTags('feedback-requests')
@Controller('feedback-requests')
export class FeedbackRequestsController {
  constructor(private readonly service: FeedbackRequestsService) {}

  @Post()
  submit(@Body() dto: CreateFeedbackRequestDto) {
    return this.service.submit(dto);
  }
}
