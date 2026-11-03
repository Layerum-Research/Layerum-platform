import { Module } from '@nestjs/common';
import { ContactRequestsController } from './contact-requests.controller';
import { ContactRequestsService } from './contact-requests.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [EmailModule],
  controllers: [ContactRequestsController],
  providers: [ContactRequestsService],
})
export class ContactRequestsModule {}
