import { BadGatewayException } from '@nestjs/common';
import { FeedbackRequestsService } from './feedback-requests.service';
import { type EmailSender, type EmailService } from '../email/email.service';

describe('FeedbackRequestsService', () => {
  beforeEach(() => {
    process.env.FEEDBACK_EMAIL = 'inbox@example.com';
  });

  afterEach(() => {
    delete process.env.FEEDBACK_EMAIL;
    jest.resetAllMocks();
  });

  it('formats the expected email payload', async () => {
    let capturedTo = '';
    let capturedReplyTo = '';
    let capturedSubject = '';
    let capturedTextBody = '';
    const emailService: EmailSender = {
      sendTextEmail: (input) => {
        capturedTo = input.to;
        capturedReplyTo = input.replyTo ?? '';
        capturedSubject = input.subject;
        capturedTextBody = input.textBody;
        return Promise.resolve({ success: true });
      },
    };
    const service = new FeedbackRequestsService(emailService as EmailService);
    await service.submit({
      name: 'John Doe',
      email: 'john@company.ai',
      message: 'There is a bug in the workspace header.',
      categories: ['bug', 'question'],
      context: 'Workspace topbar',
      page: '/w/demo/hierarchy',
    });

    expect(capturedTo).toBe('inbox@example.com');
    expect(capturedReplyTo).toBe('john@company.ai');
    expect(capturedSubject).toBe('New feedback from John Doe');
    expect(capturedTextBody).toContain('Categories: bug, question');
  });

  it('bubbles email delivery errors', async () => {
    const emailService: EmailSender = {
      sendTextEmail: () => {
        return Promise.reject(new BadGatewayException('Failed'));
      },
    };
    const service = new FeedbackRequestsService(emailService as EmailService);

    await expect(
      service.submit({
        name: 'Jane Doe',
        email: 'jane@company.ai',
        message: 'Need help.',
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('refuses to send when FEEDBACK_EMAIL is not set', async () => {
    delete process.env.FEEDBACK_EMAIL;
    const sendTextEmail = jest.fn();
    const service = new FeedbackRequestsService({ sendTextEmail } as EmailSender as EmailService);

    await expect(
      service.submit({ name: 'Jane Doe', email: 'jane@company.ai', message: 'Need help.' }),
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(sendTextEmail).not.toHaveBeenCalled();
  });
});
