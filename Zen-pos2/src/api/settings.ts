import { apiRequest, API_BASE, getAccessToken } from './client';

export interface DaySchedule {
  enabled: boolean;
  open: string;   // "HH:MM" 24-hour
  close: string;  // "HH:MM" 24-hour
}

export interface OpeningHours {
  enabled: boolean;
  monday:    DaySchedule;
  tuesday:   DaySchedule;
  wednesday: DaySchedule;
  thursday:  DaySchedule;
  friday:    DaySchedule;
  saturday:  DaySchedule;
  sunday:    DaySchedule;
}

export const DEFAULT_OPENING_HOURS: OpeningHours = {
  enabled: false,
  monday:    { enabled: true,  open: '09:00', close: '22:00' },
  tuesday:   { enabled: true,  open: '09:00', close: '22:00' },
  wednesday: { enabled: true,  open: '09:00', close: '22:00' },
  thursday:  { enabled: true,  open: '09:00', close: '22:00' },
  friday:    { enabled: true,  open: '09:00', close: '23:00' },
  saturday:  { enabled: true,  open: '10:00', close: '23:00' },
  sunday:    { enabled: false, open: '10:00', close: '21:00' },
};

/** Returns true if the restaurant is currently open based on the schedule.
 *  Also returns the next opening slot as a human-readable string and a Date object. */
export function checkOpeningHours(hours: OpeningHours): { isOpen: boolean; nextOpen?: string; nextOpenDate?: Date } {
  if (!hours.enabled) return { isOpen: true };

  const now = new Date();
  const dayKeys = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'] as const;
  const dayLabels = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const todayIdx = now.getDay();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const currentTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const today = hours[dayKeys[todayIdx]];
  
  // 1. Check if currently open
  if (today.enabled && currentTime >= today.open && currentTime < today.close) {
    return { isOpen: true };
  }

  // 2. Check if opens later TODAY
  if (today.enabled && currentTime < today.open) {
    const [h, m] = today.open.split(':').map(Number);
    const openingDate = new Date(now);
    openingDate.setHours(h, m, 0, 0);
    return { 
      isOpen: false, 
      nextOpen: `Today at ${today.open}`,
      nextOpenDate: openingDate 
    };
  }

  // 3. Find next open slot in the coming days
  for (let i = 1; i <= 7; i++) {
    const idx = (todayIdx + i) % 7;
    const day = hours[dayKeys[idx]];
    if (day.enabled) {
      const label = i === 1 ? 'Tomorrow' : dayLabels[idx];
      const [h, m] = day.open.split(':').map(Number);
      const openingDate = new Date(now);
      openingDate.setDate(now.getDate() + i);
      openingDate.setHours(h, m, 0, 0);
      
      return { 
        isOpen: false, 
        nextOpen: `${label} at ${day.open}`,
        nextOpenDate: openingDate
      };
    }
  }
  return { isOpen: false };
}

export interface BrandingData {
  restaurantName: string;
  metaTitle: string;
  logo: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  compactLayout: boolean;
  showItemizedTax: boolean;
  printQrCode: boolean;
  footerText: string;
  phone: string;
  email: string;
  address: string;
  dailySpecial: string;
  publicMenuCardLayout: 'vertical' | 'horizontal';
  trackingImage: string;
  openingHours: OpeningHours;
}

export interface LocalizationData {
  language: string;
  currency: string;
  currencyPosition: string;
  country: string;
  taxEnabled: boolean;
  taxRate: number;
  timezone: string;
  decimalSeparator: string;
  currencyDecimals: number;
  gratuityEnabled: boolean;
  gratuityRate: number;
}

export interface IntegrationData {
  telegramEnabled: boolean;
  telegramBotToken: string;
  telegramChatId: string;
  telegramReports: Record<string, boolean>;
  emailEnabled: boolean;
  emailRecipients: string;
  emailService: string;
  emailHost: string;
  emailPort: string;
  emailUser: string;
  emailPassword: string;
  emailReports: Record<string, boolean>;
  firebaseEnabled: boolean;
  firebaseApiKey: string;
  firebaseAuthDomain: string;
  firebaseProjectId: string;
  firebaseStorageBucket: string;
  firebaseMessagingSenderId: string;
  firebaseAppId: string;
  firebaseMeasurementId: string;
  bunnyEnabled: boolean;
  bunnyApiKey: string;
  bunnyStorageZone: string;
  bunnyStorageRegion: string;
  bunnyCdnHostname: string;
  bunnyPullZoneId: string;
  metaPixelEnabled: boolean;
  metaPixelId: string;
  metaCapiEnabled: boolean;
  metaCapiToken: string;
  metaCapiTestEventCode: string;
}

