/**
 * ============================================================================
 * PromptForge — Gemini Provider Capabilities Extract
 * ============================================================================
 * Source: aboegngdamkgaolhddiblkllbldjhlai (Chrome Extension, MV3)
 * Extension: "PromptForge for ChatGPT, Gemini, Claude and More" v1.1.3
 * Target:  gemini.google.com
 * 
 * This file documents EVERYTHING this extension uses to interact with the
 * Gemini webapp — DOM selectors, event handlers, message contracts, CSS
 * injection, MutationObserver targets, localStorage keys, network endpoints,
 * and cross-frame communication patterns.
 * 
 * Extracted from: assets/chunk-dab8ec86.js (class `oe`, line ~51-209)
 *                 assets/chunk-976934f5.js (background service worker)
 *                 manifest.json
 * ============================================================================
 */

// ============================================================================
// 1. MANIFEST-LEVEL GEMINI CONFIGURATION
// ============================================================================

const MANIFEST_GEMINI_CONFIG = {
  // Host permissions granted to the extension
  host_permissions: [
    "https://gemini.google.com/*"
  ],

  // Content scripts injected on Gemini pages
  content_scripts: [{
    matches: ["https://gemini.google.com/*"],
    js: ["assets/index.ts-loader.44f58e71.js"]
    // → This loader dynamically imports chunk-dab8ec86.js
    // → onExecute() is called, which instantiates the Gemini provider class
  }],

  // Web-accessible resources (injectable into Gemini's page context)
  web_accessible_resources: [
    {
      matches: ["https://gemini.google.com/*"],
      resources: ["assets/chunk-dab8ec86.js"]  // Shared chunk for all providers
    }
  ]
};


// ============================================================================
// 2. BACKGROUND SERVICE WORKER — Gemini URL Mapping
// ============================================================================
// Source: assets/chunk-976934f5.js
// The background worker handles external messages from promptden.com
// and routes them to the correct provider URL.

const BACKGROUND_ROUTING = {
  // Allowed external origins that can message this extension
  allowed_origins: [
    "https://ext.promptden.com",
    "https://promptden.com"
  ],

  // Provider → URL mapping (function `a(t)` in background)
  provider_urls: {
    "chatgpt": "https://chatgpt.com/",
    "gemini":  "https://gemini.google.com/",   // ← Gemini target
    "claude":  "https://claude.ai/chats"
  },

  // External message handler: loadPrompt
  // Receives: { loadPrompt: { site: "gemini", promptId: "<id>" } }
  // Action: Opens/activates Gemini tab with ?forge=<promptId> query param
  loadPrompt_flow: {
    input:    { site: "gemini", promptId: "abc123" },
    url_built: "https://gemini.google.com/?forge=abc123",
    behavior:  "Updates existing Gemini tab or creates new one"
  }
};


// ============================================================================
// 3. GEMINI PROVIDER CLASS (`oe` / class GeminiProvider)
// ============================================================================
// This is the main class that handles ALL Gemini-specific interactions.
// It is instantiated when the content script detects it's on gemini.google.com.
// 
// Key properties:
//   - this.site = "gemini"
//   - this.body = document.getElementsByTagName("chat-app")[0]  ← ROOT ELEMENT
//   - this.userNav = document.getElementsByTagName("body")[0].firstChild
//   - this.shared = singleton (class `ne`) — shared utilities across providers

class GeminiProvider {
  // --------------------------------------------------------------------------
  // 3a. DOM ROOT REFERENCES (set in constructor)
  // --------------------------------------------------------------------------
  
  // The root element of Gemini's app — used for body adjustments
  // Selector: document.getElementsByTagName("chat-app")[0]
  // NOTE: Gemini uses a custom element <chat-app> as the app root
  
  chatAppRoot = document.getElementsByTagName("chat-app")[0];
  
  // The first child of <body> — assumed to be the navigation/sidebar
  userNav = document.getElementsByTagName("body")[0].firstChild;


  // --------------------------------------------------------------------------
  // 3b. CSS INJECTED INTO GEMINI PAGE
  // --------------------------------------------------------------------------
  // Injected via this.shared.injectCSS() in init()
  // These styles create the PromptForge UI overlay within Gemini's DOM
  
