    // Manifest'i tek ayar dosyasindan (app-config.js) dinamik uret.
    (function() {
      try {
        var cfg = window.PWA_CONFIG || { SHORT_NAME: 'ARSH', VERSION: '1', NAME: 'Varlık ve Süreç Yönetim Haritası' };
        var icons = [
          { src: './icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: './icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: './icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: './icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ];
        var manifest = {
          name: cfg.NAME,
          short_name: cfg.SHORT_NAME,
          description: cfg.NAME + ' - Interaktif hiyerarsik agac editörü',
          lang: 'tr-TR',
          id: './',
          start_url: './',
          scope: './',
          display: 'standalone',
          background_color: (cfg.THEME && cfg.THEME.splashBackground) || '#C4047E',
          theme_color: (cfg.THEME && cfg.THEME.themeColor) || '#C4047E',
          orientation: 'portrait',
          icons: icons
        };
        var link = document.getElementById('dynamic-manifest');
        if (link) {
          link.href = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }));
        }
        // Arka plan / tema renklerini tek ayar noktasi (app-config.js THEME) uzerinden CSS degiskenlerine uygula.
        (function applyThemeFromConfig() {
          var t = (window.PWA_CONFIG && window.PWA_CONFIG.THEME) || {};
          var rs = document.documentElement.style;
          var __cfg = window.PWA_CONFIG || {};
          if (__cfg.BASE_FONT) rs.setProperty('--base-font', __cfg.BASE_FONT);
          if (__cfg.BRAND_FONT) rs.setProperty('--brand-font', __cfg.BRAND_FONT);
          if (t.loginBackgroundLight) rs.setProperty('--bg-login-light', t.loginBackgroundLight);
          if (t.loginBackgroundDark)  rs.setProperty('--bg-login-dark',  t.loginBackgroundDark);
          if (t.canvasBackground)     rs.setProperty('--bg-canvas',      t.canvasBackground);
          if (t.canvasDotColor)       rs.setProperty('--bg-canvas-dot',  t.canvasDotColor);
        })();
        document.title = cfg.NAME + ' - İnteraktif Hiyerarşik Ağaç Editörü';
      } catch (e) {}
    })();