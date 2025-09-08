import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Login | Mandareen',
  description: 'Sign in to your Mandareen account to continue learning Mandarin',
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#222831]">
      {children}
    </div>
  );
}