(function () {
  var DISMISS_KEY = 'cs_pwa_dismissed';

  // HTTPS guard — exit silently if not on HTTPS
  if (location.protocol !== 'https:') {
    console.warn('PWA: HTTPS required, skipping service worker and install banners');
    return;
  }

  // Register service worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .catch(function (err) { console.warn('SW registration failed:', err); });
    });
  }

  // iOS install banner
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  var isStandalone = window.navigator.standalone === true;
  if (isIOS && !isStandalone && !sessionStorage.getItem(DISMISS_KEY)) {
    window.addEventListener('DOMContentLoaded', function () {
      var b = document.createElement('div');
      b.style.cssText = 'position:fixed;bottom:80px;left:12px;right:12px;background:#fff;border-radius:14px;padding:14px;box-shadow:0 4px 24px rgba(0,0,0,0.18);z-index:9999;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
      b.innerHTML = '<div style="display:flex;align-items:flex-start;gap:12px">'
        + '<img src="/static/branding/campus-sanchalika-logo.png" style="width:44px;height:44px;border-radius:12px;flex-shrink:0" alt="">'
        + '<div style="flex:1"><div style="font-weight:800;font-size:13px;margin-bottom:3px">Install this app</div>'
        + '<div style="font-size:12px;color:#4b5563;line-height:1.4">Tap <b>Share</b> &#x2197; then <b>Add to Home Screen</b></div></div>'
        + '<button id="cs-close" style="background:none;border:none;font-size:22px;cursor:pointer;color:#9ca3af;padding:0;flex-shrink:0">&times;</button></div>'
        + '<div style="position:absolute;bottom:-8px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-top:8px solid #fff"></div>';
      document.body.appendChild(b);
      document.getElementById('cs-close').onclick = function () { b.remove(); sessionStorage.setItem(DISMISS_KEY, '1'); };
    });
  }

  // Android / Chrome install banner
  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if (sessionStorage.getItem(DISMISS_KEY)) return;
    window.addEventListener('DOMContentLoaded', function () {
      var b = document.createElement('div');
      b.style.cssText = 'position:fixed;bottom:80px;left:12px;right:12px;background:#fff;border-radius:14px;padding:14px;box-shadow:0 4px 24px rgba(0,0,0,0.18);z-index:9999;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
      b.innerHTML = '<div style="display:flex;align-items:center;gap:12px">'
        + '<img src="/static/branding/campus-sanchalika-logo.png" style="width:44px;height:44px;border-radius:12px;flex-shrink:0" alt="">'
        + '<div><div style="font-weight:800;font-size:13px;margin-bottom:2px">Install Campus Sanchalika</div>'
        + '<div style="font-size:12px;color:#4b5563">Add to your home screen for quick access</div></div></div>'
        + '<div style="display:flex;gap:8px;margin-top:12px">'
        + '<button id="cs-install" style="flex:1;background:#29543a;color:#fff;border:none;border-radius:10px;padding:11px;font-size:13px;font-weight:700;cursor:pointer">Install</button>'
        + '<button id="cs-dismiss" style="background:#f3f4f6;color:#374151;border:none;border-radius:10px;padding:11px;font-size:13px;font-weight:700;cursor:pointer">Not now</button></div>';
      document.body.appendChild(b);
      document.getElementById('cs-install').onclick = function () { b.remove(); deferred.prompt(); };
      document.getElementById('cs-dismiss').onclick = function () { b.remove(); sessionStorage.setItem(DISMISS_KEY, '1'); };
    });
  });
})();
