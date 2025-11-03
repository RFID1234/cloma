// scripts/indexbundle.js (production-ready)
(function () {
    'use strict';
    var culture
  
    // PUBLIC R2 base (public dev URL)
    var R2_BASE = 'https://pub-4b0242a2a98f47a8b66fb0db20036b90.r2.dev';
  
    function getCurrentCulture() {
      return culture = navigator.language,
      culture || (culture = "en"),
      culture
    }
    function getCultureForDatepicker() {
      var n = getCurrentCulture();
      return n === "en-US" || n === "en" ? n = "" : n.startsWith("es-") ? n = "es" : n.startsWith("zh-") && (n = "zh"),
      n
    }
    function addSharingFunction() {
      if (window.__sharethis__ && typeof window.__sharethis__.initialize === 'function') {
          window.__sharethis__.initialize();
      }
    }
    function verifyCatpcha(n) {
        try {
          // If the page contains either the legacy .h-captcha OR our explicit #hcaptcha-container,
          // require a real response. If no container exists at all, treat as passed (defensive).
          var hasContainer = (n.find && n.find(".h-captcha").length) || (document.getElementById('hcaptcha-container') ? 1 : 0);
          if (!hasContainer) {
            // No hcaptcha present anywhere on page — don't block (defensive)
            return true;
          }
      
          // Look for known response locations
          var resp = "";
      
          // 1) textarea fields produced by widgets (g/h-captcha)
          try {
            var ta = (n.find && n.find('textarea[name="h-captcha-response"], textarea[name^="h-captcha-response"], textarea[name="g-recaptcha-response"], textarea[id^="h-captcha-response-"], textarea[id^="g-recaptcha-response-"]'));
            if (ta && ta.length) resp = ta.val() || "";
          } catch (e) { /* ignore */ }
      
          // 2) data attribute on iframe (some builds set data-hcaptcha-response)
          if (!resp) {
            var iframe = (n.find && n.find(".h-captcha").find("iframe"));
            if ((!iframe || iframe.length === 0) && document.getElementById('hcaptcha-container')) {
              iframe = $('#hcaptcha-container').find('iframe');
            }
            if (iframe && iframe.length) {
              resp = iframe.attr('data-hcaptcha-response') || "";
            }
          }
      
          // 3) try hcaptcha API if available (rendered via explicit API)
          if (!resp && window.hcaptcha && typeof window.hcaptcha.getResponse === 'function') {
            try {
              // try to find widget id on iframe attribute
              var wid = $('#hcaptcha-container iframe').attr('data-hcaptcha-widget-id') || $('.h-captcha iframe').attr('data-hcaptcha-widget-id');
              if (wid) resp = window.hcaptcha.getResponse(wid) || "";
              else {
                // fallback: try getResponse(0)
                resp = (window.hcaptcha.getResponse && window.hcaptcha.getResponse()) || "";
              }
            } catch (e) {
              // ignore
            }
          }
      
          return (resp && resp !== "");
        } catch (e) {
          console.warn('verifyCatpcha error', e);
          // in case of unexpected error, fail safe and treat as NOT OK (force human to solve)
          return false;
        }
      }
      
    
      function bindContactForm() {
        // UI-only contact: do NOT send network request (serverless requirement)
        $("#contactFormSuccess").hide();
        $("#contactFormContainer").show();
      
        // Defensive: prevent native form submit (prevents accidental POST).
        $("#contactForm").off('submit').on('submit', function(e) { e.preventDefault(); });
      
        // init datepicker safely
        var n = getCultureForDatepicker();
        try { $("#PurchaseDate").datepicker({ language: n, autoclose: true, format: 'mm/dd/yyyy' }); } catch (ex) { console.warn('datepicker init failed', ex); }
      
        var $form = $("#contactForm");
      
        // Ensure submit button doesn't trigger native submit
        $("#btnSubmitContact").attr('type','button');
      
        // Add a hidden field that will be used to track hcaptcha response for validator
        if ($("#hcaptcha-response-hidden").length === 0) {
          $('<input>').attr({type: 'hidden', id: 'hcaptcha-response-hidden', name: 'hcaptcha-response-hidden', value: ''})
            .appendTo($form);
        }
      
        // Ensure jQuery Validate exists (sitebundle typically provides it)
        var validator = null;
        if ($.fn && typeof $.fn.validate === 'function') {
          try {
            // If form already had unobtrusive validation, calling validate() returns validator instance
            validator = $form.validate();
          } catch (e) {
            console.warn('validate() initialization warning', e);
          }
        }
      
        // Add required rules (useful when original HTML lacks data-val-required for some fields)
        try {
          if (validator) {
            // tidy: remove pre-existing rules before adding to avoid duplicates
            $("#RetailerName").rules && $("#RetailerName").rules('remove');
            $("#RetailerLocation").rules && $("#RetailerLocation").rules('remove');
            $("#PurchaseDate").rules && $("#PurchaseDate").rules('remove');
            $("#Product").rules && $("#Product").rules('remove');
            $("#CustomerEmail").rules && $("#CustomerEmail").rules('remove');
            $("#hcaptcha-response-hidden").rules && $("#hcaptcha-response-hidden").rules('remove');
      
            $("#RetailerName").rules('add', { required: true, messages: { required: "You must tell us whom you bought the product from." }});
            $("#RetailerLocation").rules('add', { required: true, messages: { required: "You must tell us where you bought the product." }});
            $("#PurchaseDate").rules('add', { required: true, messages: { required: "You must tell us when you bought the product." }});
            $("#Product").rules('add', { required: true, messages: { required: "You must tell us what it was that you bought." }});
            $("#CustomerEmail").rules('add', { required: true, email: true, messages: { required: "Email is required", email: "Email is not valid" }});
            // make hidden captcha field required — message will be shown in #captchaError span (we also show/hide it manually)
            $("#hcaptcha-response-hidden").rules('add', { required: true, messages: { required: "This information is required. Please provide." }});
          }
        } catch (e) { console.warn('rules() add failed', e); }
      
        // Live validation: validate the field on input/change so messages appear as the user types
        try {
          $form.find('input,textarea,select').on('input change blur', function () {
            if (validator && $(this).length) {
              try { validator.element(this); } catch (err) { /* ignore */ }
            }
          });
        } catch (e) { /* ignore */ }
      
        // Watch hcaptcha: set #hcaptcha-response-hidden as soon as we detect a response.
        // This uses multiple detection mechanisms:
        // - if window.hcaptcha exists and we can get widget id, use hcaptcha.getResponse(widgetId)
        // - else, fallback to checking iframe textarea/attributes created by hcaptcha
        (function watchHcaptcha() {
          var checkInterval = null;
          var tries = 0;
          function checkOnce() {
            tries++;
            var resp = '';
            try {
              // 1) prefer explicit widget API if available
              if (window.hcaptcha && typeof window.hcaptcha.getResponse === 'function') {
                // try to detect widget id from render (iframe may have data-hcaptcha-widget-id)
                var widgetId = null;
                // if you stored the id globally when rendering, use it (e.g. window.__hcaptcha_widget)
                if (window.__hcaptcha_widget !== undefined) widgetId = window.__hcaptcha_widget;
                // otherwise attempt to parse iframe attr
                var ifr = document.querySelector('#hcaptcha-container iframe');
                if (ifr) {
                  var w = ifr.getAttribute('data-hcaptcha-widget-id');
                  if (w) widgetId = w;
                }
                if (widgetId !== null) {
                  resp = window.hcaptcha.getResponse(widgetId) || '';
                }
              }
      
              // 2) fallback: check the standard textarea name that hcaptcha may create
              if (!resp) {
                var ta = document.querySelector('textarea[name^="h-captcha-response"], textarea[name^="g-recaptcha-response"]');
                if (ta) resp = (ta.value || '').trim();
              }
      
              // 3) fallback: check iframe attribute data-hcaptcha-response (if present)
              if (!resp) {
                var ifr2 = document.querySelector('#hcaptcha-container iframe');
                if (ifr2) {
                  var attr = ifr2.getAttribute('data-hcaptcha-response');
                  if (attr) resp = attr.trim();
                }
              }
            } catch (e) {
              // ignore
            }
      
            // update hidden input and validator
            if (resp && resp.length > 0) {
              $("#hcaptcha-response-hidden").val(resp);
              $("#captchaError").hide();
              try { if (validator) validator.element("#hcaptcha-response-hidden"); } catch(e){}
              // once solved, stop polling
              clearInterval(checkInterval);
              checkInterval = null;
            } else {
              // not solved yet - clear hidden input so validator can show error if user clicks submit
              $("#hcaptcha-response-hidden").val('');
            }
      
            // stop after ~60 tries (30s)
            if (tries > 60 && checkInterval) { clearInterval(checkInterval); checkInterval = null; }
          }
      
          // start polling if there's an hcaptcha container, otherwise do nothing
          if (document.getElementById('hcaptcha-container')) {
            checkInterval = setInterval(checkOnce, 500);
            // also run once immediately
            checkOnce();
          }
        })();
      
        // Final: attach click handler that runs validation + captcha check and shows success UI only if valid
        $("#btnSubmitContact").off('click').on('click', function (e) {
          e && e.preventDefault();
      
          // re-evaluate form validity
          var isValid = true;
          try {
            if ($form && $form.length && typeof $form.valid === 'function') {
              isValid = $form.valid();
            }
          } catch (ex) {
            console.warn('validation check failed', ex);
            isValid = true;
          }
      
          // run explicit captcha check
          var captchaOk = true;
          try {
            // our hidden input is authoritative for captcha
            if ($("#hcaptcha-response-hidden").length) {
              captchaOk = $("#hcaptcha-response-hidden").val() && $("#hcaptcha-response-hidden").val().length > 0;
            }
          } catch (ex) { captchaOk = true; }
      
          if (!isValid) {
            console.log("Contact form validation failed — showing messages.");
            $("#contactFormContainer").show();
            $("#contactFormFailure").hide();
            $("#contactFormSuccess").hide();
            return;
          }
      
          if (!captchaOk) {
            $("#captchaError").show();
            $("#contactFormContainer").show();
            $("#contactFormFailure").hide();
            $("#contactFormSuccess").hide();
            return;
          }
      
          // All good: show success UI (no network POST)
          console.log("Simulating successful contact form submit (UI only)");
          $("#contactFormContainer").fadeOut(300, function () {
            $("#contactFormFailure").hide();
            $("#contactFormSuccess").fadeIn(400);
          });
        });
      }
      
        
      
      
    function bindCarousels() {
      var n = $(".gfecarousel");
      n.carousel("cycle")
    }
    function storePosition(n) {
      longitude = n.coords.longitude;
      latitude = n.coords.latitude;
      accuracy = n.coords.accuracy;
      authenticateAutomatically != undefined && authenticateAutomatically && authenticate()
    }
    function moveOn(n) {
      console.warn(`ERROR(${n.code}): ${n.message}`);
      authenticateAutomatically != undefined && authenticateAutomatically && authenticate()
    }
    function buildUrl(n, t, i) {
      n = n.includes("Home/") ? n.replace("Home/", t + "/") : t + n;
      var n = new URL(n, window.location.origin);
      return i && n.searchParams.append("culture", i),
      n
    }
    function setupUtilitiesVisibility(n, t) {
      for (var u = t == "valid", r = 1; r <= $(".feaure_utility").length; r++) {
          var i = "#section_utility" + r
            , f = $(i).data("productsforshowingutility")
            , e = $(i).data("showonvalid") == "True";
          e ? u ? showUtility(f, n) ? $(i).parent().fadeIn(fadeTime) : $(i).parent().fadeOut(fadeTime) : $(i).parent().fadeOut(fadeTime) : $(i).parent().fadeIn(fadeTime)
      }
    }
    function showUtility(n, t) {
      var i, r;
      return n === "" || n === undefined || n == null ? !0 : t.toString() !== "" ? (i = [],
      i.push(n.toString().split("|")),
      r = !1,
      i[0].forEach(function(n) {
          n === t.toString() && (r = !0)
      }),
      r) : !1
    }
    function authenticate() {
      $("#authoutcome").fadeOut(fadeTime);
      $("#authresponse").html(loader);
      $("#authresponse").show();
      $("#contactFormSuccess").hide();
      $("#contactFormFailure").hide();
      $("#authloader").fadeIn(fadeTime);
      $("html, body").animate({
          scrollTop: parseInt($("#authresponse").offset().top)
      }, fadeTime);
      processAuthentication()
    }
  
    function processAuthentication() {
      var model = getAuthenticatioModel();
  
      // UI loader (keeps behaviour identical to original)
      $("#authoutcome").fadeOut(fadeTime);
      $("#authresponse").html(loader);
      $("#authresponse").show();
      $("#contactFormSuccess").hide();
      $("#contactFormFailure").hide();
      $("#authloader").fadeIn(fadeTime);
      $("html, body").animate({
          scrollTop: parseInt($("#authresponse").offset().top)
      }, fadeTime);
  
      // call serverless verify on Vercel
            // call serverless verify on Vercel
            $.ajax({
                url: '/api/verify',
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({ code: model.Code }),
                success: function(resp) {
                    setTimeout(function() {
                        $("#authloader").fadeOut(fadeTime);
      
                        // helper: check guilloche exists (HEAD)
                        function guillocheExists(url) {
                          try {
                            return fetch(url, { method: 'HEAD' }).then(function(r){
                              return r.ok && ( (r.headers.get('content-type')||'').startsWith('image') );
                            }).catch(function(){ return false; });
                          } catch (e) { return Promise.resolve(false); }
                        }
      
                        // Build the candidate guilloche URL (server takes precedence)
                        // use proxy endpoint (same origin) so HEAD/GET won't be blocked by CORS
                        var candidateG = '/api/guilloche?code=' + encodeURIComponent((resp && resp.code) || '');

      
                        // Build both HTML fragments as strings (so we can decide after checking image)
                        var counterfeitHtml = `<input id="ResultCode" name="ResultCode" type="hidden" value="${resp && resp.code}" />
        <div class="container">
          <div class="row">
            <div id="authoutcome" data-result="invalid" data-product="${resp && (resp.productName || 'Cloma Product')}">
              <div class="col-xs-12">
                <h2 class="page-header text-center margin-top-20">Result for '${resp && resp.code}'</h2>
                <h2 class="text-center" style="color:#000000"><strong>You have a suspect counterfeit product</strong></h2>
                <p style="text-align: center"><strong><span style="font-size: 22px">Please return it to where you purchased and '<a href="mailto:info@clomapharma.com">CONTACT US</a>' for further assistance if needed</span></strong></p>
              </div>
            </div>
          </div>
        </div>`;
      
                        var successHtml = `<input id="ResultCode" name="ResultCode" type="hidden" value="${resp && resp.code}"/>
        <div class="container">
          <div class="row">
            <div id="authoutcome" class="validcontainer" data-result="valid" data-product="${resp && (resp.productName || 'Cloma Product')}">
              <div class="col-xs-12">
                <h2 class="page-header text-center margin-top-20">Result for '${resp && resp.code}'</h2>
                <h2 class="text-center" style="color:#296829"><i class="fa fa-check"></i></h2>
                <h2 class="text-center" style="color:#296829" id="ValidTitle"><strong>Congratulations! Your Cloma product is authentic</strong></h2>
                <p>Thank you for your purchase of a genuine Cloma product.</p>
                <hr/>
                <div class="col-md-6">
                  <h2 class="page-header text-center"><span>Guilloche Response Page</span></h2>
                  <p>Your product has been verified</p>
                </div>
                <div class="col-md-6 padding-10">
                  <img src="${candidateG}"
                       onerror="this.onerror=null; this.src='/assets/guilloche/placeholder.png';"
                       class="img-responsive centre"
                       alt="Guilloche"
                       style="max-width:100%;">
                </div>
              </div>
            </div>
          </div>
        </div>`;
      
                        // Check guilloche before choosing UI
                        guillocheExists(candidateG).then(function(exists){
                            if (!exists) {
                              // treat as counterfeit if image is not present
                              $("#authresponse").html(counterfeitHtml);
                            } else {
                              $("#authresponse").html(successHtml);
                            }
      
                            // post-success UI ops (same for both branches)
                            $("#authoutcome").fadeIn(fadeTime);
                            var i = $("#authoutcome").data("result"),
                                u = $("#authoutcome").data("product"),
                                f = $("#contactformarea").data("showinfochoice"),
                                r = false;
                            r = f == "ShowOnFakeAndInvalidResponse" ? (i === "counterfeit" || i === "invalid") : true;
                            r && $("#reportLink").fadeIn(fadeTime);
                            setupUtilitiesVisibility(u, i);
                            fixView();
                            if (codepresent) {
                                window.setTimeout(function() {
                                    $("#authform").remove();
                                    $(".authbutton").remove();
                                }, fadeTime);
                            } else {
                                $("#Code").val("");
                            }
                            if (typeof runTNT == "function") runTNT(model);
                        });
                    }, spinnerDelay);
                },
                error: function(err) {
                    if (err && err.status === 403) {
                        $("#authresponse").html("<div class='alert alert-danger'>" + forbiddenError + "</div>");
                    } else {
                        $("#authresponse").html("<div class='alert alert-danger'>" + generalError + "</div>");
                    }
                }
            });
      
    }
  
    function fixView() {
      $("#btnTryAgain").click(function() {
          $("#authresponse").fadeOut(fadeTime);
          $("#authoutcome").fadeOut(fadeTime);
          $("html, body").animate({
              scrollTop: parseInt($("#section_authenicate").offset().top) - 80
          }, fadeTime);
          $("#Code").focus()
      });
      $("#btnReportLink").click(function() {
          // before showing contact form, lazy-load hCaptcha (non-blocking)
if (typeof window.ensureHcaptcha === 'function') {
    window.ensureHcaptcha().then(() => {
      // hCaptcha loaded and rendered
      $("#contactformarea").fadeIn(fadeTime, function() {
        $("html, body").animate({ scrollTop: parseInt($("#section_contact").offset().top) - 80 }, fadeTime);
        bindContactForm();
        $("#reportLink").hide();
      });
    }).catch(() => {
      // if hCaptcha fails to load, still show form (do not block user)
      $("#contactformarea").fadeIn(fadeTime, function() {
        $("html, body").animate({ scrollTop: parseInt($("#section_contact").offset().top) - 80 }, fadeTime);
        bindContactForm();
        $("#reportLink").hide();
      });
    });
  } else {
    // fallback: show form immediately
    $("#contactformarea").fadeIn(fadeTime, function() {
      $("html, body").animate({ scrollTop: parseInt($("#section_contact").offset().top) - 80 }, fadeTime);
      bindContactForm();
      $("#reportLink").hide();
    });
  }
  
      });
      $(".validcontainer").length && ($(".sharethis-inline-share-buttons").length && addSharingFunction(),
      typeof runMarketing == "function" && runMarketing());
      bindCarousels();
      var n = document.querySelector(".productVideo .video-js");
      n != null && hasVideo && videojs(n, {
          controlBar: {
              fullscreenToggle: !0
          }
      })
    }
  
    function getAuthenticatioModel() {
      var n = (new Date).getTimezoneOffset();
      return {
          Code: $("#Code").val(),
          Longitude: longitude,
          Latitude: latitude,
          Confidence: accuracy,
          Offset: n
      }
    }
  
    var longitude, latitude, accuracy;
    $.ajaxSetup({
      beforeSend: function(n) {
          // keep token header for security if present
          var tkn = $("#RequestVerificationToken").val();
          if (tkn) n.setRequestHeader("RequestVerificationToken", tkn);
      }
    });
    $(document).ajaxComplete(function(n, t) {
      if (t.status == 301 || t.status == 307) {
          var i = null;
          try {
              i = $.parseJSON(t.responseText)
          } catch {}
          i != null && (i.responseCode == 301 || i.responseCode == 307) && (window.location.href = i.url)
      }
    });
    document.addEventListener("DOMContentLoaded", function() {
      var n, t, i;
      if ("IntersectionObserver"in window)
          n = document.querySelectorAll("img.lazy"),
          t = new IntersectionObserver(function(n) {
              n.forEach(function(n) {
                  if (n.isIntersecting) {
                      var i = n.target;
                      i.src = i.dataset.src;
                      i.classList.remove("lazy");
                      t.unobserve(i)
                  }
              })
          }
          ,{
              rootMargin: "0px 0px 500px 0px"
          }),
          n.forEach(function(n) {
              t.observe(n)
          });
      else {
          n = document.querySelectorAll("img.lazy");
          function t() {
              i && clearTimeout(i);
              i = setTimeout(function() {
                  var i = window.pageYOffset;
                  n.forEach(function(n) {
                      n.offsetTop < window.innerHeight + i + 500 && (n.src = n.dataset.src,
                      n.classList.remove("lazy"))
                  });
                  n.length == 0 && (document.removeEventListener("scroll", t),
                  window.removeEventListener("resize", t),
                  window.removeEventListener("orientationChange", t))
              }, 20)
          }
          document.addEventListener("scroll", t);
          window.addEventListener("resize", t);
          window.addEventListener("orientationChange", t)
      }
    });
    $("#authform").off('submit').on('submit', function(n) {
      n.preventDefault();
      authenticate()
    });
    $(document).ready(function() {
      navigator.geolocation && navigator.geolocation.getCurrentPosition(storePosition);
      bindCarousels()
    });
    $(".authbutton").off('click').on("click", function(e) {
      e && e.preventDefault();
      if ($("#authform").valid && $("#authform").valid()) {
          $("#authform").submit();
      } else {
          $("#authform").submit();
      }
    });
  
  })();
  