  INJECTED_CSS = `
    body {
      transition: padding 0.25s, margin 0.25s;
    }
    #pdFrame {
      /* box-shadow commented out */
    }
    #pdHeader {
      padding: 16px;
      font-size: 16px;
      font-family: Google Sans,Helvetica Neue,sans-serif;
      font-weight: 500;
      margin-bottom: 16px;
      background-color: #131314;
      border-radius: 8px;
    }
    #pdHeader a {
      color: #5687F6;
      text-decoration: none;
      font-weight: 500;
      transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
    }
    #pdHeader a:hover { color: #fff; }
    #pdHeader small { font-weight: 100; }
    
    .pd-open #pdDraggerIcon { display: block !important; }
    
    .pd-wrapper {
      container-type: inline-size;
      width: 100%;
      padding-right: 16px;
    }
    .pd-selector-container {
      display: flex;
      flex-direction: row;
      justify-content: center;
      flex-grow: 1;
      gap: 12px;
      padding: 12px 14px;
    }
    .pd-selector {
      background-color: rgb(45, 45, 46);
      color: #BEC1C6;
      font-size: 15px;
      border-radius: 24px;
      border: 1px solid rgb(45, 45, 46);
      max-width: 158px;
      padding: 12px 26px;
      appearance: none;
      background-image: url("data:image/svg+xml;..."); /* dropdown arrow */
      background-repeat: no-repeat;
      background-position: right 1rem center;
      background-size: 1em;
    }
    .light-theme .pd-selector {
      background-color: #F0F3F8;
      color: #606368;
      border: 1px solid #F0F3F8;
      background-image: url("data:image/svg+xml;..."); /* black arrow */
    }
    .pd-s-reset {
      background-color: rgb(45, 45, 46);
      padding: 1px 10px 0 10px;
      border: 1px solid rgb(45, 45, 46);
      border-radius: 24px;
      cursor: pointer;
    }
    .pd-s-reset:hover { background-color: #5D5D67; }
    .light-theme .pd-s-reset {
      background-color: #F0F3F8;
      color: #606368;
      border: 1px solid #F0F3F8;
    }
    .pd-s-reset svg { stroke: white; opacity: 0.75; }
    .light-theme .pd-s-reset svg { stroke: #606368; opacity: 0.75; }
    .pd-s-continues { display: none; }
    .pd-spacer {}
    
    /* Submit button overlay */
    .pd-submit-btn {
      position: absolute;
      background: none;
      border: none;
      left: 0;
      top: 0;
      width: 48px;
      z-index: 100;
      height: 100%;
      cursor: pointer;
    }
    
    /* Export button */
    .pd-export-btn {
      position: relative;
      margin-right: 2px;
      width: 48px;
      height: 48px;
      border: none;
      padding: 3px 0 0 0.5px;
      background: linear-gradient(137.97deg, #7d72ff 19.03%, #0093fd 117.49%);
      border-radius: 50%;
      transition: all 0.3s;
      cursor: pointer;
    }
    .pd-export-btn::before {
      position: absolute;
      top: 1px; right: 0; bottom: 0; left: 0;
      opacity: 0;
      border-radius: 50%;
      transition: all 0.3s;
      content: '';
      background: linear-gradient(137.97deg, #b872ff 19.03%, #0056fd 117.49%);
      z-index: 2;
    }
    .pd-export-btn:hover::before,
    .pd-export-btn:focus::before { opacity: 1; }

    /* Responsive breakpoints */
    @container (max-width: 630px) {
      .pd-selector-container { flex-wrap: wrap; padding: 16px 0 0 0; }
    }
    @container (max-width: 385px) {
      .pd-selector-container { flex-direction: column; }
      .pd-selector { max-width: 100%; position: relative; width: 100%; }
    }
    @media screen and (max-width: 767px) {
      .pd-wrapper { padding: 0 10px; }
    }
  `;


  // --------------------------------------------------------------------------
  // 3c. GEMINI-SPECIFIC DOM SELECTORS
  // --------------------------------------------------------------------------
  // These are the CSS selectors / element references used to interact with
  // Gemini's UI. They are used across multiple methods.

  const GEMINI_SELECTORS = {
    // === ROOT / LAYOUT ===
    appRoot:        "chat-app",                    // <chat-app> element (main container)
    bodyFirst:      "body > :first-child",          // First child of body (userNav/sidebar)
    
    // === INPUT AREA ===
    inputArea:      ".input-area-container",        // Container for the text input area
    richTextarea:   "rich-textarea",                // Custom element wrapping the textarea
    textarea:       ".textarea",                    // The actual editable textarea element
    sendButton:     ".send-button",                 // Send/submit button
    sendButtonContainer: ".send-button-container",  // Container wrapping the send button
    
    // === CHAT / RESPONSE ===
    chatHistory:    ".chat-history",                // [1] — Second chat-history element (used for MutationObserver)
    modelResponse:  "model-response",               // Custom element for AI responses
    
    // === HEADER ===
    pageTitle:      "h2",                           // Page title element (target for header injection)
    
    // === UTILITY ===
    // Note: Gemini uses custom elements: <rich-textarea>, <model-response>, <chat-app>
  };


  // --------------------------------------------------------------------------
  // 3d. GEMINI-SPECIFIC METHODS
  // --------------------------------------------------------------------------

  /**
   * init() — Entry point for Gemini provider
   * Called when content script detects gemini.google.com
   * 
   * Flow:
   * 1. Injects CSS styles into <head>
   * 2. Adjusts body layout based on window width (<400px vs >=400px)
   * 3. Detects light-theme and sends setBackground message to iframe
   * 4. Sets up MutationObserver on document for URL changes
   * 5. Calls pageInit(null, "gemini")
   * 6. Cleans up stale localStorage prompt references
   */
  init() {
    // 1. Inject CSS
    this.shared.injectCSS(INJECTED_CSS);
    
    // 2. Adjust body layout
    if (window.innerWidth < 400) {
      this.body.style.cssText += "padding-top:68px;";
    } else {
      this.body.style.cssText += "margin-right: 84px;";
      this.userNav.style.cssText = "padding-right: 84px !important";
    }
    
    // 3. Theme detection
    if (document.getElementsByTagName("body")[0].classList.contains("light-theme")) {
      postMessageToFrame({ setBackground: "#fff" });
    }
    
    // 4. URL change observer
    let previousUrl = "";
    const observer = new MutationObserver(() => {
      if (location.href !== previousUrl) {
        previousUrl = location.href;
        this.shared.removeSelectors();
        const conversationId = document.location.href.split("/chat/").pop() || null;
        this.pageInit(conversationId, this.site);
      }
    });
    observer.observe(document, { subtree: true, childList: true });
    
    // 5. Initial page setup
    this.pageInit(null, this.site);
    
    // 6. Cleanup
    this.shared.cleanupPromptReferences();
  }

