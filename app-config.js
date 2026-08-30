// ============================================================
//  TEK AYAR NOKTASI — Bu dosyayı düzenleyin, her şey değişsin.
//
//  Uygulamanın adı ve sürümü burada tanımlıdır.
//  - SHORT_NAME : İkon altında görünen kısa ad (PWA kısayolu)
//  - VERSION    : Uygulama sürümü (cache/yayın güncellemesi için)
//  - NAME       : Uygulamanın tam/menü adı
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
  VERSION: '3',
  NAME: 'Varlık ve Süreç Yönetim Haritası'
};

// Service Worker'ın cache adında kullanacağı hazır değer.
self.PWA_CACHE_VERSION = 'agac-pwa-v' + self.PWA_CONFIG.VERSION;