export const DEFAULT_BRANDING: BrandingData = {
  restaurantName: 'ZenPOS',
  metaTitle: 'ZenPOS',
  logo: '',
  primaryColor: '#C0C7D4',
  secondaryColor: '#FFB4A5',
  accentColor: '#9DD761',
  compactLayout: true,
  showItemizedTax: true,
  printQrCode: false,
  footerText: 'Thank you for dining with us',
  phone: '',
  email: '',
  address: '',
  dailySpecial: '',
  publicMenuCardLayout: 'vertical',
  trackingImage: '',
  openingHours: DEFAULT_OPENING_HOURS,
};

function mapBranding(raw: any): BrandingData {
  return {
    restaurantName: raw.restaurant_name ?? DEFAULT_BRANDING.restaurantName,
    metaTitle:      raw.meta_title      ?? '',
    logo:           raw.logo            ?? '',
    primaryColor:   raw.primary_color   ?? DEFAULT_BRANDING.primaryColor,
    secondaryColor: raw.secondary_color ?? DEFAULT_BRANDING.secondaryColor,
    accentColor:    raw.accent_color    ?? DEFAULT_BRANDING.accentColor,
    compactLayout:  raw.compact_layout  ?? DEFAULT_BRANDING.compactLayout,
    showItemizedTax: raw.show_itemized_tax ?? DEFAULT_BRANDING.showItemizedTax,
    printQrCode:    raw.print_qr_code   ?? DEFAULT_BRANDING.printQrCode,
    footerText:     raw.footer_text     ?? DEFAULT_BRANDING.footerText,
    phone:          raw.phone           ?? DEFAULT_BRANDING.phone,
    email:          raw.email           ?? DEFAULT_BRANDING.email,
    address:        raw.address         ?? DEFAULT_BRANDING.address,
    dailySpecial:          raw.daily_special            ?? '',
    publicMenuCardLayout:  raw.public_menu_card_layout  ?? 'vertical',
    trackingImage:         raw.tracking_image           ?? '',
    openingHours:          raw.opening_hours            ?? DEFAULT_OPENING_HOURS,
  };
}

function mapLocalization(raw: any): LocalizationData {
  return {
    language:         raw.language          ?? 'English',
    currency:         raw.currency          ?? 'DZD',
    currencyPosition: raw.currency_position ?? 'right',
    country:          raw.country           ?? 'Algeria',
    taxEnabled:       raw.tax_enabled       ?? true,
    taxRate:          raw.tax_rate          ?? 8,
    timezone:         raw.timezone          ?? 'Africa/Algiers',
    decimalSeparator: raw.decimal_separator ?? 'dot',
    currencyDecimals: raw.currency_decimals ?? 2,
    gratuityEnabled:  raw.gratuity_enabled  ?? false,
    gratuityRate:     raw.gratuity_rate     ?? 0,
  };
}

function mapIntegration(raw: any): IntegrationData {
  return {
    telegramEnabled:   raw.telegram_enabled    ?? false,
    telegramBotToken:  raw.telegram_bot_token  ?? '',
    telegramChatId:    raw.telegram_chat_id    ?? '',
    telegramReports:   raw.telegram_reports    ?? {},
    emailEnabled:      raw.email_enabled       ?? false,
    emailRecipients:   raw.email_recipients    ?? '',
    emailService:      raw.email_service       ?? 'smtp',
    emailHost:         raw.email_host          ?? '',
    emailPort:         raw.email_port          ?? '587',
    emailUser:         raw.email_user          ?? '',
    emailPassword:     raw.email_password      ?? '',
    emailReports:      raw.email_reports       ?? {},
    firebaseEnabled:   raw.firebase_enabled    ?? false,
    firebaseApiKey:    raw.firebase_api_key    ?? '',
    firebaseAuthDomain: raw.firebase_auth_domain ?? '',
    firebaseProjectId:  raw.firebase_project_id ?? '',
    firebaseStorageBucket: raw.firebase_storage_bucket ?? '',
    firebaseMessagingSenderId: raw.firebase_messaging_sender_id ?? '',
    firebaseAppId:      raw.firebase_app_id     ?? '',
    firebaseMeasurementId: raw.firebase_measurement_id ?? '',
    bunnyEnabled:       raw.bunny_enabled       ?? false,
    bunnyApiKey:        raw.bunny_api_key       ?? '',
    bunnyStorageZone:   raw.bunny_storage_zone  ?? '',
    bunnyStorageRegion: raw.bunny_storage_region ?? '',
    bunnyCdnHostname:   raw.bunny_cdn_hostname  ?? '',
    bunnyPullZoneId:    raw.bunny_pull_zone_id  ?? '',
    metaPixelEnabled:      raw.meta_pixel_enabled       ?? false,
    metaPixelId:           raw.meta_pixel_id            ?? '',
    metaCapiEnabled:       raw.meta_capi_enabled        ?? false,
    metaCapiToken:         raw.meta_capi_token          ?? '',
    metaCapiTestEventCode: raw.meta_capi_test_event_code ?? '',
  };
}

