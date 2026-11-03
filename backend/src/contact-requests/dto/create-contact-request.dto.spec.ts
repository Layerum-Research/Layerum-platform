import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateContactRequestDto } from './create-contact-request.dto';

describe('CreateContactRequestDto', () => {
  it('fails validation for invalid payload', async () => {
    const dto = plainToInstance(CreateContactRequestDto, {
      name: ' ',
      email: 'not-an-email',
      message: '',
    });

    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
    const fields = errors.map((error) => error.property);
    expect(fields).toEqual(
      expect.arrayContaining(['name', 'email', 'message']),
    );
  });

  it('accepts a valid payload', async () => {
    const dto = plainToInstance(CreateContactRequestDto, {
      name: '  Jane Doe  ',
      email: '  jane@example.com ',
      message: '  Need help with integration.  ',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.name).toBe('Jane Doe');
    expect(dto.email).toBe('jane@example.com');
    expect(dto.message).toBe('Need help with integration.');
  });
});