  /**
   * pageInit(conversationId, site, callback) — Per-page initialization
   * Called on initial load and every URL change
   * 
   * @param {string|null} conversationId — Extracted from URL: /chat/<id>
   * @param {string} site — Always "gemini" for this provider
   */
  pageInit(conversationId, site, callback = null) {
    this.shared.conversation_started = false;
    postMessageToFrame({ response: true });
    this.injectSelectors();
    this.injectExportBtns();
    
    // If there's a conversation ID, try to inject a saved prompt header
    if (conversationId) {
      const ref = this.shared.getPromptReference(conversationId);
      if (ref) this.injectHeader(site, ref);
    }
    
    if (callback) callback();
  }

  /**
   * adjustBody(isOpen, isTransitioning, appWidth) — Layout adjustment
   * Modifies <chat-app> padding/margin based on sidebar state
   * 
   * @param {boolean} isOpen — Whether PromptForge sidebar is open
   * @param {boolean} isTransitioning — Whether in transition
   * @param {number} appWidth — Width of the PromptForge panel (default: 440)
   */
  adjustBody(isOpen, isTransitioning = false, appWidth = 440) {
    const { xs, sm, lg } = this.shared.screenSizes();
    const minSpace = 900;
    
    if (window.innerWidth - appWidth < minSpace) {
      appWidth = window.innerWidth - minSpace;
    }
    
    if (isOpen) {
      if (lg) {
        this.body.style.paddingTop = "0px";
        this.body.style.marginRight = `${appWidth}px`;
      } else if (xs) {
        this.body.style.paddingTop = "68px";
        this.body.style.marginRight = "0px";
      } else {
        this.body.style.paddingTop = "0px";
        this.body.style.marginRight = "92px";
      }
    } else if (isTransitioning) {
      this.body.style.paddingTop = "0px";
      this.body.style.marginRight = "0px";
    } else if (xs) {
      this.body.style.paddingTop = "68px";
      this.body.style.marginRight = "0px";
    } else {
      this.body.style.paddingTop = "0px";
      this.body.style.marginRight = "84px";
    }
  }

  /**
   * injectSelectors() — Injects the prompt selector UI
   * Targets: .input-area-container (prepends selector container)
   * 
   * Flow:
   * 1. Waits for .input-area-container to appear
   * 2. Prepends selector container (lang, tone, style dropdowns + reset button)
   * 3. Creates .pd-submit-btn overlay button before send button
   * 4. Calls injectEventListeners()
   * 5. Sets up "continue" watcher
   */
  injectSelectors() {
    if (this.shared.settings?.hide_selectors) return;
    
    const getInputArea = () => document.getElementsByClassName("input-area-container")[0];
    
    this.shared.waitForElement(getInputArea, (elements) => {
      const selectorContainer = this.shared.selectors("gemini");
      elements.parentElement.prepend(selectorContainer);
      
      // Position send button container relatively
      const sendBtnContainer = document.getElementsByClassName("send-button-container")[0].children[0];
      if (sendBtnContainer.parentElement) {
        sendBtnContainer.parentElement.style.position = "relative";
      }
      
      // Create invisible submit overlay button
      const submitBtn = document.createElement("button");
      submitBtn.className = "pd-submit-btn";
      sendBtnContainer.before(submitBtn);
      
      this.injectEventListeners();
      
      // Watch for "continue with..." selector changes
      this.shared.selector.watchContinueChanges((value) => {
        const prompt = this.shared.resolveContinueType(value);
        const textarea = document.getElementsByClassName("textarea")[0];
        textarea.focus();
        textarea.innerText = prompt;
        
        // Dispatch input event
        const event = document.createEvent("HTMLEvents");
        event.initEvent("input", true, true);
        textarea.dispatchEvent(event);
        
        // Auto-click send
        setTimeout(() => {
          document.getElementsByClassName("send-button")[0].click();
        }, 100);
      });
    }, () => {
      this.shared.log("Selector target not found.");
    });
  }

