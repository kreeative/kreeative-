import type { Metadata } from 'next';
import { AuthFlow } from './AuthFlow';

export const metadata: Metadata = {
  title: 'Mon compte',
  description: 'Créez votre compte Jehre ou connectez-vous avec un code reçu par e-mail. Pas de mot de passe.',
  robots: { index: false, follow: true },
};

export default function ComptePage() {
  return <AuthFlow />;
}
