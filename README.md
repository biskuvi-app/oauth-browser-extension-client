# @biskuvi-app/oauth-browser-extension-client  

Fork of [@atcute/oauth-browser-client](https://github.com/biskuvi-app/atcute/tree/trunk/packages/oauth/browser-client) to support browser extensions  

Changes:  
 - `localStorage` -> `chrome.storage.local` (for Chromium) / `browser.storage.local` (for Firefox)  
 - `localStorage.getItem(<key>)` -> `async storage.getItem([<key>])`  

References:
 - https://developer.chrome.com/docs/extensions/reference/api/storage  
 - https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/local  
