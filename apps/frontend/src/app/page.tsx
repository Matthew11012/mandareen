import { HeroSection } from "@/components/landing/HeroSection";
import { ValuePillars } from "@/components/landing/ValuePillars";
import { FeatureGrid } from "@/components/landing/FeatureGrid";
import { SocialProof } from "@/components/landing/SocialProof";
import { PricingSection, FinalCTA } from "@/components/landing/Sections";
import { FAQ } from "@/components/landing/FAQ";
import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-black text-[var(--color-text-primary)] font-inter selection:bg-white/20">
      {/* Floating Header */}
      <header className="fixed top-6 left-0 right-0 z-50 pointer-events-none">
        <div className="max-w-fit mx-auto pointer-events-auto">
          <div className="flex items-center gap-2 p-1.5 pr-6 rounded-full border border-white/10 bg-neutral-900/80 backdrop-blur-md shadow-2xl shadow-black/50">
            <Link
              href="/"
              className="flex items-center gap-2 px-3 py-2 rounded-full hover:bg-white/5 transition-colors"
            >
              <div className="w-6 h-6 bg-white rounded-md flex items-center justify-center">
                <span className="text-black font-bold text-xs">普</span>
              </div>
              <span className="font-bold text-sm text-white hidden sm:block">
                Mandareen
              </span>
            </Link>

            <div className="h-4 w-px bg-white/10 mx-2" />

            <nav className="hidden md:flex items-center gap-1">
              <a
                href="#features"
                className="px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-white transition-colors rounded-full hover:bg-white/5"
              >
                Features
              </a>
              <a
                href="#pricing"
                className="px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-white transition-colors rounded-full hover:bg-white/5"
              >
                Pricing
              </a>
              <a
                href="#faq"
                className="px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-white transition-colors rounded-full hover:bg-white/5"
              >
                FAQ
              </a>
            </nav>

            <div className="pl-2">
              <Link
                href="/login"
                className="px-4 py-2 text-xs font-semibold bg-white text-black rounded-full hover:bg-white/90 transition-colors"
              >
                Log in
              </Link>
            </div>
          </div>
        </div>
      </header>

      <HeroSection />

      <SocialProof />

      <ValuePillars />

      <FeatureGrid />

      <PricingSection />

      <FAQ />

      <FinalCTA />

      <footer className="border-t border-white/10 bg-neutral-950 py-12">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-neutral-900 rounded-lg flex items-center justify-center border border-white/10">
              <span className="text-white font-bold text-sm">普</span>
            </div>
            <span className="font-semibold text-white/50 text-sm">
              © {new Date().getFullYear()} Mandareen
            </span>
          </div>

          <div className="flex gap-6 text-sm text-[var(--color-text-secondary)]">
            <Link
              href="/privacy"
              className="hover:text-white transition-colors"
            >
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-white transition-colors">
              Terms
            </Link>
            <Link
              href="/twitter"
              className="hover:text-white transition-colors"
            >
              Twitter
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
