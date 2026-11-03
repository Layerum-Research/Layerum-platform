import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { CreateFeedbackRequestDto } from './dto/create-feedback-request.dto';
import { EmailService } from '../email/email.service';

@Injectable()
export class FeedbackRequestsService {
  private readonly logger = new Logger(FeedbackRequestsService.name);

  constructor(private readonly emailService: EmailService) {}

  async submit(dto: CreateFeedbackRequestDto) {
    const submittedAt = new Date().toISOString();
    const categories = (dto.categories ?? []).filter(Boolean);
    const subject = `New feedback from ${dto.name}`;
    const textBody = [
      'New feedback received.',
      '',
      `Submitted At: ${submittedAt}`,
      `Name: ${dto.name}`,
      `Email: ${dto.email}`,
      dto.context ? `Context: ${dto.context}` : null,
      dto.page ? `Page: ${dto.page}` : null,
      categories.length ? `Categories: ${categories.join(', ')}` : null,
      '',
      'Message:',
      dto.message,
    ]
      .filter((line): line is string => line !== null)
      .join('\n');

    const to = process.env.FEEDBACK_EMAIL?.trim();
    if (!to) {
      this.logger.error('FEEDBACK_EMAIL is missing');
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
