import { apiRequest } from './client';

export interface BrandingData {
  restaurantName: string;
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
}

export interface LocalizationData {
  language: string;
  currency: string;
  currencyPosition: string;
  country: string;
  taxEnabled: boolean;
  taxRate: number;
  timezone: string;
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
}

export const DEFAULT_BRANDING: BrandingData = {
  restaurantName: 'Omakase POS',
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
};

function mapBranding(raw: any): BrandingData {
  return {
    restaurantName: raw.restaurant_name ?? DEFAULT_BRANDING.restaurantName,
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
    dailySpecial:   raw.daily_special   ?? '',
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
    ['dailySpecial',   'daily_special'],
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
    }),
  });
  return mapIntegration(raw);
}
