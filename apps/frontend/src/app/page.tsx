import { BackgroundEffects } from "@/components/landing/BackgroundEffects";
import { HeroSection } from "@/components/landing/HeroSection";
import {
  PricingSection,
  HowItWorksSection,
  ProofRibbon,
  FinalCTA,
} from "@/components/landing/Sections";
import { FAQ } from "@/components/landing/FAQ";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-black text-[var(--color-text-primary)]">
      <BackgroundEffects />
      <header className="sticky top-4 z-40">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-between rounded-4xl border border-white/10 bg-black/40 backdrop-blur-md shadow-[0_10px_30px_rgba(0,0,0,0.35)] pr-4 pl-8 py-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-neutral-900 rounded-lg flex items-center justify-center border border-white/10">
                <span className="text-white font-bold">普</span>
              </div>
              <span className="font-inter font-semibold">Mandareen</span>
            </div>
            <nav className="flex items-center gap-6">
              <a
                href="#features"
                className="text-[var(--color-text-secondary)] hover:text-white font-inter"
              >
                Features
              </a>
              <a
                href="#pricing"
                className="text-[var(--color-text-secondary)] hover:text-white font-inter"
              >
                Pricing
              </a>
              <a
                href="#faq"
                className="text-[var(--color-text-secondary)] hover:text-white font-inter"
              >
                FAQ
              </a>
            </nav>
          </div>
        </div>
      </header>
      <HeroSection />
      <section className="max-w-6xl mx-auto px-4 py-20 md:py-28">
        <div className="grid grid-cols-1 md:grid-cols-2 items-start gap-10">
          <div>
            <h2 className="font-inter text-3xl md:text-4xl font-bold">
              The problem
            </h2>
            <p className="text-[var(--color-text-secondary)] mt-4 max-w-xl">
              Learning Mandarin can feel overwhelming—too many paths, not enough
              focus. Distraction breaks momentum.
            </p>
          </div>
          <div>
            <h2 className="font-inter text-3xl md:text-4xl font-bold">
              Our approach
            </h2>
            <p className="text-[var(--color-text-secondary)] mt-4 max-w-xl">
              Mandareen gives you a guided path: a quick placement, short
              AI‑guided lessons, real conversations, and reviews that stick.
            </p>
          </div>
        </div>
      </section>
      <HowItWorksSection />
      <ProofRibbon />
      <PricingSection />
      <FinalCTA />
      <FAQ />
      <footer className="max-w-6xl mx-auto px-4 py-8 text-[var(--color-text-secondary)]">
        <div className="flex items-center justify-between">
          <span className="font-inter">
            © {new Date().getFullYear()} Mandareen
          </span>
          <div className="flex items-center gap-4">
            <a href="/auth" className="hover:text-white">
              Login
            </a>
            <a href="/auth?mode=signup" className="hover:text-white">
              Get Started
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
