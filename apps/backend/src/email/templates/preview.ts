import { render } from '@react-email/render';
import { VerificationEmail } from './verification-email';

async function main() {
  const html = await render(
    VerificationEmail({
      verificationUrl: 'https://example.com/verify?token=test123',
      userEmail: 'test@example.com',
    }),
  );

  console.log(html);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
