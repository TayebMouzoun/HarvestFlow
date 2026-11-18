import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { fr } from './locales/fr';
import { es } from './locales/es';

void i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    es: { translation: es },
  },
  lng: 'fr',
  fallbackLng: 'fr',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
