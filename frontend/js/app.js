// KoloCircle - Shared Application JavaScript
document.addEventListener('DOMContentLoaded', async () => {
  /**
   * Initialize all UI components and user data on page load
   */
  async function initializeApp() {
    // Initialize mobile menu toggle
    initializeMobileMenu();

    // Initialize active navigation links
    setActiveNavLink();

    // Initialize FAQ accordions
    initializeFAQAccordion();

    // Initialize tabs
    initializeTabs();

    // Initialize balance visibility toggle
    initializeBalanceToggle();

    // Set current year in footer
    updateYear();

    // Load and display user data
    await loadAndDisplayUserData();
  }

  /**
   * Initialize mobile menu toggle functionality
   */
  function initializeMobileMenu() {
    const menuBtn = document.querySelector('.menu-btn');
    if (menuBtn) {
      menuBtn.addEventListener('click', () => {
        document.querySelector('.nav-links')?.classList.toggle('open');
        document.querySelector('.nav-cta')?.classList.toggle('open');
      });
    }
  }

  /**
   * Set active class on current navigation link
   */
  function setActiveNavLink() {
    const currentPath = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-links a').forEach(link => {
      if (link.getAttribute('href') === currentPath) {
        link.classList.add('active');
      }
    });
  }

  /**
   * Initialize FAQ accordion functionality
   */
  function initializeFAQAccordion() {
    document.querySelectorAll('.faq-q').forEach(question => {
      question.addEventListener('click', () => {
        question.parentElement.classList.toggle('open');
      });
    });
  }

  /**
   * Initialize tab functionality
   */
  function initializeTabs() {
    document.querySelectorAll('[data-tabs]').forEach(tabGroup => {
      const tabs = tabGroup.querySelectorAll('.tab');
      const panes = document.querySelectorAll(
        `[data-pane="${tabGroup.dataset.tabs}"] > [data-tab]`
      );

      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          tabs.forEach(t => t.classList.remove('active'));
          tab.classList.add('active');

          panes.forEach(pane => {
            pane.style.display = pane.dataset.tab === tab.dataset.tab ? '' : 'none';
          });
        });
      });
    });
  }

  /**
   * Initialize balance visibility toggle
   */
  function initializeBalanceToggle() {
    document.querySelectorAll('[data-toggle-balance]').forEach(button => {
      button.addEventListener('click', () => {
        document.querySelectorAll('[data-balance]').forEach(element => {
          if (element.dataset.original === undefined) {
            element.dataset.original = element.textContent;
          }
          element.textContent = element.textContent.includes('•')
            ? element.dataset.original
            : '•••••••';
        });
      });
    });
  }

  /**
   * Update year in footer
   */
  function updateYear() {
    document.querySelectorAll('[data-year]').forEach(element => {
      element.textContent = new Date().getFullYear();
    });
  }

  /**
   * Load user data and display it on the page
   */
  async function loadAndDisplayUserData() {
    try {
      const user = await userManager.getFullUserData();
      
      if (!user) {
        console.log('No user logged in');
        return;
      }

      // Get user display information
      const displayName = user.full_name || user.name || 'there';
      const initials = displayName
        .split(' ')
        .filter(Boolean)
        .map(part => part[0].toUpperCase())
        .slice(0, 2)
        .join('');

      const town = user.town || user.city || '';
      const region = user.region || user.state || '';
      const locationText = town && region ? `${town}, ${region}` : town || region || '';

      // Display user name in all places
      displayUserName(displayName);
      displayUserInitials(initials);
      displayUserLocation(locationText);

    } catch (error) {
      console.error('Error loading user data:', error);
    }
  }

  /**
   * Display user name in all elements with data-user-name, welcomeName, or profileName
   */
  function displayUserName(displayName) {
    document.querySelectorAll('[data-user-name]').forEach(el => {
      el.textContent = displayName;
    });
    document.querySelectorAll('#welcomeName').forEach(el => {
      el.textContent = displayName;
    });
    document.querySelectorAll('#profileName').forEach(el => {
      el.textContent = displayName;
    });
  }

  /**
   * Display user initials in profile avatar
   */
  function displayUserInitials(initials) {
    document.querySelectorAll('#profileInitials').forEach(el => {
      el.textContent = initials;
    });
  }

  /**
   * Display user location
   */
  function displayUserLocation(locationText) {
    document.querySelectorAll('#profileLocation').forEach(el => {
      if (locationText) {
        el.textContent = locationText;
      }
    });
  }

  /**
   * Handle logout
   */
  window.logout = function() {
    if (confirm('Are you sure you want to sign out?')) {
      userManager.logout();
      window.location.href = 'index.html';
    }
  };

  // Initialize the app
  await initializeApp();
});
