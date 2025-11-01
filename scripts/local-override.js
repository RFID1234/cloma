// scripts/local-override.js (minimal — production friendly)
(function () {
    'use strict';
  
    var R2_BASE = 'https://pub-4b0242a2a98f47a8b66fb0db20036b90.r2.dev';
  
    function getCodeFromQuery() {
      try {
        const url = new URL(window.location.href);
        return url.searchParams.get('c') || url.searchParams.get('code') || '';
      } catch (e) {
        return '';
      }
    }
  
    function setCodeOnPage(code) {
      if (!code) return;
      const hidden = document.querySelector('#Code') || document.querySelector('input[name="Code"]');
      if (hidden) hidden.value = code;
      const visible = document.querySelector('.bigtext');
      if (visible) visible.textContent = code;
    }
  
    function escapeHtml(s) {
      return String(s || '').replace(/[&<>"']/g, function (m) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
      });
    }
  
    function buildCounterfeitHTML(code) {
      return `
  <input id="ResultCode" name="ResultCode" type="hidden" value="${escapeHtml(code)}" />
  <div class="container">
    <div class="row">
      <div id="authoutcome" data-result="invalid" data-product="Cloma Product">
        <div class="col-xs-12">
          <h2 class="page-header text-center margin-top-20">Result for '${escapeHtml(code)}'</h2>
          <h2 class="text-center" style="color:#000000"><strong>You have a suspect counterfeit product</strong></h2>
          <p style="text-align: center"><strong><span style="font-size: 22px">Please return it to where you purchased and '<a href="mailto:info@clomapharma.com">CONTACT US</a>' for further assistance if needed</span></strong></p>
        </div>
      </div>
    </div>
  </div>`;
    }
  
    function buildAuthenticHTML(code, guillocheUrl) {
      var g = guillocheUrl || (R2_BASE + '/images/guilloche_' + encodeURIComponent(code) + '.png');
      return `
  <input id="ResultCode" name="ResultCode" type="hidden" value="${escapeHtml(code)}"/>
  <div class="container">
    <div class="row">
      <div id="authoutcome" class="validcontainer" data-result="valid" data-product="Cloma Product">
        <div class="col-xs-12">
          <h2 class="page-header text-center margin-top-20">Result for '${escapeHtml(code)}'</h2>
          <h2 class="text-center" style="color:#296829"><i class="fa fa-check"></i></h2>
          <h2 class="text-center" style="color:#296829" id="ValidTitle"><strong>Congratulations! Your Cloma product is authentic</strong></h2>
          <p>Thank you for your purchase of a genuine Cloma product.</p>
          <hr/>
          <div class="col-md-6">
            <h2 class="page-header text-center"><span>Guilloche Response Page</span></h2>
            <p>Your product has been verified</p>
          </div>
          <div class="col-md-6 padding-10">
            <img src="${g}"
                 onerror="this.onerror=null; this.src='/assets/guilloche/placeholder.png';"
                 class="img-responsive centre"
                 alt="Guilloche"
                 style="max-width:100%;">
          </div>
        </div>
      </div>
    </div>
  </div>`;
    }
  
    function showLoader() {
      const resp = document.querySelector('#authresponse');
      if (!resp) return;
      resp.innerHTML = '<div class="inpageloader"><img src="/assets/img/spinner.svg" alt="Loading..." class="preloader__spinner"><h2 class="page-header text-center">Checking your product</h2></div>';
    }
  
    async function guillocheExists(url) {
        try {
          const r = await fetch(url, { method: 'HEAD' });
          return r.ok && ((r.headers.get('content-type') || '').startsWith('image'));
        } catch (e) {
          return false;
        }
      }
  
      async function showResponseFragment(json) {
        const resp = document.querySelector('#authresponse');
        if (!resp) return;
        if (!json) {
          resp.innerHTML = '<div class="alert alert-warning">Something went wrong.</div>';
          return;
        }
  
        if (json.status === 'counterfeit') {
          resp.innerHTML = buildCounterfeitHTML(json.code || json.c || '');
          resp.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
  
        // json.status === 'valid' -> check if guilloche image exists
        const gUrl = json.guillocheUrl || (R2_BASE + '/images/guilloche_' + encodeURIComponent(json.code || '') + '.png');
        const exists = await guillocheExists(gUrl);
        if (!exists) {
          // treat as counterfeit when no guilloche available
          resp.innerHTML = buildCounterfeitHTML(json.code || json.c || '');
        } else {
          resp.innerHTML = buildAuthenticHTML(json.code || json.c || '', gUrl);
        }
        resp.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
  

    async function callVerify(code) {
        try {
          const res = await fetch('/api/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
          });
          if (!res.ok) {
            console.error('verify call failed', res.status, await res.text());
            return null;
          }
          return await res.json();
        } catch (e) {
          console.error('verify error', e);
          return null;
        }
      }
      
  
    // Initialize: set code from query, but don't attach any handlers (main bundle manages events)
    function init() {
      var code = getCodeFromQuery();
      if (code) setCodeOnPage(code);
    }
  
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }

    // Defensive: ensure #btnReportLink shows contact area and lazy-loads hcaptcha
document.addEventListener('DOMContentLoaded', function(){
    var btn = document.getElementById('btnReportLink');
    if (!btn) return;
    // if jQuery event already attached, don't override
    try {
      var hasJq = window.jQuery && $._data && $._data(btn, 'events') && $._data(btn, 'events').click;
      if (hasJq) return;
    } catch (e) { /* ignore */ }
  
    btn.addEventListener('click', function(e){
      e.preventDefault();
      function showContact() {
        // use jQuery fade if available, fallback to style
        if (window.jQuery) {
          $('#contactformarea').fadeIn(fadeTime, function(){
            $('html, body').animate({ scrollTop: parseInt($('#section_contact').offset().top) - 80 }, fadeTime);
            if (typeof bindContactForm === 'function') bindContactForm();
            $('#reportLink').hide();
          });
        } else {
          document.getElementById('contactformarea').style.display = 'block';
          window.scrollTo({ top: document.getElementById('section_contact').offsetTop - 80, behavior: 'smooth' });
          if (typeof bindContactForm === 'function') bindContactForm();
          document.getElementById('reportLink').style.display = 'none';
        }
      }
  
      if (typeof window.ensureHcaptcha === 'function') {
        window.ensureHcaptcha().then(function(){ showContact(); }).catch(function(){ showContact(); });
      } else {
        showContact();
      }
    });
  });
  
  
    // Expose a few helpers to the console for debugging after deploy
    window.__localOverrideHelpers = {
      buildAuth: buildAuthenticHTML,
      buildFake: buildCounterfeitHTML,
      showLoader: showLoader,
      showResponse: showResponseFragment
    };
  
  })();
  