  /**
   * injectEventListeners() — Attaches keyboard and click handlers
   * 
   * Key bindings:
   * - Enter (without Shift) on .textarea → submits prompt
   * - Click on .pd-submit-btn → submits prompt
   * 
   * Flow on submit:
   * 1. Modifies textarea content via injectSelectorChanges()
   * 2. Dispatches space keydown on <rich-textarea>
   * 3. Calls handleSubmission()
   * 4. Clicks .send-button after 500ms
   */
  injectEventListeners() {
    const richTextarea = document.getElementsByTagName("rich-textarea")[0];
    const textarea = document.getElementsByClassName("textarea")[0];
    const sendButton = document.getElementsByClassName("send-button")[0];
    const submitBtn = document.getElementsByClassName("pd-submit-btn")[0];
    
    const keydownHandler = (e) => {
      const target = e.target;
      if (e.key === "Enter" && !e.shiftKey && target === textarea) {
        e.preventDefault();
        textarea.innerText = this.shared.injectSelectorChanges(textarea.innerText);
        this.handleSubmission(sendButton);
        return false;
      }
    };
    
    richTextarea.removeEventListener("keydown", keydownHandler);
    richTextarea.addEventListener("keydown", keydownHandler, true);
    
    submitBtn.onclick = (e) => {
      textarea.innerText = this.shared.injectSelectorChanges(textarea.innerText);
      richTextarea.dispatchEvent(new KeyboardEvent("keydown", { key: "space" }));
      this.handleSubmission(sendButton);
      setTimeout(() => { sendButton.click(); }, 500);
    };
  }

  /**
   * injectPrompt(messageEvent) — Injects a prompt from the iframe
   * Called when the PromptForge sidebar sends an inject command
   * 
   * @param {MessageEvent} e — Contains e.data.inject.text
   */
  injectPrompt(e) {
    const textarea = document.getElementsByClassName("textarea")[0];
    textarea.focus();
    textarea.innerText = this.shared.injectSelectorChanges(e.data.inject.text);
    
    // Dispatch input event to trigger Gemini's internal handlers
    const event = document.createEvent("HTMLEvents");
    event.initEvent("input", true, true);
    textarea.dispatchEvent(event);
    
    // Trigger submit
    const submitBtn = document.getElementsByClassName("pd-submit-btn")[0];
    submitBtn.click();
    this.handleSubmission(submitBtn, e, true);
  }

  /**
   * injectExportBtns() — Adds export buttons to each message
   * Target: .button-gutter elements (containers for message action buttons)
   * 
   * Flow:
   * 1. Waits for .button-gutter elements
   * 2. For each gutter, adds an export button if not already present
   * 3. Export button onclick → extracts previous sibling's text → posts to frame
   */
  injectExportBtns() {
    const getButtonGutters = () => document.getElementsByClassName("button-gutter");
    
    this.shared.waitForElement(getButtonGutters, (gutters) => {
      for (let i = 0; i < gutters.length; i++) {
        const lastChild = gutters[i].lastChild;
        if (!lastChild || lastChild.className !== "pd-export-btn") {
          const btn = this.shared.exportBtns();
          btn.onclick = function(e) {
            let text;
            if (this && this.parentElement && this.parentElement.previousSibling) {
              text = this.parentElement.previousSibling.innerText;
            }
            if (text) {
              postMessageToFrame({ create: true, text: text });
            }
          };
          gutters[i].appendChild(btn);
          gutters[i].style.flexDirection = "row";
          gutters[i].style.gap = "4px";
        }
      }
      this.shared.injectContiueBtn();
    }, () => {
      this.shared.log("Export button target not found.");
    });
  }

  /**
   * handleSubmission(sendButton, messageEvent, isInject) — Monitors submission
   * Uses MutationObserver on .chat-history[1] to detect new model-response elements
   * 
   * @param {Element} sendButton — The send button element
   * @param {MessageEvent|null} messageEvent — Original inject event (if from injectPrompt)
   * @param {boolean} isInject — Whether this was triggered by injectPrompt
   */
  handleSubmission(sendButton, messageEvent = null, isInject = false) {
    const chatHistory = document.getElementsByClassName("chat-history")[1];
    const mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0 && 
            mutation.addedNodes[0].localName === "model-response") {
          
          mutationObserver.disconnect();
          
          // Inject header if this was an injected prompt
          if (messageEvent?.data?.inject) {
            this.injectHeader("gemini", messageEvent.data.inject);
          }
          
          // Capture conversation ID and store prompt reference
          if (isInject) {
            setTimeout(() => {
              const networkUrl = this.shared.captureNetworkRequest("%2Fchat%2F");
              const conversationId = networkUrl?.split("%2Fchat%2F").pop();
              if (conversationId) {
                const ref = messageEvent.data.inject;
                ref.expiry = Date.now() + (1000 * 60 * 60 * 24 * 90); // 90 days
                delete ref.text;
                localStorage.setItem(
                  "pd_id_" + conversationId.split("&").shift(),
                  JSON.stringify(ref)
                );
              }
            }, 2500);
          }
          
          this.shared.injectContiueBtn();
          this.injectExportBtns();
          postMessageToFrame({ response: true });
        }
      }
    });
    
    mutationObserver.observe(chatHistory, {
      attributes: true,
      childList: true,
      subtree: true
    });
  }

  /**
   * injectHeader(site, data) — Injects prompt attribution header
   * Target: <h2> element (page title)
   * 
   * Creates a div#pdHeader with prompt title, author, and link
   * Inserted before the first <h2> on the page
   */
  injectHeader(site, data) {
    const getH2 = () => document.getElementsByTagName("h2")[0];
    
    if (document.getElementById("pdHeader")) return;
    
    this.shared.waitForElement(getH2, (h2) => {
      const header = document.createElement("div");
      header.id = "pdHeader";
      header.innerHTML = this.shared.header.createHeader(site, data);
      h2.before(header);
      this.shared.header.setLinkEvents();
    }, () => {
      this.shared.log("Header target not found.");
    });
  }
}


