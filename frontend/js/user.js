// KoloCircle - User Management System
class UserManager {
  constructor() {
    this.apiBaseUrl = 'http://localhost:3000/api/auth';
    this.storageKey = 'currentUser';
  }

  /**
   * Register a new user
   */
  async register(userData) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Registration failed');
      }

      const data = await response.json();
      if (data.user && data.token) {
        data.user.token = data.token;
      }
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Login user with phone and password
   */
  async login(phone, password) {
    try {
      const response = await fetch(`${this.apiBaseUrl}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Login failed');
      }

      const data = await response.json();
      if (data.user && data.token) {
        data.user.token = data.token;
      }
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Login user with phone and password
   */
  getToken() {
    const currentUser = this.getCurrentUser();
    return currentUser?.token || null;
  }

  /**
   * Fetch user data from database by ID
   */
  async fetchFromDatabase() {
    try {
      const token = this.getToken();
      if (!token) {
        return null;
      }

      const response = await fetch(`${this.apiBaseUrl}/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return data.user || null;
    } catch (error) {
      console.error('Failed to fetch user from database:', error);
      return null;
    }
  }

  /**
   * Save user to localStorage
   */
  saveToLocalStorage(userData) {
    localStorage.setItem(this.storageKey, JSON.stringify(userData));
  }

  /**
   * Get current user from localStorage
   */
  getCurrentUser() {
    try {
      const userData = localStorage.getItem(this.storageKey);
      return userData ? JSON.parse(userData) : null;
    } catch (error) {
      console.error('Failed to parse user data from localStorage:', error);
      return null;
    }
  }

  /**
   * Get full user data (from localStorage, then from database if ID exists)
   */
  async getFullUserData() {
    const currentUser = this.getCurrentUser();
    
    if (!currentUser) {
      return null;
    }

    // If we have an ID, fetch fresh data from database
    if (currentUser.id) {
      const dbUser = await this.fetchFromDatabase(currentUser.id);
      if (dbUser) {
        return { ...currentUser, ...dbUser };
      }
    }

    return currentUser;
  }

  /**
   * Clear user session (logout)
   */
  logout() {
    localStorage.removeItem(this.storageKey);
  }

  /**
   * Check if user is logged in
   */
  isLoggedIn() {
    return this.getCurrentUser() !== null;
  }

  /**
   * Get user display name
   */
  async getDisplayName() {
    const user = await this.getFullUserData();
    if (!user) return 'there';
    return user.full_name || user.name || 'there';
  }

  /**
   * Get user initials
   */
  async getInitials() {
    const displayName = await this.getDisplayName();
    return displayName
      .split(' ')
      .filter(Boolean)
      .map(part => part[0].toUpperCase())
      .slice(0, 2)
      .join('');
  }

  /**
   * Get user location (town, region)
   */
  async getLocation() {
    const user = await this.getFullUserData();
    if (!user) return '';
    
    const town = user.town || user.city || '';
    const region = user.region || user.state || '';
    
    if (town && region) {
      return `${town}, ${region}`;
    }
    return town || region || '';
  }
}

// Export for use in other scripts
const userManager = new UserManager();
