/**
 * Skip Desk — voice widget loader.
 *
 * A business drops ONE line on their site:
 *   <script src="https://<your-skipdesk-app>/embed.js" data-business="<slug-or-id>" async></script>
 *
 * It fetches that business's PUBLIC widget config from the Skip Desk worker (name, hours,
 * FAQ summary — the same context the agent speaks), mounts a floating mic button, and starts
 * a Vapi voice call with that context injected as variableValues. No secrets touch the page;
 * the lead is written server-side when the call ends.
 *
 * We use Vapi's official @vapi-ai/web SDK (loaded as an ES module) and call
 * start(assistantId, { variableValues }). We avoid the <vapi-widget> web component because
 * v0.1.1 nests assistantId/assistantOverrides under a transient `assistant`, which Vapi's
 * /call/web rejects with 400.
 *
 * Optional attribute: data-color (button accent, default SkipDesk coral).
 */
(function () {
  var WORKER_BASE = 'https://skip-desk-mcp.sweet-night-5b17.workers.dev'
  var SDK_URL = 'https://esm.sh/@vapi-ai/web@2.5.2'

  var tag = document.currentScript
  var business = tag && tag.getAttribute('data-business')
  if (!business) {
    console.error('[SkipDesk] embed.js: add data-business="<your-slug-or-id>" to the script tag')
    return
  }
  var accent = (tag.getAttribute('data-color') || '#e8462b')
  var by = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(business) ? 'businessId' : 'slug'

  fetch(WORKER_BASE + '/widget/config?' + by + '=' + encodeURIComponent(business))
    .then(function (r) { return r.ok ? r.json() : null })
    .then(function (cfg) {
      if (!cfg) { console.error('[SkipDesk] business not found:', business); return }
      if (!cfg.vapiPublicKey || !cfg.vapiAssistantId) { console.warn('[SkipDesk] widget not configured yet'); return }
      mount(cfg)
    })
    .catch(function (e) { console.error('[SkipDesk] embed.js failed to load widget', e) })

  function mount(cfg) {
    var btn = document.createElement('button')
    btn.type = 'button'
    btn.setAttribute('aria-label', 'Talk to us')
    btn.style.cssText =
      'position:fixed;right:20px;bottom:20px;z-index:2147483000;width:60px;height:60px;border:none;border-radius:50%;' +
      'cursor:pointer;color:#fff;background:' + accent + ';box-shadow:0 6px 24px rgba(0,0,0,.25);' +
      'display:flex;align-items:center;justify-content:center;transition:transform .15s,background .15s;font:inherit'
    btn.innerHTML = micSvg()
    btn.setAttribute('data-accent', accent)
    btn.onmouseenter = function () { btn.style.transform = 'scale(1.06)' }
    btn.onmouseleave = function () { btn.style.transform = 'scale(1)' }
    document.body.appendChild(btn)

    var vapi = null
    var live = false
    var connecting = false

    btn.addEventListener('click', function () {
      if (connecting) return
      if (live) { if (vapi) vapi.stop(); return }
      connecting = true
      btn.style.opacity = '.7'
      import(/* @vite-ignore */ SDK_URL)
        .then(function (mod) {
          var Vapi = mod.default || mod.Vapi || mod
          if (!vapi) {
            vapi = new Vapi(cfg.vapiPublicKey)
            vapi.on('call-start', function () { live = true; connecting = false; setLive(btn, true) })
            vapi.on('call-end', function () { live = false; connecting = false; setLive(btn, false) })
            vapi.on('error', function (e) { connecting = false; setLive(btn, false); console.error('[SkipDesk] voice error', e) })
          }
          return vapi.start(cfg.vapiAssistantId, { variableValues: cfg.variableValues || {} })
        })
        .catch(function (e) { connecting = false; btn.style.opacity = '1'; console.error('[SkipDesk] could not start call', e) })
    })
  }

  function setLive(btn, on) {
    btn.style.opacity = '1'
    btn.style.background = on ? '#e11d48' : (btn.getAttribute('data-accent') || '#e8462b')
    btn.innerHTML = on ? stopSvg() : micSvg()
  }
  function micSvg() {
    return '<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><rect x="9" y="3" width="6" height="11" rx="3" stroke="#fff" stroke-width="1.8"/><path d="M5 11a7 7 0 0014 0M12 18v3" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>'
  }
  function stopSvg() {
    return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="6" y="6" width="12" height="12" rx="2.5" fill="#fff"/></svg>'
  }
})()
