import { BadGatewayException } from '@nestjs/common';
import { ContactRequestsService } from './contact-requests.service';
import { type EmailSender, type EmailService } from '../email/email.service';

describe('ContactRequestsService', () => {
  beforeEach(() => {
    process.env.CONTACT_REQUESTS_EMAIL = 'inbox@example.com';
  });

  afterEach(() => {
    delete process.env.CONTACT_REQUESTS_EMAIL;
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
    const service = new ContactRequestsService(emailService as EmailService);
    await service.submit({
      name: 'John Doe',
      email: 'john@company.ai',
      message: 'Need help with architecture.',
    });

    expect(capturedTo).toBe('inbox@example.com');
    expect(capturedReplyTo).toBe('john@company.ai');
    expect(capturedSubject).toBe('New contact request from John Doe');
    expect(capturedTextBody).toContain('Need help with architecture.');
  });

  it('bubbles email delivery errors', async () => {
    const emailService: EmailSender = {
      sendTextEmail: () => {
        return Promise.reject(new BadGatewayException('Failed'));
      },
    };
    const service = new ContactRequestsService(emailService as EmailService);

    await expect(
      service.submit({
        name: 'Jane Doe',
        email: 'jane@company.ai',
        message: 'Help needed.',
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('refuses to send when CONTACT_REQUESTS_EMAIL is not set', async () => {
    delete process.env.CONTACT_REQUESTS_EMAIL;
    const sendTextEmail = jest.fn();
    const service = new ContactRequestsService({ sendTextEmail } as EmailSender as EmailService);

    await expect(
      service.submit({ name: 'Jane Doe', email: 'jane@company.ai', message: 'Help needed.' }),
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(sendTextEmail).not.toHaveBeenCalled();
  });
});
