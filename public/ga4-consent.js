(function () {
  'use strict';

  var MEASUREMENT_ID = 'G-J0YYCB85PM';
  var STORAGE_KEY = 'mingeagle_analytics_consent_v1';
  var memoryChoice = null;
  var STRINGS = {
    en: {
      title: 'Privacy choices',
      body: 'Allow optional Google Analytics to measure page visits and general referral trends? We do not send inquiry form contents, contact details, order details or payment data. Page URLs are measured without query strings or fragments.',
      accept: 'Accept analytics',
      reject: 'Reject optional analytics',
      policy: 'Privacy policy',
      settings: 'Privacy settings',
      close: 'Close'
    },
    zh: {
      title: '隐私设置',
      body: '是否允许启用可选的 Google Analytics 来统计页面访问和一般引荐来源？我们不会向其发送询盘表单内容、联系方式、订单详情或支付数据。统计页面网址时会去掉查询参数和片段。',
      accept: '允许分析',
      reject: '拒绝可选分析',
      policy: '隐私政策',
      settings: '隐私设置',
      close: '关闭'
    },
    es: {
      title: 'Opciones de privacidad',
      body: '¿Permite Google Analytics opcional para medir visitas y referencias generales? No enviamos formularios de consulta, datos de contacto, pedidos ni pagos. Las URL se miden sin parámetros de consulta ni fragmentos.',
      accept: 'Aceptar analítica',
      reject: 'Rechazar analítica opcional',
      policy: 'Política de privacidad',
      settings: 'Privacidad',
      close: 'Cerrar'
    },
    pt: {
      title: 'Preferências de privacidade',
      body: 'Permite o Google Analytics opcional para medir visitas e referências gerais? Não enviamos formulários de consulta, contactos, encomendas nem dados de pagamento. Os URLs são medidos sem parâmetros de consulta nem fragmentos.',
      accept: 'Aceitar análise',
      reject: 'Recusar análise opcional',
      policy: 'Política de privacidade',
      settings: 'Privacidade',
      close: 'Fechar'
    },
    fr: {
      title: 'Choix de confidentialité',
      body: 'Autorisez-vous Google Analytics, en option, à mesurer les visites et les sources de référence générales ? Nous ne transmettons aucun formulaire de demande, coordonnées, détail de commande ou paiement. Les URL sont mesurées sans paramètres de requête ni fragments.',
      accept: 'Accepter les statistiques',
      reject: 'Refuser les statistiques facultatives',
      policy: 'Politique de confidentialité',
      settings: 'Confidentialité',
      close: 'Fermer'
    },
    de: {
      title: 'Datenschutzeinstellungen',
      body: 'Darf optionales Google Analytics Seitenaufrufe und allgemeine Verweisquellen messen? Wir senden keine Anfrageformulare, Kontaktdaten, Bestelldetails oder Zahlungsdaten. URLs werden ohne Abfrageparameter und Fragmente erfasst.',
      accept: 'Analyse erlauben',
      reject: 'Optionale Analyse ablehnen',
      policy: 'Datenschutzerklärung',
      settings: 'Datenschutz',
      close: 'Schließen'
    },
    it: {
      title: 'Scelte sulla privacy',
      body: 'Consenti a Google Analytics facoltativo di misurare visite e fonti di provenienza generali? Non inviamo moduli di richiesta, dati di contatto, dettagli degli ordini o pagamenti. Gli URL vengono misurati senza parametri di query o frammenti.',
      accept: 'Accetta analisi',
      reject: 'Rifiuta analisi facoltative',
      policy: 'Informativa sulla privacy',
      settings: 'Privacy',
      close: 'Chiudi'
    },
    nl: {
      title: 'Privacykeuzes',
      body: 'Sta je optionele Google Analytics toe om paginaweergaven en algemene verwijzingen te meten? We sturen geen aanvraagformulieren, contactgegevens, bestelgegevens of betalingsgegevens. URL’s worden gemeten zonder queryparameters of fragmenten.',
      accept: 'Analytics toestaan',
      reject: 'Optionele analytics weigeren',
      policy: 'Privacybeleid',
      settings: 'Privacyinstellingen',
      close: 'Sluiten'
    },
    pl: {
      title: 'Ustawienia prywatności',
      body: 'Czy zezwalasz na opcjonalne Google Analytics do pomiaru odsłon i ogólnych źródeł wejść? Nie wysyłamy formularzy zapytań, danych kontaktowych, szczegółów zamówień ani płatności. Adresy URL są mierzone bez parametrów zapytania i fragmentów.',
      accept: 'Zezwól na analitykę',
      reject: 'Odrzuć opcjonalną analitykę',
      policy: 'Polityka prywatności',
      settings: 'Ustawienia prywatności',
      close: 'Zamknij'
    },
    ja: {
      title: 'プライバシー設定',
      body: '任意の Google Analytics によるページ訪問数と一般的な参照元の測定を許可しますか？問い合わせフォーム、連絡先、注文、決済データは送信しません。URL のクエリ文字列とフラグメントは除外して測定します。',
      accept: '分析を許可',
      reject: '任意の分析を拒否',
      policy: 'プライバシーポリシー',
      settings: 'プライバシー設定',
      close: '閉じる'
    }
  };

  function locale() {
    var lang = (document.documentElement.lang || 'en').toLowerCase().split('-')[0];
    return STRINGS[lang] ? lang : 'en';
  }

  function safePageUrl(rawUrl) {
    if (!rawUrl) return '';
    try {
      var url = new URL(rawUrl, window.location.href);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
      return url.origin + url.pathname;
    } catch (error) {
      return '';
    }
  }

  function readChoice() {
    if (memoryChoice) return memoryChoice;
    try {
      var stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === 'accepted' || stored === 'rejected') return stored;
    } catch (error) {}
    try {
      var sessionStored = window.sessionStorage.getItem(STORAGE_KEY);
      if (sessionStored === 'accepted' || sessionStored === 'rejected') return sessionStored;
    } catch (error) {}
    return null;
  }

  function saveChoice(choice) {
    memoryChoice = choice;
    try {
      window.localStorage.setItem(STORAGE_KEY, choice);
    } catch (error) {
      try {
        window.sessionStorage.setItem(STORAGE_KEY, choice);
      } catch (sessionError) {}
    }
  }

  function revokeGoogleAnalytics() {
    // Stop subsequent GA4 hits immediately, then reload without the tag.
    window['ga-disable-' + MEASUREMENT_ID] = true;
    if (window.__mingeagleGa4Loaded && typeof window.gtag === 'function') {
      window.gtag('consent', 'update', {
        analytics_storage: 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied'
      });
    }
    // Best-effort deletion of first-party Analytics cookies created on this host.
    var host = window.location.hostname;
    var domains = ['', host, '.mingeagle.com'];
    document.cookie.split(';').forEach(function (part) {
      var name = part.split('=')[0].trim();
      if (!/^_ga(?:_|$)|^_gid$|^_gat(?:_|$)/.test(name)) return;
      domains.forEach(function (domain) {
        document.cookie = name + '=; Max-Age=0; path=/' +
          (domain ? '; domain=' + domain : '') + '; SameSite=Lax';
      });
    });
    if (window.__mingeagleGa4Loaded) window.location.reload();
  }

  function loadGoogleAnalytics() {
    if (window.__mingeagleGa4Loaded) return;
    window['ga-disable-' + MEASUREMENT_ID] = false;
    window.__mingeagleGa4Loaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () {
      window.dataLayer.push(arguments);
    };

    var gtag = window.gtag;
    var pageUrl = safePageUrl(window.location.href);
    var referrerUrl = safePageUrl(document.referrer);
    var config = {
      send_page_view: false,
      page_location: pageUrl,
      allow_google_signals: false,
      allow_ad_personalization_signals: false
    };
    if (referrerUrl) config.page_referrer = referrerUrl;

    gtag('js', new Date());
    gtag('config', MEASUREMENT_ID, config);

    var pageView = {
      page_location: pageUrl,
      page_title: document.title
    };
    if (referrerUrl) pageView.page_referrer = referrerUrl;
    gtag('event', 'page_view', pageView);

    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(MEASUREMENT_ID);
    script.onerror = function () {
      window.__mingeagleGa4Loaded = false;
    };
    document.head.appendChild(script);
  }

  // Count only server-accepted inquiries, never an attempted form click.
  // All fields are fixed enums: no customer details or inquiry references.
  function trackConfirmedLead(requestType, delivery) {
    if (readChoice() !== 'accepted' || !window.__mingeagleGa4Loaded ||
        window['ga-disable-' + MEASUREMENT_ID] === true ||
        typeof window.gtag !== 'function') return false;
    var leadType = requestType === 'Wholesale quote' ? 'wholesale' :
      requestType === 'Sample request' ? 'sample' :
      requestType === 'Retail purchase inquiry' ? 'retail' : 'other';
    var deliveryType = delivery === 'primary_crm' ? 'primary_crm' :
      delivery === 'backup_form' ? 'backup_form' : 'other';
    window.gtag('event', 'generate_lead', {
      send_to: MEASUREMENT_ID,
      lead_type: leadType,
      lead_delivery: deliveryType,
      page_location: safePageUrl(window.location.href)
    });
    return true;
  }
  window.MingEagleGA4 = Object.freeze({ trackConfirmedLead: trackConfirmedLead });

  function makeButton(className, handler) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.addEventListener('click', handler);
    return button;
  }

  function init() {
    if (!document.body || document.getElementById('mingeagle-analytics-consent')) return;

    var panel = document.createElement('section');
    panel.id = 'mingeagle-analytics-consent';
    panel.className = 'mingeagle-ga4-panel';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-live', 'polite');

    var heading = document.createElement('h2');
    heading.className = 'mingeagle-ga4-title';
    heading.id = 'mingeagle-ga4-title';

    var body = document.createElement('p');
    body.className = 'mingeagle-ga4-copy';

    var policy = document.createElement('a');
    policy.className = 'mingeagle-ga4-policy';
    policy.href = '/policies.html#privacy';

    var actions = document.createElement('div');
    actions.className = 'mingeagle-ga4-actions';

    var accept = makeButton('mingeagle-ga4-button mingeagle-ga4-accept', function () {
      saveChoice('accepted');
      panel.hidden = true;
      loadGoogleAnalytics();
    });
    var reject = makeButton('mingeagle-ga4-button mingeagle-ga4-reject', function () {
      saveChoice('rejected');
      panel.hidden = true;
      revokeGoogleAnalytics();
    });
    var close = makeButton('mingeagle-ga4-button mingeagle-ga4-close', function () {
      panel.hidden = true;
    });
    close.hidden = true;

    actions.appendChild(accept);
    actions.appendChild(reject);
    actions.appendChild(close);
    panel.appendChild(heading);
    panel.appendChild(body);
    panel.appendChild(policy);
    panel.appendChild(actions);

    // Keep a normal text link in the site footer instead of a floating control.
    // The destination remains useful if this script is unavailable.
    var settings = document.createElement('a');
    settings.className = 'mingeagle-ga4-settings';
    settings.href = '/policies.html#privacy';
    settings.setAttribute('aria-controls', panel.id);
    settings.addEventListener('click', function (event) {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      panel.hidden = false;
      close.hidden = false;
      accept.focus();
    });

    function renderText() {
      var text = STRINGS[locale()];
      heading.textContent = text.title;
      panel.setAttribute('aria-labelledby', heading.id);
      body.textContent = text.body;
      accept.textContent = text.accept;
      reject.textContent = text.reject;
      policy.textContent = text.policy;
      settings.textContent = text.settings;
      close.textContent = text.close;
    }

    renderText();
    document.body.appendChild(panel);
    var footerTarget = document.querySelector('.footer .footgrid > div:last-child') ||
      document.querySelector('.footer .footgrid') ||
      document.querySelector('footer') || document.body;
    footerTarget.appendChild(settings);

    var choice = readChoice();
    if (choice) {
      panel.hidden = true;
      if (choice === 'accepted') loadGoogleAnalytics();
    } else {
      panel.hidden = false;
    }

    window.addEventListener('mingeagle:language', renderText);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();