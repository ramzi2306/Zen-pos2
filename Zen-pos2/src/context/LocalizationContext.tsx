import React, { createContext, useContext, useState, useEffect } from 'react';
import type { LocalizationData } from '../api/settings';
import * as api from '../api';

const DEFAULT_LOCALIZATION: LocalizationData = {
  language: 'English',
  currency: 'DZD',
  currencyPosition: 'right',
  country: 'Algeria',
  taxEnabled: true,
  taxRate: 8,
  timezone: 'Africa/Algiers',
};

// Symbol overrides for currencies that have recognizable glyphs.
// All others fall back to their ISO code.
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CNY: '¥',
};

interface LocalizationContextValue {
  localization: LocalizationData;
  setLocalization: (data: LocalizationData) => void;
  formatCurrency: (amount: number) => string;
}

const LocalizationContext = createContext<LocalizationContextValue>({
  localization: DEFAULT_LOCALIZATION,
  setLocalization: () => {},
  formatCurrency: (amount) => amount.toFixed(2),
});

export function LocalizationProvider({ children }: { children: React.ReactNode }) {
  const [localization, _setLocalization] = useState<LocalizationData>(() => {
    try {
      const stored = localStorage.getItem('zenpos_localization');
      if (stored) return { ...DEFAULT_LOCALIZATION, ...JSON.parse(stored) };
    } catch {}
    return DEFAULT_LOCALIZATION;
  });

  // Fetch fresh settings from API on mount (no auth required — public endpoint)
  useEffect(() => {
    api.settings.getLocalization().then(data => {
      _setLocalization(data);
      localStorage.setItem('zenpos_localization', JSON.stringify(data));
    }).catch(() => {});
  }, []);

  const setLocalization = (data: LocalizationData) => {
    _setLocalization(data);
    localStorage.setItem('zenpos_localization', JSON.stringify(data));
  };

  const formatCurrency = (amount: number): string => {
    const symbol = CURRENCY_SYMBOLS[localization.currency] ?? localization.currency;
    const decimals = localization.currency === 'JPY' || localization.currency === 'CNY' ? 0 : 2;
    const formatted = amount.toFixed(decimals);
    return localization.currencyPosition === 'left'
      ? `${symbol}${formatted}`
      : `${formatted} ${symbol}`;
  };

  return (
    <LocalizationContext.Provider value={{ localization, setLocalization, formatCurrency }}>
      {children}
    </LocalizationContext.Provider>
  );
}

export function useLocalization() {
  return useContext(LocalizationContext);
}
