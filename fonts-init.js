  // fontlar ./fonts/ klasorunden yuklenir (app-config FONTS)
  (function () {
    try {
      var __fcfg = (self.PWA_CONFIG && self.PWA_CONFIG.FONTS) || {};
      var __rs = document.documentElement.style;
      var __base = __fcfg.BASE || {};
      var __brand = __fcfg.BRAND || {};
      if (__base && __base.name && __base.file) {
        var f1 = new FontFace(__base.name, 'url(./fonts/' + __base.file + ')', { weight: 'normal', style: 'normal', display: 'swap' });
        document.fonts.add(f1); f1.load().catch(function(){});
        __rs.setProperty('--base-font', __base.name);
      }
      if (__brand && __brand.name && __brand.file) {
        var f2 = new FontFace(__brand.name, 'url(./fonts/' + __brand.file + ')', { weight: 'normal', style: 'normal', display: 'swap' });
        document.fonts.add(f2); f2.load().catch(function(){});
        __rs.setProperty('--brand-font', __brand.name);
      }
    } catch (e) {}
  })();