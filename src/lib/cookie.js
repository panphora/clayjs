// e.g. Cookie.get("isAdminOfCurrentResource")
function get (cookieName) {
  const cookies = document.cookie.split('; ');
  const cookie = cookies.find(row => row.startsWith(`${cookieName}=`));
  if (!cookie) return null;
  const cookieValue = cookie.slice(cookieName.length + 1);
  try {
    return JSON.parse(decodeURIComponent(cookieValue));
  } catch (err) {
    return decodeURIComponent(cookieValue);
  }
}

// e.g. Cookie.remove("isAdminOfCurrentResource")
function remove(name) {
  // Clear from current path
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;`

  // Clear from current domain
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${window.location.hostname};`

  // Clear from apex domain (e.g., .hyperclay.com or .localhyperclay.com)
  const hostname = window.location.hostname;
  if (hostname.includes('.')) {
    // Get the last two parts for the apex domain (handles .com, .co.uk, etc)
    const parts = hostname.split('.');
    const apexDomain = '.' + parts.slice(-2).join('.');
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${apexDomain};`
  }
}

const cookie = {
  get,
  remove
};

export default cookie;
