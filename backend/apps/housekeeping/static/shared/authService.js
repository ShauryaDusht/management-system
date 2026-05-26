(function () {
  const DEFAULT_LOGOUT_URL = '/portal/logout/';
  const DEFAULT_REDIRECT_URL = '/portal/login/';

  function getCSRFToken() {
    const name = 'csrftoken';
    const cookies = document.cookie ? document.cookie.split(';') : [];

    for (const cookie of cookies) {
      const [key, ...parts] = cookie.trim().split('=');
      if (key === name) {
        return decodeURIComponent(parts.join('='));
      }
    }

    return '';
  }

  async function performLogout(options = {}) {
    const logoutUrl = options.logoutUrl || DEFAULT_LOGOUT_URL;
    const redirectUrl = options.redirectUrl || DEFAULT_REDIRECT_URL;
    const csrftoken = options.csrfToken || getCSRFToken();

    const response = await fetch(logoutUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'X-CSRFToken': csrftoken,
        'X-Requested-With': 'XMLHttpRequest',
      },
      credentials: 'include',
      redirect: 'manual',
    });

    if (!response.ok) {
      throw new Error(`Logout failed with status ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const payload = await response.json();
      window.location.assign(payload.redirect_url || redirectUrl);
      return;
    }

    window.location.assign(redirectUrl);
  }

  async function logoutUser(options = {}) {
    try {
      await performLogout(options);
    } catch (error) {
      console.error('Logout request failed.', error);
      window.alert('Logout failed. Please refresh the page and try again.');
    }
  }

  function bindLogoutForms() {
    document.querySelectorAll('[data-logout-form]').forEach((form) => {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const submitButton = form.querySelector('[type="submit"]');
        if (submitButton) {
          submitButton.disabled = true;
        }

        await logoutUser({
          logoutUrl: form.action || DEFAULT_LOGOUT_URL,
          redirectUrl: form.dataset.redirectUrl || DEFAULT_REDIRECT_URL,
          csrfToken: form.querySelector('[name="csrfmiddlewaretoken"]')?.value,
        });

        if (submitButton) {
          submitButton.disabled = false;
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindLogoutForms);
  } else {
    bindLogoutForms();
  }

  window.getCSRFToken = getCSRFToken;
  window.logoutUser = logoutUser;
  window.authService = {
    getCSRFToken,
    logoutUser,
  };
})();
