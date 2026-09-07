(function () {
  "use strict";

  var productionHosts = ["sterlingranchsociety.com", "www.sterlingranchsociety.com"];
  var isProduction = productionHosts.indexOf(window.location.hostname) !== -1;
  var currentScript = document.currentScript;

  if (isProduction) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };

    var analyticsScript = document.createElement("script");
    analyticsScript.async = true;
    analyticsScript.src = "https://www.googletagmanager.com/gtag/js?id=G-GSHC10SK92";
    document.head.appendChild(analyticsScript);

    window.gtag("js", new Date());
    var config = {};
    var pageTitle = currentScript && currentScript.dataset.pageTitle;
    var pagePath = currentScript && currentScript.dataset.pagePath;
    if (pageTitle) config.page_title = pageTitle;
    if (pagePath) config.page_path = pagePath;
    window.gtag("config", "G-GSHC10SK92", config);
    return;
  }

  window.gtag = function () {};

  if (window.location.hostname.indexOf("staging") === -1) return;

  document.title = "[STAGING] " + document.title;
  document.addEventListener("DOMContentLoaded", function () {
    var banner = document.createElement("div");
    banner.className = 'staging-environment-banner';
    banner.setAttribute("role", "status");
    banner.textContent = "STAGING — TEST SITE — CHANGES HERE ARE NOT LIVE";
    Object.assign(banner.style, {
      position: "fixed",
      right: "16px",
      bottom: "16px",
      zIndex: "2147483647",
      padding: "10px 14px",
      border: "2px solid #ffffff",
      borderRadius: "999px",
      background: "#7c3aed",
      color: "#ffffff",
      boxShadow: "0 6px 24px rgba(0, 0, 0, 0.3)",
      font: "700 12px/1.2 system-ui, sans-serif",
      letterSpacing: "0.04em",
      pointerEvents: "none",
    });
    var mobileStyle = document.createElement('style');
    mobileStyle.textContent = '@media(max-width:600px){.staging-environment-banner{position:static!important;border-radius:0!important;text-align:center;flex-shrink:0;box-shadow:none!important;padding:7px 10px!important}}';
    document.head.appendChild(mobileStyle);
    document.body.prepend(banner);
  });
})();
