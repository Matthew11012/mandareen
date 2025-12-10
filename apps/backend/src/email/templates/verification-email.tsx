import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
  Tailwind,
} from '@react-email/components';
import * as React from 'react';

interface VerificationEmailProps {
  verificationUrl: string;
  userEmail?: string;
}

export const VerificationEmail = ({
  verificationUrl,
  userEmail,
}: VerificationEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>
        Verify your email address to complete your Mandareen account setup
      </Preview>
      <Tailwind>
        <Body className="bg-[#222831] font-sans">
          <Container className="mx-auto py-12 px-4">
            <Section className="bg-[#2a3039] rounded-lg p-8 max-w-md mx-auto">
              <Section className="text-center mb-6">
                <div className="w-12 h-12 bg-gradient-to-br from-[#4040f2] to-[#6366f1] rounded-lg flex items-center justify-center mx-auto mb-4">
                  <span className="text-white font-bold text-2xl">M</span>
                </div>
                <Heading className="text-white text-2xl font-semibold m-0">
                  Verify your email
                </Heading>
              </Section>

              <Section className="mb-6">
                <Text className="text-[#a6a6a6] text-base leading-relaxed m-0 mb-4">
                  {userEmail ? `Hi there,` : `Hi,`}
                </Text>
                <Text className="text-[#a6a6a6] text-base leading-relaxed m-0 mb-4">
                  Thanks for signing up for Mandareen! Please verify your email
                  address by clicking the button below.
                </Text>
                <Text className="text-[#a6a6a6] text-base leading-relaxed m-0 mb-6">
                  This link will expire in 1 hour for security reasons.
                </Text>
              </Section>

              <Section className="text-center mb-6">
                <Button
                  href={verificationUrl}
                  className="bg-[#4040f2] text-white font-semibold py-3 px-6 rounded-lg no-underline inline-block"
                  style={{
                    backgroundColor: '#4040f2',
                    color: '#ffffff',
                  }}
                >
                  Verify Email Address
                </Button>
              </Section>

              <Section className="mb-6">
                <Text className="text-[#a6a6a6] text-sm m-0 mb-2">
                  If the button does not work, copy and paste this link into your
                  browser:
                </Text>
                <Link
                  href={verificationUrl}
                  className="text-[#9aa6ff] break-all text-sm"
                >
                  {verificationUrl}
                </Link>
              </Section>

              <Section className="border-t border-[#393e46] pt-6 mt-6">
                <Text className="text-[#a6a6a6] text-xs m-0 text-center">
                  If you did not create an account with Mandareen, you can safely
                  ignore this email.
                </Text>
              </Section>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default VerificationEmail;

