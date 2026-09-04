// ============================================================
//  TEK AYAR NOKTASI — Bu dosyayı düzenleyin, her şey değişsin.
//
//  Uygulamanın adı, sürümü ve görünüm/limit ayarları burada tanımlıdır.
//  - SHORT_NAME : İkon altında görünen kısa ad (PWA kısayolu)
//  - VERSION    : Uygulama sürümü (cache/yayın güncellemesi için)
//  - NAME       : Uygulamanın tam/menü adı
//  - CARD       : Düğüm kartı görünümü (satır/alân sayısı vb.)
//  - RECENT_ACTIVITIES_LIMIT : Son işlemler maksimum kayıt sayısı
//  - NOTIFICATIONS : Tarih bildirimi penceresi (kaç gün) ve maksimum sonuç
//  - ICONS      : Düğüm ikonları (emoji veya görsel URL)
//
//  Bunları değiştirip deployment yaptığınızda:
//  • Kısayol adı, tarayıcı başlığı ve manifest otomatik güncellenir.
//  • VERSION artırıldığında service worker cache adı değişir; böylece
//    tarayıcı en güncel dosyaları indirir, giriş ekranında yeni sürüm numarası görünür.
// ============================================================
// `self`, hem tarayıcı penceresinde (window) hem de Service Worker'da
// global nesneyi temsil eder; böylece tek dosya her iki ortamda da çalışır.
self.PWA_CONFIG = {
  SHORT_NAME: 'ARSH',
  VERSION: '9',
  NAME: 'Varlık ve Süreç Yönetim Haritası',

  // ================================================================
  //  FONT (TYPE) SETTINGS
  //  - BASE_FONT  : Font family used by the whole UI EXCEPT the ARSH title.
  //                 The @font-face embedded font in index.html uses this family
  //                 name. Default: Glegoo.
  //  - BRAND_FONT : Font family used by the "A R S H" title (default Norwester).
  //                 To switch base font later: change BASE_FONT AND the family
  //                 name of the <style> @font-face block in index.html.
  // ================================================================
  BASE_FONT: 'Righteous',
  BRAND_FONT: 'Norwester',

  // ================================================================
  //  UYGULAMA GÖRÜNÜM & LİMİT AYARLARI  (isterseniz bu değerleri düzenleyin)
  // ================================================================

  // Düğüm kartının görünümü
  CARD: {
    maxVisibleFields: 6, // Bir kartta aynı anda görünen alan (satır) sayısı
    fieldHintAt: 3,      // Kartta "+N alan daha..." uyarısı, görünen alan sayısı bu değeri aşınca çıkar
    fieldRowHeight: 22   // Karttaki her alan satırının yüksekliği (px)
  },

  // Son İşlemler (activity log) listesinde tutulacak / gösterilecek en fazla kayıt sayısı
  RECENT_ACTIVITIES_LIMIT: 50,

  // Tarih Bildirimleri
  NOTIFICATIONS: {
    windowDays: 30, // Yalnız bu kadar gün içinde (veya geçmiş) tarihler bildirim olarak gösterilir
    maxResults: 100 // Bildirim listesinde en fazla gösterilecek kayıt sayısı
  },

  // Düğüm ikonları (emoji). Gelecekte harici bir görsel (URL) kullanmak
  // isterseniz emoji değerinin yerine doğrudan bir görsel linki yazabilirsiniz.
  ICONS: {
    folder: '📁',
    box: '📦',
    car: '🚗',
    tractor: '🚜',
    shield: '🛡️',
    calendar: '📅',
    wrench: '🔧',
    building: '🏢',
    dollar: '💵',
    'dollar-sign': '💵',
    tag: '🏷️',
    file: '📄',
    user: '👤',
    users: '👥',
    database: '🗄️',
    layers: '🥞',
    activity: '📈',
    check: '✅',
    sparkles: '✨'
  },

  // =================================================================
  //  RENK / GORUNUM (THEME) - Arka plan ve tema renkleri.
  //  Degerleri buradan degistirerek tum uygulamaya yansitin.
  // =================================================================
  THEME: {
    // PWA splash / status bar rengi (manifest background_color & theme_color)
    splashBackground: '#000000',
    themeColor: '#000000',

    // Giris ekrani arka plani (degradeler)
    loginBackgroundLight: 'linear-gradient(180deg, #fb4aa8 0%, #ED0073 22%, #C4047E 45%, #8d0894 65%, #6C0CA3 85%, #4c1d95 100%)',
    loginBackgroundDark:  'linear-gradient(180deg, #9d174d 0%, #831843 30%, #6b21a8 60%, #4c1d95 85%, #2e1065 100%)',

    // Ana tuval (canvas) arka plani ve nokta (dot) rengi
    canvasBackground: '#0f172a',
    canvasDotColor: '#334155'
  }
};

// Service Worker'ın cache adında kullanacağı hazır değer.
self.PWA_CACHE_VERSION = 'agac-pwa-v' + self.PWA_CONFIG.VERSION;