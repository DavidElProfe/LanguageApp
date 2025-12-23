import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { BookOpen, LayoutDashboard, Sparkles, Users, Briefcase } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import FeatureCard from '@/components/FeatureCard';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function Home() {
  const [, setLocation] = useLocation();
  const { t } = useLanguage();

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1">
        <section className="relative bg-gradient-to-br from-primary/10 via-background to-background py-20 md:py-32">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="text-center max-w-4xl mx-auto">
              <h1 className="text-4xl md:text-6xl font-bold mb-6" data-testid="text-hero-title">
                {t('hero.title')}
              </h1>
              <p className="text-xl md:text-2xl text-muted-foreground mb-8" data-testid="text-hero-subtitle">
                {t('hero.subtitle')}
              </p>
              <Button
                size="lg"
                className="text-lg px-8 py-6"
                onClick={() => setLocation('/')}
                data-testid="button-start-practicing"
              >
                {t('hero.cta')}
              </Button>
            </div>
          </div>
        </section>

        <section className="py-16 md:py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <FeatureCard
                icon={BookOpen}
                title={t('nav.practice')}
                description={t('pricing.features.practice')}
                href="/courses"
              />
              <FeatureCard
                icon={LayoutDashboard}
                title={t('nav.dashboard')}
                description="Sigue tu progreso y mantén tu racha diaria"
                href="/dashboard"
              />
              <FeatureCard
                icon={Sparkles}
                title="Chat IA"
                description="Practica conversaciones con nuestro compañero IA"
                href="/"
              />
            </div>
          </div>
        </section>

        <section className="py-16 md:py-24 bg-muted/30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
              {t('comingSoon.title')}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <FeatureCard
                icon={Users}
                title="Eventos"
                description={t('comingSoon.events')}
                badge={t('pricing.comingSoon')}
              />
              <FeatureCard
                icon={Briefcase}
                title="Trabajo"
                description={t('comingSoon.work')}
                badge={t('pricing.comingSoon')}
              />
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