// ============================================================================
// 4. CROSS-FRAME MESSAGE CONTRACT (Gemini-specific)
// ============================================================================
// The extension communicates with an iframe (PromptForge sidebar) via
// window.frame.postMessage() and window.addEventListener("message", ...).
// 
// Helper function: g(frame, data) → frame.contentWindow.postMessage(data, "*")
// Listener: Q(callback) → window.addEventListener("message", callback)

const OUTGOING_MESSAGES_TO_IFRAME = {
  // Sent on pageInit — signals page is ready
  response: { response: true },
  
  // Sent when Gemini is in light theme
  setBackground: { setBackground: "#fff" },
  
  // Sent when export button is clicked
  create: { create: true, text: "<extracted response text>" },
  
  // Sent when selector values change (lang/tone/style/extender)
  selector: { selector: "lang|tone|style|extender", value: "<selected value>" },
  
  // Sent on submission completion
  response_after_submit: { response: true },
  
  // Sent when app size changes (from dragger)
  appSize: { appSize: { width: <number>, dragger: "<css right value>" } },
  
  // Sent on resize
  resize: { resize: { width: <number>, height: <number> } },
  
  // Sent when ?forge= query param is present
  navigate: { navigate: "/prompt/<promptId>" }
};

const INCOMING_MESSAGES_FROM_IFRAME = {
  // Inject a prompt into the textarea and submit
  inject: {
    data: { inject: { text: "<prompt text>", title: "...", slug: "...", username: "..." } }
  },
  
  // Update settings from iframe
  ready: { data: { ready: { hide_selectors: bool, paid_plan: bool, custom_lang: [], ... } } },
  
  // Logout — clear settings
  logout: { data: { logout: true } },
  
  // Open/close sidebar
  open: { data: { open: true|false } },
  
  // Resize sidebar
  resize: { data: { resize: { width, height } } },
  
  // Set app width
  setAppWidth: { data: { setAppWidth: { width, dragger } } },
  
  // Selector value changed
  selector: { data: { selector: "lang|tone|style|extender", value: "..." } },
  
  // Get active GPT (not applicable to Gemini, but handler exists)
  getActiveGPT: { data: { getActiveGPT: true } }
};


// ============================================================================
// 5. LOCALSTORAGE KEY SCHEMA
// ============================================================================

const LOCALSTORAGE_KEYS = {
  // Prompt reference storage
  // Key: "pd_id_<conversationId>"
  // Value: JSON object with prompt metadata (title, slug, username, expiry)
  // Expiry: 90 days from creation
  promptReference: "pd_id_{conversationId}",
  
  // DOM selectors cache (shared across providers)
  domSelectors: "dom_selectors_cache",
  domSelectorsTimestamp: "dom_selectors_timestamp"
};


// ============================================================================
// 6. NETWORK ENDPOINTS ACCESSED
// ============================================================================

const NETWORK_ENDPOINTS = {
  // Selector definitions — fetched once, cached for 4 hours
  selectors_api: {
    url: "https://api.promptden.com/v1/selectors",
    method: "GET",
    purpose: "Fetch DOM selector definitions for all providers",
    caching: "localStorage, 4-hour TTL"
  },
  
  // Conversation title generation — captured via Performance API
  // This is NOT directly called by the extension; it's observed
  gen_title: {
    pattern: "/gen_title",  // ChatGPT-specific, not Gemini
    capture_method: "performance.getEntriesByType('resource')"
  },
  
  // Gemini chat URL pattern — observed for conversation ID capture
  gemini_chat: {
    pattern: "%2Fchat%2F",  // URL-encoded "/chat/"
    purpose: "Extract conversation ID from network request URL"
  }
};


// ============================================================================
// 7. MUTATIONOBSERVER TARGETS (Gemini-specific)
// ============================================================================

const MUTATION_OBSERVERS = {
  // 1. URL Change Detector (in init())
  urlChange: {
    target: document,
    options: { subtree: true, childList: true },
    trigger: "location.href change",
    action: "Remove selectors, call pageInit with new conversation ID"
  },
  
  // 2. Submission Detector (in handleSubmission())
  submission: {
    target: document.getElementsByClassName("chat-history")[1],
    options: { attributes: true, childList: true, subtree: true },
    trigger: "New <model-response> element added",
    action: "Disconnect observer, inject header, store prompt ref, inject export btns"
  }
};


// ============================================================================
// 8. GEMINI CUSTOM ELEMENTS IDENTIFIED
// ============================================================================
// Gemini uses several custom HTML elements that the extension interacts with:

const GEMINI_CUSTOM_ELEMENTS = {
  "chat-app":        "Root application container — used as body reference for layout",
  "rich-textarea":   "Custom textarea wrapper — keydown events attached here",
  "model-response":  "AI response container — used to detect when response is complete"
};


// ============================================================================
// 9. EVENT HANDLERS ATTACHED TO GEMINI DOM
// ============================================================================