export async function getBranding(): Promise<BrandingData> {
  const raw = await apiRequest<any>('/settings/branding');
  const mapped = mapBranding(raw);
  try { localStorage.setItem('zenpos_branding', JSON.stringify(mapped)); } catch {}
  return mapped;
}

export async function updateBranding(data: Partial<BrandingData>): Promise<BrandingData> {
  const keyMap: [keyof BrandingData, string][] = [
    ['restaurantName', 'restaurant_name'],
    ['metaTitle',      'meta_title'],
    ['logo',           'logo'],
    ['primaryColor',   'primary_color'],
    ['secondaryColor', 'secondary_color'],
    ['accentColor',    'accent_color'],
    ['compactLayout',  'compact_layout'],
    ['showItemizedTax','show_itemized_tax'],
    ['printQrCode',    'print_qr_code'],
    ['footerText',     'footer_text'],
    ['phone',          'phone'],
    ['email',          'email'],
    ['address',        'address'],
    ['dailySpecial',          'daily_special'],
    ['publicMenuCardLayout',  'public_menu_card_layout'],
    ['trackingImage',         'tracking_image'],
    ['openingHours',          'opening_hours'],
  ];
  const payload: Record<string, any> = {};
  for (const [camel, snake] of keyMap) {
    if (data[camel] !== undefined) payload[snake] = data[camel];
  }
  const raw = await apiRequest<any>('/settings/branding', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  const mapped = mapBranding(raw);
  try { localStorage.setItem('zenpos_branding', JSON.stringify(mapped)); } catch {}
  return mapped;
}

export async function getLocalization(): Promise<LocalizationData> {
  const raw = await apiRequest<any>('/settings/localization');
  return mapLocalization(raw);
}

export async function updateLocalization(data: LocalizationData): Promise<LocalizationData> {
  const raw = await apiRequest<any>('/settings/localization', {
    method: 'PUT',
    body: JSON.stringify({
      language:          data.language,
      currency:          data.currency,
      currency_position: data.currencyPosition,
      country:           data.country,
      tax_enabled:       data.taxEnabled,
      tax_rate:          data.taxRate,
      timezone:          data.timezone,
      decimal_separator: data.decimalSeparator,
      currency_decimals: data.currencyDecimals,
      gratuity_enabled:  data.gratuityEnabled,
      gratuity_rate:     data.gratuityRate,
    }),
  });
  return mapLocalization(raw);
}

export async function getIntegration(): Promise<IntegrationData> {
  const raw = await apiRequest<any>('/settings/integration');
  return mapIntegration(raw);
}

export async function testBunnyConnection(): Promise<{ ok: boolean; message: string }> {
  return apiRequest<{ ok: boolean; message: string }>('/settings/integration/test-bunny', { method: 'POST' });
}

export async function updateIntegration(data: IntegrationData): Promise<IntegrationData> {
  const raw = await apiRequest<any>('/settings/integration', {
    method: 'PUT',
    body: JSON.stringify({
      telegram_enabled:   data.telegramEnabled,
      telegram_bot_token: data.telegramBotToken,
      telegram_chat_id:   data.telegramChatId,
      telegram_reports:   data.telegramReports,
      email_enabled:      data.emailEnabled,
      email_recipients:   data.emailRecipients,
      email_service:      data.emailService,
      email_host:         data.emailHost,
      email_port:         data.emailPort,
      email_user:         data.emailUser,
      email_password:     data.emailPassword,
      email_reports:      data.emailReports,
      firebase_enabled:   data.firebaseEnabled,
      firebase_api_key:    data.firebaseApiKey,
      firebase_auth_domain: data.firebaseAuthDomain,
      firebase_project_id:  data.firebaseProjectId,
      firebase_storage_bucket: data.firebaseStorageBucket,
      firebase_messaging_sender_id: data.firebaseMessagingSenderId,
      firebase_app_id:      data.firebaseAppId,
      firebase_measurement_id: data.firebaseMeasurementId,
      bunny_enabled:        data.bunnyEnabled,
      bunny_api_key:        data.bunnyApiKey,
      bunny_storage_zone:   data.bunnyStorageZone,
      bunny_storage_region: data.bunnyStorageRegion,
      bunny_cdn_hostname:   data.bunnyCdnHostname,
      bunny_pull_zone_id:   data.bunnyPullZoneId,
      meta_pixel_enabled:        data.metaPixelEnabled,
      meta_pixel_id:             data.metaPixelId,
      meta_capi_enabled:         data.metaCapiEnabled,
      meta_capi_token:           data.metaCapiToken,
      meta_capi_test_event_code: data.metaCapiTestEventCode,
    }),
  });
  return mapIntegration(raw);
}

export async function uploadFile(file: File): Promise<{ url: string }> {
  const formData = new FormData();
  formData.append('file', file);
  return apiRequest<{ url: string }>('/settings/upload', {
    method: 'POST',
    body: formData,
  });
}
