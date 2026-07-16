/*
  Lazy-load vendor scripts in edit mode only

  Injects a <script clay="no-save no-watch"> tag that loads the vendor script.
  The clay no-save token ensures it's stripped when the page is saved.

  Usage:
    import { loadVendorScript } from '../lib/load-vendor-script.js';

    // Load and get global
    const Sortable = await loadVendorScript(url, 'Sortable');

    // Just load (no return value needed)
    loadVendorScript(url);
*/

/**
 * Load a vendor script via script tag with clay no-save
 * @param {string} url - URL to the vendor script
 * @param {Object} [options] - Options
 * @param {string} [options.globalName] - Window property to return when loaded (for classic scripts)
 * @param {boolean} [options.module] - Set true for ES modules (type="module")
 * @returns {Promise<any>} Resolves with window[globalName] or undefined
 */
export function loadVendorScript(url, options = {}) {
  // Support legacy signature: loadVendorScript(url, globalName)
  if (typeof options === 'string') {
    options = { globalName: options };
  }

  const { globalName, module: isModule } = options;

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.setAttribute("clay", "no-save no-watch");
    if (isModule) {
      script.type = 'module';
    }
    script.onload = () => resolve(globalName ? window[globalName] : undefined);
    script.onerror = () => reject(new Error(`Failed to load vendor script: ${url}`));
    document.head.appendChild(script);
  });
}

/**
 * Get vendor URL relative to a module's location
 * @param {string} importMetaUrl - import.meta.url of the calling module
 * @param {string} vendorFile - Filename of the vendor script
 * @returns {string} Full URL to vendor script
 */
export function getVendorUrl(importMetaUrl, vendorFile) {
  const baseUrl = importMetaUrl.substring(0, importMetaUrl.lastIndexOf('/'));
  return `${baseUrl}/${vendorFile}`;
}

export default loadVendorScript;
