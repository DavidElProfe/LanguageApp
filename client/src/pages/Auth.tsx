import { useState, useEffect } from 'react';
import { useLocation, useSearch } from 'wouter';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { GraduationCap } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

export default function Auth() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const { signIn, signUp, resetPassword, updatePassword, user, session } = useAuth();
  const { toast } = useToast();
  const { t } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);
  const [isResetLoading, setIsResetLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [isPasswordReset, setIsPasswordReset] = useState(false);
  const [newPasswordData, setNewPasswordData] = useState({ password: '', confirmPassword: '' });

  // Unified auth mode: "signin" or "signup"
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signup');
  const [authData, setAuthData] = useState({ 
    name: '', 
    email: '', 
    password: '', 
    confirmPassword: '' 
  });

  // Check for password recovery on mount and when hash/session changes
  useEffect(() => {
    const checkPasswordRecovery = () => {
      try {
        // Check if this is a password recovery flow
        // Supabase recovery links have #access_token=...&type=recovery in the URL
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const hasRecoveryType = hashParams.get('type') === 'recovery';
        const hasAccessToken = !!hashParams.get('access_token');
        
        // Also check if we previously detected a recovery flow (persisted in localStorage)
        // This was set by the inline script in index.html or by a previous detection
        const wasRecoveryFlow = localStorage.getItem('password_reset_flow') === 'true';
        const detectedAt = localStorage.getItem('password_reset_detected_at');
        
        // If we detect recovery type in hash, save it to localStorage
        // This persists even after Supabase processes the token and clears the hash
        if (hasRecoveryType && hasAccessToken) {
          localStorage.setItem('password_reset_flow', 'true');
          localStorage.setItem('password_reset_detected_at', Date.now().toString());
          setIsPasswordReset(true);
          return;
        } 
        
        // If we have the localStorage flag (set by inline script or previous detection)
        if (wasRecoveryFlow) {
          // Only honor the flag if:
          // 1. We have a session (Supabase has processed the recovery token)
          // OR
          // 2. The detection was recent (within last 30 seconds - prevents stale flags)
          const isRecent = detectedAt && (Date.now() - parseInt(detectedAt)) < 30000;
          
          if (session) {
            setIsPasswordReset(true);
            return;
          } else if (isRecent) {
            setIsPasswordReset(true);
            return;
          } else {
            localStorage.removeItem('password_reset_flow');
            localStorage.removeItem('password_reset_detected_at');
            localStorage.removeItem('password_reset_hash');
          }
        }
      } catch (error) {
        console.error('[Password Reset] Error in detection:', error);
      }
    };
    
    // Run immediately
    checkPasswordRecovery();
    
    // Also listen for hash changes (in case user navigates with recovery link)
    window.addEventListener('hashchange', checkPasswordRecovery);
    
    return () => {
      window.removeEventListener('hashchange', checkPasswordRecovery);
    };
  }, [session]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (authMode === 'signup') {
      // Validate signup
      if (!authData.name.trim()) {
        toast({ title: t('common.error'), description: 'Por favor ingresa tu nombre', variant: 'destructive' });
        return;
      }
      if (authData.password !== authData.confirmPassword) {
        toast({ title: t('common.error'), description: t('auth.passwordsDoNotMatch'), variant: 'destructive' });
        return;
      }
      
      setIsLoading(true);
      try {
        await signUp(authData.email, authData.password, authData.name);
        toast({ title: t('auth.success'), description: t('auth.accountCreatedSuccessfully') });
        
        // Fetch the first video lesson path for new users
        try {
          const response = await fetch('/api/dashboard/next-topic');
          if (response.ok) {
            const data = await response.json();
            if (data.navigationPath) {
              setTimeout(() => setLocation(data.navigationPath), 100);
              return;
            }
          }
        } catch (navError) {
          console.error('Failed to get first lesson path:', navError);
        }
        
        // Fallback to dashboard if navigation path fetch fails
        setTimeout(() => setLocation('/dashboard'), 100);
      } catch (error: any) {
        toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
        setIsLoading(false);
      }
    } else {
      // Sign in
      setIsLoading(true);
      try {
        await signIn(authData.email, authData.password);
        toast({ title: t('auth.welcomeBack'), description: t('auth.signedInSuccessfully') });
        setTimeout(() => setLocation('/dashboard'), 100);
      } catch (error: any) {
        toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
        setIsLoading(false);
      }
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail) {
      toast({ 
        title: t('common.error'), 
        description: t('auth.email'), 
        variant: 'destructive' 
      });
      return;
    }
    setIsResetLoading(true);
    try {
      await resetPassword(resetEmail);
      toast({ 
        title: t('auth.resetEmailSent'), 
        description: t('auth.resetEmailSentDescription'),
      });
      setShowForgotPassword(false);
      setResetEmail('');
    } catch (error: any) {
      console.error('[Password Reset] ✗ Error sending reset email');
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    } finally {
      setIsResetLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPasswordData.password !== newPasswordData.confirmPassword) {
      toast({ title: t('common.error'), description: t('auth.passwordsDoNotMatch'), variant: 'destructive' });
      return;
    }
    if (newPasswordData.password.length < 6) {
      toast({ title: t('common.error'), description: t('auth.passwordMinLength'), variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    try {
      await updatePassword(newPasswordData.password);
      // Clear the password reset flow flags from localStorage
      localStorage.removeItem('password_reset_flow');
      localStorage.removeItem('password_reset_detected_at');
      localStorage.removeItem('password_reset_hash');
      toast({ 
        title: t('auth.passwordUpdated'), 
        description: t('auth.passwordUpdatedDescription'),
      });
      setTimeout(() => setLocation('/dashboard'), 1000);
    } catch (error: any) {
      console.error('[Password Reset] ✗ Error updating password:', error);
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
      setIsLoading(false);
    }
  };

  if (isPasswordReset) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-background p-4">
        <Card className="w-full max-w-md p-8">
          <div className="flex items-center justify-center gap-2 mb-8">
            <GraduationCap className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold">La Escuela de Idiomas</h1>
          </div>

          <div className="space-y-4">
            <div className="text-center mb-6">
              <h2 className="text-xl font-semibold mb-2">{t('auth.updatePasswordTitle')}</h2>
              <p className="text-sm text-muted-foreground">
                {t('auth.updatePasswordDescription')}
              </p>
            </div>

            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div>
                <Label htmlFor="new-password">{t('auth.newPassword')}</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPasswordData.password}
                  onChange={(e) => setNewPasswordData({ ...newPasswordData, password: e.target.value })}
                  required
                  data-testid="input-new-password"
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="confirm-new-password">{t('auth.confirmNewPassword')}</Label>
                <Input
                  id="confirm-new-password"
                  type="password"
                  value={newPasswordData.confirmPassword}
                  onChange={(e) => setNewPasswordData({ ...newPasswordData, confirmPassword: e.target.value })}
                  required
                  data-testid="input-confirm-new-password"
                  className="mt-2"
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-update-password">
                {isLoading ? t('auth.updatingPassword') : t('auth.updatePasswordButton')}
              </Button>
            </form>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-background p-4">
      <Card className="w-full max-w-md p-8">
        <div className="flex items-center justify-center gap-2 mb-8">
          <GraduationCap className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-bold">La Escuela de Idiomas</h1>
        </div>

        <form onSubmit={handleAuth} className="space-y-6">
          {/* Auth Mode Selector */}
          <RadioGroup 
            value={authMode} 
            onValueChange={(value) => setAuthMode(value as 'signin' | 'signup')}
            className="flex gap-4 justify-center"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="signup" id="signup" data-testid="radio-signup" />
              <Label htmlFor="signup" className="cursor-pointer font-normal">
                Crear cuenta
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="signin" id="signin" data-testid="radio-signin" />
              <Label htmlFor="signin" className="cursor-pointer font-normal">
                Ya tengo cuenta
              </Label>
            </div>
          </RadioGroup>

          {/* Name field - only show for signup */}
          {authMode === 'signup' && (
            <div>
              <Label htmlFor="name">Nombre</Label>
              <Input
                id="name"
                type="text"
                value={authData.name}
                onChange={(e) => setAuthData({ ...authData, name: e.target.value })}
                required
                data-testid="input-name"
                className="mt-2"
                placeholder="Tu nombre completo"
              />
            </div>
          )}

          {/* Email field */}
          <div>
            <Label htmlFor="email">{t('auth.email')}</Label>
            <Input
              id="email"
              type="email"
              value={authData.email}
              onChange={(e) => setAuthData({ ...authData, email: e.target.value })}
              required
              data-testid="input-email"
              className="mt-2"
              placeholder="tu@email.com"
            />
          </div>

          {/* Password field */}
          <div>
            <Label htmlFor="password">{t('auth.password')}</Label>
            <Input
              id="password"
              type="password"
              value={authData.password}
              onChange={(e) => setAuthData({ ...authData, password: e.target.value })}
              required
              data-testid="input-password"
              className="mt-2"
              placeholder={authMode === 'signup' ? 'Mínimo 6 caracteres' : ''}
            />
          </div>

          {/* Confirm Password field - only show for signup */}
          {authMode === 'signup' && (
            <div>
              <Label htmlFor="confirm-password">{t('auth.confirmPassword')}</Label>
              <Input
                id="confirm-password"
                type="password"
                value={authData.confirmPassword}
                onChange={(e) => setAuthData({ ...authData, confirmPassword: e.target.value })}
                required
                data-testid="input-confirm-password"
                className="mt-2"
                placeholder="Confirma tu contraseña"
              />
            </div>
          )}

          {/* Forgot password link - only show for signin */}
          {authMode === 'signin' && (
            <div className="flex justify-end">
              <Dialog open={showForgotPassword} onOpenChange={setShowForgotPassword}>
                <DialogTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-sm text-muted-foreground hover:text-primary p-0 h-auto"
                    data-testid="button-forgot-password"
                  >
                    {t('auth.forgotPassword')}
                  </Button>
                </DialogTrigger>
                <DialogContent data-testid="dialog-reset-password">
                  <DialogHeader>
                    <DialogTitle>{t('auth.resetPassword')}</DialogTitle>
                    <DialogDescription>
                      {t('auth.enterEmailToReset')}
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleResetPassword}>
                    <div className="space-y-4 py-4">
                      <div>
                        <Label htmlFor="reset-email">{t('auth.email')}</Label>
                        <Input
                          id="reset-email"
                          type="email"
                          value={resetEmail}
                          onChange={(e) => setResetEmail(e.target.value)}
                          required
                          data-testid="input-reset-email"
                          className="mt-2"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={isResetLoading} data-testid="button-send-reset-email">
                        {isResetLoading ? t('common.loading') : t('auth.resetPasswordButton')}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {/* Submit button */}
          <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-submit">
            {isLoading 
              ? (authMode === 'signup' ? t('auth.creatingAccount') : t('auth.signingIn'))
              : (authMode === 'signup' ? 'Crear cuenta y empezar' : t('auth.signInButton'))
            }
          </Button>
        </form>
      </Card>
    </div>
  );
}
