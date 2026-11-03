import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { CreateContactRequestDto } from './dto/create-contact-request.dto';
import { EmailService } from '../email/email.service';

@Injectable()
export class ContactRequestsService {
  private readonly logger = new Logger(ContactRequestsService.name);

  constructor(private readonly emailService: EmailService) {}

  async submit(dto: CreateContactRequestDto) {
    const submittedAt = new Date().toISOString();
    const subject = `New contact request from ${dto.name}`;
    const textBody = [
      'New contact request received.',
      '',
      `Submitted At: ${submittedAt}`,
      `Name: ${dto.name}`,
      `Email: ${dto.email}`,
      '',
      'Message:',
      dto.message,
    ].join('\n');

    const to = process.env.CONTACT_REQUESTS_EMAIL?.trim();
    if (!to) {
      this.logger.error('CONTACT_REQUESTS_EMAIL is missing');
      throw new BadGatewayException('Email service is not configured');
    }

    return this.emailService.sendTextEmail({
      to,
      subject,
      textBody,
      replyTo: dto.email,
    });
  }
}
