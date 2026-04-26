(function () {
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
    const logoutUrl = options.logoutUrl || '/logout/';
    const redirectUrl = options.redirectUrl || '/login/';
    const csrftoken = getCSRFToken();

    const response = await fetch(logoutUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrftoken,
      },
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Logout failed with status ${response.status}`);
    }

    window.location.href = redirectUrl;
  }

  async function logoutUser(options = {}) {
    try {
      await performLogout(options);
    } catch (error) {
      console.error('Logout request failed.', error);
      window.alert('Logout failed. Please refresh the page and try again.');
    }
  }

  window.getCSRFToken = getCSRFToken;
  window.logoutUser = logoutUser;
  window.authService = {
    getCSRFToken,
    logoutUser,
  };
})();