const EVENT_HANDLERS = {
  // On <rich-textarea>
  richTextarea_keydown: {
    element: "rich-textarea",
    event: "keydown",
    capture: true,  // useCapture = true
    handler: "Intercepts Enter key, injects selector changes, triggers submission"
  },
  
  // On .pd-submit-btn (invisible overlay)
  submitBtn_click: {
    element: ".pd-submit-btn",
    event: "click",
    handler: "Injects selector changes, dispatches space keydown, triggers submission"
  },
  
  // On selector dropdowns
  lang_change: {
    element: ".pd-s-langs",
    event: "change",
    handler: "Posts {selector: 'lang', value: ...} to iframe"
  },
  tone_change: {
    element: ".pd-s-tones",
    event: "change",
    handler: "Posts {selector: 'tone', value: ...} to iframe"
  },
  style_change: {
    element: ".pd-s-styles",
    event: "change",
    handler: "Posts {selector: 'style', value: ...} to iframe"
  },
  extender_change: {
    element: ".pd-s-extender",
    event: "change",
    handler: "Posts {selector: 'extender', value: ...} to iframe"
  },
  
  // On reset button
  reset_click: {
    element: ".pd-s-reset",
    event: "click",
    handler: "Resets all selectors to empty, posts 'Default' values to iframe"
  },
  
  // On continue selector (hidden input)
  continue_change: {
    element: ".pd-s-continues",
    event: "change",
    handler: "Resolves continue type to prompt text, inserts into textarea, auto-sends"
  },
  
  // On export buttons
  exportBtn_click: {
    element: ".pd-export-btn",
    event: "click",
    handler: "Extracts previous sibling text, posts {create: true, text: ...} to iframe"
  },
  
  // On prompt link in header
  promptLink_click: {
    element: "#pd_prompt_link",
    event: "click",
    handler: "Prevents default, posts {navigate: '/prompt/<slug>'} to iframe"
  }
};


// ============================================================================
// 10. SELECTOR DROPDOWN OPTIONS (Gemini-specific)
// ============================================================================
// Gemini gets a REDUCED set of language options compared to ChatGPT.

const GEMINI_LANGUAGE_OPTIONS = [
  "English",
  "French (Français)",
  "Spanish (Español)",
  "--------",  // Separator (disabled)
  "Arabic (العربية)",
  "Bengali (বাংলা)",
  "Bulgarian (Български език)",
  "Chinese (中文)",
  "Chinese - Traditional (繁體中文)",
  "Croatian (Hrvatski jezik)",
  "Czech (Čeština)",
  "Danish (Dansk)",
  "Dutch (Nederlands)",
  "Estonian (Eesti keel)",
  "Finnish (Suomi)",
  "German (Deutsch)",
  "Greek (Ελληνικά)",
  "Gujarati (ગુજરાતી)",
  "Hebrew (עברית)",
  "Hindi (हिन्दी)",
  "Hungarian (Magyar)",
  "Indonesian (Bahasa Indonesia)",
  "Italian (Italiano)",
  "Japanese (日本語)",
  "Korean (한국어)",
  "Latvian (Latviešu valoda)",
  "Lithuanian (Lietuvių kalba)",
  "Malayalam (മലയാളം)",
  "Marathi (मराठी)",
  "Norwegian (Norsk)",
  "Polish (Polski)",
  "Portuguese (Português)",
  "Romanian (Română)",
  "Russian (Русский)",
  "Serbian (Српски језик)",
  "Slovak (Slovenčina)",
  "Slovenian (Slovenščina)",
  "Swahili (Kiswahili)",
  "Swedish (Svenska)",
  "Tamil (தமிழ்)",
  "Telugu (తెలుగు)",
  "Thai (ไทย)",
  "Turkish (Türkçe)",
  "Ukrainian (Українська)",
  "Urdu (اردو)",
  "Vietnamese (Tiếng Việt)"
];
// Total: 45 languages (+ 1 separator)
// ChatGPT gets 90+ languages — Gemini has a reduced set


const TONE_OPTIONS = [
  "Sympathetic",
  "Upgrade for 30+ more"  // Disabled unless paid plan
];
// Free users see only "Sympathetic" + upsell
// Paid users see full 30-tone list (Analytical, Authoritative, Clinical, etc.)


const STYLE_OPTIONS = [
  "Comedic",
  "Upgrade for 60+ more"  // Disabled unless paid plan
];
// Free users see only "Comedic" + upsell
// Paid users see full 60+ style list (Academic, Adventure, etc.)


// ============================================================================
// 11. PROMPT INJECTION TRANSFORMS
// ============================================================================
// When selectors are active, the extension modifies the user's prompt
// before submission by appending modifier phrases.

