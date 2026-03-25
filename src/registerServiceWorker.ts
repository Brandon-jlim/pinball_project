function getServiceWorkerUrl() {
  const pathname = window.location.pathname;
  const hasFileName = /\/[^/]+\.[^/]+$/.test(pathname);

  let basePath = pathname;
  if (hasFileName) {
    basePath = pathname.slice(0, pathname.lastIndexOf('/') + 1);
  } else if (!pathname.endsWith('/')) {
    basePath = `${pathname}/`;
  }

  return new URL('service-worker.js', `${window.location.origin}${basePath}`).toString();
}

export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      const swUrl = getServiceWorkerUrl();
      navigator.serviceWorker
        .register(swUrl)
        .then((reg) => console.log('service worker registered', reg.scope))
        .catch((err) => console.error('service worker registration failed', err));
    });
  }
}
