import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign Up | Mandareen',
  description: 'Create your Mandareen account and start learning Mandarin with AI',
};

export default function SignUpLayout({
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