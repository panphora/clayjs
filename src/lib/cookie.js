// A sandboxed document (an iframe without allow-same-origin) throws a
// SecurityError on document.cookie. is-edit-mode.js reads a cookie at module
// scope, so an unguarded throw does not merely lose the cookie: it escapes the
// dynamic import the loader is awaiting and the document loses its client
// entirely. No cookies readable means no cookie, which is the honest answer.
function readCookies() {
  try {
    return document.cookie;
  } catch (err) {
    return '';
  }
}

// e.g. Cookie.get("isAdminOfCurrentResource")
function get (cookieName) {
  const cookies = readCookies().split('; ');
  const cookie = cookies.find(row => row.startsWith(`${cookieName}=`));
  if (!cookie) return null;
  const cookieValue = cookie.slice(cookieName.length + 1);
  try {
    return JSON.parse(decodeURIComponent(cookieValue));
  } catch (err) {
    return decodeURIComponent(cookieValue);
  }
}

// Writing document.cookie throws in a sandbox for the same reason reading it
// does, and there is nothing to clear there anyway.
function writeCookie(value) {
  try {
    document.cookie = value;
  } catch (err) {
    // Sandboxed: no cookie jar to clear.
  }
}

// e.g. Cookie.remove("isAdminOfCurrentResource")
function remove(name) {
  // Clear from current path
  writeCookie(`${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;`)

  // Clear from current domain
  writeCookie(`${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${window.location.hostname};`)

  // Clear from apex domain (e.g., .hyperclay.com or .localhyperclay.com)
  const hostname = window.location.hostname;
  if (hostname.includes('.')) {
    // Get the last two parts for the apex domain (handles .com, .co.uk, etc)
    const parts = hostname.split('.');
    const apexDomain = '.' + parts.slice(-2).join('.');
    writeCookie(`${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${apexDomain};`)
  }
}

const cookie = {
  get,
  remove
};

export default cookie;