const PROMPT_TRANSFORMS = {
  // Language injection
  lang: (text, lang) => {
    if (!text.includes("Respond only in")) {
      text += `  Respond only in ${lang} language.`;
    }
    return text;
  },
  
  // Tone injection
  tone: (text, tone) => {
    if (!text.includes("Write only in a")) {
      text += `  Write only in a ${tone} tone.`;
    }
    return text;
  },
  
  // Style injection
  style: (text, style) => {
    if (!text.includes("Write in a")) {
      text += `  Write in a ${style} style.`;
    }
    return text;
  },
  
  // "Continue with..." transforms — full mapping
  continue: {
    "Address potential counterarguments": "Please address potential counterarguments.",
    "Analyze": "Analyze your last response.",
    "Argue": "Please argue your last response.",
    "Clarify": "Can you please clarify your last response.",
    "Compare": "Can you please compare your last response with the following.",
    "Contrast": "Can you please contrast your last response with the following.",
    "Critique": "Can you please critique your last response.",
    "Define": "Can you please define your last response.",
    "Demonstrate": "Can you please give me a demonstration of your last response.",
    "Distinguish": "Can you please distinguish your last response.",
    "Discuss": "Let's discuss your last response.",
    "Elaborate": "Can you please elaborate on your last response.",
    "Evaluate": "Can you please evaluate the following based on your last response.",
    "Exemplify": "Can you please exemplify your last response.",
    "Expand": "Can you please expand on your last response.",
    "Explain": "Can you please explain your last response.",
    "Explore further implications": "Can you please explore further implications of your last response.",
    "Highlight the key details": "Can you please highlight the key details of your last response.",
    "Illustrate": "Can you please give me an illustration of your last response.",
    "Interpret": "Can you please interpret your last response so that the following group or person can understand it better.",
    "Investigate": "Can you please investigate the following based on your last response.",
    "Justify": "Can you please justify your last response.",
    "Offer alternative solutions": "Can you please offer alternative solutions to your last response.",
    "Outline": "Can you please outline your last response.",
    "Present": "Can you please present your last response.",
    "Propose": "Can you please propose the following based on your last response.",
    "Provide additional information": "Can you please provide additional information about your last response.",
    "Provide an example": "Can you please provide an example of your last response.",
    "Provide context": "Can you please provide context for your last response.",
    "Refine": "Can you please refine your last response.",
    "Rewrite": "Can you please rewrite your last response.",
    "Shorten": "Can you please shorten your last response.",
    "Simplify": "Can you please simplify your last response.",
    "State the assumptions": "Can you please state the assumptions of your last response.",
    "Summarize": "Can you please summarize your last response.",
    "Support": "Can you please provide supporting details for your last response.",
    "Support with evidence": "Can you please provide supporting evidence for your last response.",
    "Verify": "Can you please verify your last response.",
    "Question": "What questions does your last response raise?"
  },
  
  // Prompt extenders (paid feature)
  extender: (text, extender) => {
    // prepend: added before user text
    // append: added after user text
    if (extender.prepend && !text.includes(extender.prepend)) {
      text = extender.prepend + "  " + text;
    }
    if (extender.append && !text.includes(extender.append)) {
      text += "  " + extender.append;
    }
    return text;
  }
};


// ============================================================================
// 12. HEADER TEMPLATE FOR GEMINI
// ============================================================================
// HTML template used for prompt attribution header

const GEMINI_HEADER_TEMPLATE = `
  <div style="display: flex; gap: 14px;">
    <div>
      <div style="width: 36px; height: 36px; margin-top: 2px;">
        <img src="https://cdn.promptden.com/static/mark.svg" 
             style="width: 36px; height: 36px;" />
      </div>
    </div>
    <div style="display: flex; flex-direction: column; gap: 8px;">
      <span>
        <a href="#{data.slug}" id="pd_prompt_link">{data.title}</a>
      </span>
      <small>
        By <a href="https://promptden.com/profile/{data.username}" 
              target="_blank">@{data.username}</a>
      </small>
    </div>
  </div>
`;
// Template variables: {data.slug}, {data.title}, {data.username}
// Replaced via regex: /{data.([^}]+)}/g


// ============================================================================
// 13. CSP MODIFICATION (Declarative Net Request)
// ============================================================================
// NOTE: The CSP rule in csp.json only targets chatgpt.com, NOT gemini.google.com
// So Gemini's CSP is NOT modified by this extension.

const CSP_RULE = {
  id: 1,
  priority: 1,
  action: {
    type: "modifyHeaders",
    responseHeaders: [{
      header: "Content-Security-Policy",
      operation: "remove"
    }]
  },
  condition: {
    urlFilter: "https://chatgpt.com/*",  // ← NOT Gemini
    resourceTypes: ["main_frame"]
  }
};


// ============================================================================
// 14. URL PATTERN FOR CONVERSATION ID EXTRACTION
// ============================================================================

const URL_PATTERNS = {
  // Gemini conversation URL format
  conversation: "https://gemini.google.com/chat/<conversationId>",
  
  // Extraction method
  extract: "document.location.href.split('/chat/').pop()",
  
  // Network request pattern for ID capture (URL-encoded)
  networkPattern: "%2Fchat%2F",
  extractFromNetwork: "url.split('%2Fchat%2F').pop().split('&').shift()"
};


// ============================================================================
// 15. THEME DETECTION
// ============================================================================

const THEME_DETECTION = {
  // Method: Check classList on <body>
  selector: "body",
  lightThemeClass: "light-theme",
  detection: 'document.getElementsByTagName("body")[0].classList.contains("light-theme")',
  
  // Actions based on theme
  light: { setBackground: "#fff" },   // White background for iframe
  dark:  { /* no message sent — iframe defaults to dark */ }
};


