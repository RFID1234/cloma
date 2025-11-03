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
        // UI-only contact: do NOT send network request
        $("#contactFormSuccess").hide();
        $("#contactFormContainer").show();
      
        // Defensive: prevent native form submit (no return false)
        $("#contactForm").off('submit').on('submit', function (e) { e.preventDefault(); });
      
        // datepicker safe init
        var n = getCultureForDatepicker();
        try { $("#PurchaseDate").datepicker({ language: n, autoclose: true, format: 'mm/dd/yyyy' }); } catch (ex) { console.warn('datepicker init failed', ex); }
      
        var $form = $("#contactForm");
      
        // ensure submit is non-submitting button
        $("#btnSubmitContact").attr('type', 'button');
      
        // add hidden field to reflect captcha status for validation
        if ($("#hcaptcha-response-hidden").length === 0) {
          $("<input>")
            .attr({ type: "hidden", id: "hcaptcha-response-hidden", name: "hcaptcha-response-hidden", value: "" })
            .appendTo($form);
        }
      
        // Obtain validator instance robustly (supports both unobtrusive and manual setups)
        var validator = $form.data('validator') || null;
        try {
          if (!validator && $.fn && typeof $.fn.validate === 'function') {
            validator = $form.validate();
            // store in data so next time $form.data('validator') will return it
            $form.data('validator', validator);
          }
        } catch (ex) {
          console.warn('validator init exception', ex);
          validator = $form.data('validator') || null;
        }
      
        // Add/ensure rules for required fields (in case markup lacks data-val-required)
        try {
          if (validator) {
            // remove previous rules to avoid duplicates
            try { $("#RetailerName").rules('remove'); } catch (e) {}
            try { $("#RetailerLocation").rules('remove'); } catch (e) {}
            try { $("#PurchaseDate").rules('remove'); } catch (e) {}
            try { $("#Product").rules('remove'); } catch (e) {}
            try { $("#CustomerEmail").rules('remove'); } catch (e) {}
            try { $("#hcaptcha-response-hidden").rules('remove'); } catch (e) {}
      
            $("#RetailerName").rules('add', { required: true, messages: { required: "You must tell us whom you bought the product from." }});
            $("#RetailerLocation").rules('add', { required: true, messages: { required: "You must tell us where you bought the product." }});
            $("#PurchaseDate").rules('add', { required: true, messages: { required: "You must tell us when you bought the product." }});
            $("#Product").rules('add', { required: true, messages: { required: "You must tell us what it was that you bought." }});
            $("#CustomerEmail").rules('add', { required: true, email: true, messages: { required: "Email is required", email: "Email is not valid" }});
            $("#hcaptcha-response-hidden").rules('add', { required: true, messages: { required: "This information is required. Please provide." }});
          }
        } catch (e) { console.warn('adding rules failed', e); }
      
        // Live validation: validate field as user types or blurs
        try {
          $form.find('input,textarea,select').on('input change blur', function () {
            if (validator) {
              try { validator.element(this); } catch (e) {}
            }
          });
        } catch (e) {}
      
        // hCaptcha watcher: poll and update hidden input and validator properly
        (function watchHcaptcha() {
          var tries = 0;
          var interval = setInterval(function () {
            tries++;
            var resp = "";
      
            try {
              // 1) If explicit API available and we stored a widget id, use it
              if (window.hcaptcha && typeof window.hcaptcha.getResponse === 'function') {
                // use stored global id if present
                var wid = window.__hcaptcha_widget;
                if (wid === undefined) {
                  // try to read from iframe attr
                  var ifr = document.querySelector('#hcaptcha-container iframe');
                  if (ifr) wid = ifr.getAttribute('data-hcaptcha-widget-id') || wid;
                }
                if (wid !== undefined && wid !== null) {
                  try { resp = (window.hcaptcha.getResponse(wid) || "").trim(); } catch (e) {}
                }
              }
      
              // 2) fallback: check typical textarea names hcaptcha creates
              if (!resp) {
                var ta = document.querySelector('textarea[name^="h-captcha-response"], textarea[name^="g-recaptcha-response"]');
                if (ta) resp = (ta.value || "").trim();
              }
      
              // 3) iframe attribute fallback
              if (!resp) {
                var ifr2 = document.querySelector('#hcaptcha-container iframe');
                if (ifr2) {
                  var attr = ifr2.getAttribute('data-hcaptcha-response');
                  if (attr) resp = attr.trim();
                }
              }
            } catch (e) { /* ignore polling exceptions */ }
      
            // update hidden input and update validator display
            try {
              var $hidden = $("#hcaptcha-response-hidden");
              if (resp && resp.length > 0) {
                $hidden.val(resp);
                // hide visible captcha error if present
                $("#captchaError").hide();
                if (validator) {
                  try {
                    // call validator.element with DOM element for reliability
                    validator.element($hidden[0]);
                  } catch (e) {}
                }
                clearInterval(interval);
              } else {
                // keep hidden cleared so validation will fail until user solves captcha
                $hidden.val('');
              }
            } catch (e) {}
            // stop after ~30s if nothing shows (avoid infinite polling)
            if (tries > 60) { clearInterval(interval); }
          }, 500);
        })();
      
        // Final click handler: run validator + captcha check => show success UI only if all pass
        $("#btnSubmitContact").off('click').on('click', function (e) {
          e && e.preventDefault();
          console.log('btnSubmitContact clicked (debug)');
      
          var isValid = true;
          try {
            if ($form && $form.length && typeof $form.valid === 'function') {
              // call .valid() to trigger showing of errors for all fields
              isValid = $form.valid();
            } else if (validator) {
              isValid = validator.form();
            }
          } catch (ex) {
            console.warn('validation call failed', ex);
            isValid = true; // fallback allow (but shouldn't happen)
          }
      
          // captcha check via hidden input
          var captchaOk = ($("#hcaptcha-response-hidden").val() || "").trim().length > 0;
      
          if (!isValid) {
            console.log('form invalid - showing errors');
            $("#contactFormContainer").show();
            $("#contactFormFailure").hide();
            $("#contactFormSuccess").hide();
            // ensure captcha error shows if captcha is missing
            if (!captchaOk) $("#captchaError").show();
            return;
          }
      
          if (!captchaOk) {
            console.log('captcha missing');
            $("#captchaError").show();
            $("#contactFormContainer").show();
            $("#contactFormFailure").hide();
            $("#contactFormSuccess").hide();
            return;
          }
      
          // All good: simulate success UI (no network POST)
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
  
