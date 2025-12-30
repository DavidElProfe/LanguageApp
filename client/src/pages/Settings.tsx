import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/contexts/LanguageContext';
import { useToast } from '@/hooks/use-toast';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function Settings() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [displayName, setDisplayName] = useState('John Doe'); //todo: remove mock functionality

  const handleSave = () => {
    //todo: remove mock functionality
    toast({
      title: 'Ajustes guardados',
      description: 'Tus preferencias han sido actualizadas',
    });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 py-12">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <h1 className="text-3xl md:text-4xl font-bold mb-8" data-testid="text-settings-title">
            {t('settings.title')}
          </h1>

          <Card className="p-6">
            <div className="space-y-6">
              <div>
                <Label htmlFor="displayName">{t('settings.profile')}</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="mt-2"
                  data-testid="input-display-name"
                />
              </div>

              <Button onClick={handleSave} className="w-full" data-testid="button-save-settings">
                {t('settings.save')}
              </Button>
            </div>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
}