// ============================================================================
// 16. COMPLETE DOM INTERACTION SUMMARY
// ============================================================================

/**
 * GEMINI DOM INTERACTION MAP
 * ==========================
 * 
 * ELEMENTS CREATED BY EXTENSION:
 * ┌─────────────────────────┬──────────────────────────────────────────────┐
 * │ Element                 │ Insertion Point                              │
 * ├─────────────────────────┼──────────────────────────────────────────────┤
 * │ .pd-wrapper             │ Inside .input-area-container                 │
 * │ .pd-selector-container  │ Prepended to .input-area-container parent    │
 * │ .pd-s-langs (select)    │ Inside .pd-selector-container                │
 * │ .pd-s-tones (select)    │ Inside .pd-selector-container                │
 * │ .pd-s-styles (select)   │ Inside .pd-selector-container                │
 * │ .pd-s-reset (button)    │ Inside .pd-selector-container                │
 * │ .pd-spacer (div)        │ Inside .pd-selector-container                │
 * │ .pd-s-continues (input) │ Inside .pd-selector-container                │
 * │ .pd-s-extender (select) │ Inside .pd-selector-container                │
 * │ .pd-submit-btn (button) │ Before send button in .send-button-container │
 * │ .pd-export-btn (button) │ Appended to each .button-gutter              │
 * │ #pdHeader (div)         │ Before first <h2> element                    │
 * │ <style>                 │ Appended to <head>                           │
 * └─────────────────────────┴──────────────────────────────────────────────┘
 * 
 * ELEMENTS MODIFIED BY EXTENSION:
 * ┌─────────────────────────────────┬──────────────────────────────────────┐
 * │ Element                         │ Modification                         │
 * ├─────────────────────────────────┼──────────────────────────────────────┤
 * │ <chat-app>                      │ style.paddingTop, style.marginRight  │
 * │ body > :first-child (userNav)   │ style.paddingRight = "84px"          │
 * │ .send-button-container [0]      │ parent.style.position = "relative"   │
 * │ <rich-textarea>                 │ addEventListener("keydown")          │
 * │ .textarea                       │ .innerText modified, input dispatched│
 * │ .button-gutter (each)           │ style.flexDirection, style.gap       │
 * └─────────────────────────────────┴──────────────────────────────────────┘
 * 
 * ELEMENTS READ/QUERIED BY EXTENSION:
 * ┌─────────────────────────────────┬──────────────────────────────────────┐
 * │ Element                         │ Purpose                              │
 * ├─────────────────────────────────┼──────────────────────────────────────┤
 * │ <chat-app>                      │ Root container for layout adjustments│
 * │ body > :first-child             │ User nav/sidebar reference           │
 * │ body                            │ Theme detection (light-theme class)  │
 * │ .input-area-container           │ Target for selector injection        │
 * │ .textarea                       │ Read/write prompt text               │
 * │ rich-textarea                   │ Keyboard event target                │
 * │ .send-button                    │ Programmatic click to submit         │
 * │ .send-button-container          │ Position context for submit overlay  │
 * │ .chat-history[1]                │ MutationObserver target for response │
 * │ model-response                  │ Detection of response completion     │
 * │ h2                              │ Target for header injection          │
 * │ .button-gutter                  │ Target for export button injection   │
 * │ performance.getEntriesByType()  │ Capture network request URLs         │
 * │ localStorage                    │ Prompt reference storage             │
 * └─────────────────────────────────┴──────────────────────────────────────┘
 */


// ============================================================================
// 17. WHAT THIS EXTENSION DOES NOT DO WITH GEMINI
// ============================================================================
// Important limitations / things NOT present in the code:

const NOT_IMPLEMENTED = [
  "No direct API calls to Gemini's API (all interaction is via DOM manipulation)",
  "No interception of Gemini network requests (no fetch/XMLHttpRequest interception)",
  "No access to Gemini's internal JavaScript objects or window properties",
  "No CSP modification for gemini.google.com (only chatgpt.com has CSP removed)",
  "No access to Gemini's conversation history beyond DOM-visible content",
  "No modification of Gemini's response content (only prompt text is modified)",
  "No WebSocket or Server-Sent Event interception",
  "No access to Gemini's authentication tokens or session cookies",
  "No programmatic creation of new conversations (relies on user navigation)",
  "No detection of Gemini model selection (Pro, Flash, etc.)"
];


// ============================================================================
// END OF EXTRACTION
// ============================================================================
// File generated from analysis of:
// - aboegngdamkgaolhddiblkllbldjhlai/manifest.json
// - aboegngdamkgaolhddiblkllbldjhlai/assets/chunk-dab8ec86.js (599 lines)
// - aboegngdamkgaolhddiblkllbldjhlai/assets/chunk-976934f5.js (background worker)
// - aboegngdamkgaolhddiblkllbldjhlai/src/rules/csp.json
// - aboegngdamkgaolhddiblkllbldjhlai/src/scripts/window.js
// - aboegngdamkgaolhddiblkllbldjhlai/service-worker-loader.js
// - aboegngdamkgaolhddiblkllbldjhlai/assets/index.ts-loader.44f58e71.js
// ============================================================================
