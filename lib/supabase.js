/**
 * Supabase client for FocusDot Extension
 * Handles authentication and real-time synchronization
 * Uses fetch API to avoid CSP issues with external CDN imports
 */

import { SUPABASE_CONFIG, validateConfig } from "./config.js";

// Validate configuration
if (!validateConfig()) {
  throw new Error(
    "FocusDot: Invalid configuration. Please check lib/config.js"
  );
}

// Simple Supabase client using fetch API
class SupabaseClient {
  constructor(url, anonKey) {
    this.url = url;
    this.anonKey = anonKey;
    this.authToken = null;
  }

  // Get headers for API requests
  getHeaders() {
    const headers = {
      "Content-Type": "application/json",
      apikey: this.anonKey,
      Authorization: `Bearer ${this.authToken || this.anonKey}`,
    };
    return headers;
  }

  // Make API request
  async request(endpoint, options = {}) {
    const url = `${this.url}/rest/v1/${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Supabase API Error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  // Auth methods
  auth = {
    // Get current session from storage
    getSession: async () => {
      try {
        const result = await chrome.storage.local.get("supabase_session");
        const session = result.supabase_session;
        return { data: { session }, error: null };
      } catch (error) {
        return { data: { session: null }, error };
      }
    },

    // Get current user
    getUser: async () => {
      try {
        const {
          data: { session },
        } = await this.auth.getSession();
        return { data: { user: session?.user || null }, error: null };
      } catch (error) {
        return { data: { user: null }, error };
      }
    },

    // Sign out (clear session)
    signOut: async () => {
      try {
        await chrome.storage.local.remove("supabase_session");
        this.authToken = null;
        return { error: null };
      } catch (error) {
        return { error };
      }
    },
  };

  // Database operations
  from(table) {
    return new SupabaseTable(this, table);
  }
}

// Table operations class
class SupabaseTable {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this.query = {
      select: "*",
      filters: [],
      single: false,
    };
  }

  select(columns = "*") {
    this.query.select = columns;
    return this;
  }

  eq(column, value) {
    this.query.filters.push(`${column}=eq.${value}`);
    return this;
  }

  single() {
    this.query.single = true;
    return this;
  }

  async execute() {
    let endpoint = `${this.table}?select=${this.query.select}`;

    if (this.query.filters.length > 0) {
      endpoint += "&" + this.query.filters.join("&");
    }

    try {
      const data = await this.client.request(endpoint);

      if (this.query.single) {
        return { data: data[0] || null, error: null };
      }

      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }

  // Insert data
  async insert(data) {
    try {
      const result = await this.client.request(this.table, {
        method: "POST",
        body: JSON.stringify(data),
        headers: {
          Prefer: "return=representation",
        },
      });
      return { data: result, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }

  // Upsert data
  async upsert(data) {
    try {
      const result = await this.client.request(this.table, {
        method: "POST",
        body: JSON.stringify(data),
        headers: {
          Prefer: "return=representation,resolution=merge-duplicates",
        },
      });
      return { data: result, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }

  // Update data
  async update(data) {
    let endpoint = this.table;

    if (this.query.filters.length > 0) {
      endpoint += "?" + this.query.filters.join("&");
    }

    try {
      const result = await this.client.request(endpoint, {
        method: "PATCH",
        body: JSON.stringify(data),
        headers: {
          Prefer: "return=representation",
        },
      });
      return { data: result, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }
}

// Create client instance
export const supabase = new SupabaseClient(
  SUPABASE_CONFIG.url,
  SUPABASE_CONFIG.anonKey
);

// Authentication helper functions
export const auth = {
  // Get current user
  async getUser() {
    return await supabase.auth.getUser();
  },

  // Get current session
  async getSession() {
    return await supabase.auth.getSession();
  },

  // Sign out
  async signOut() {
    return await supabase.auth.signOut();
  },

  // Set session (called from dashboard bridge)
  async setSession(session) {
    try {
      await chrome.storage.local.set({ supabase_session: session });
      if (session?.access_token) {
        supabase.authToken = session.access_token;
      }
      return { error: null };
    } catch (error) {
      return { error };
    }
  },
};

// Timer state database operations
export const timerDB = {
  // Get timer state
  async getTimerState(userId) {
    return await supabase
      .from("timer_state")
      .select("*")
      .eq("user_id", userId)
      .single()
      .execute();
  },

  // Upsert timer state
  async upsertTimerState(userId, timerState) {
    const data = {
      ...timerState,
      user_id: userId,
      updated_at: new Date().toISOString(),
    };
    return await supabase.from("timer_state").upsert(data);
  },

  // Create session
  async createSession(userId, sessionData) {
    const data = {
      ...sessionData,
      user_id: userId,
    };
    return await supabase.from("sessions").insert(data);
  },

  // Note: Real-time subscriptions require WebSocket connection
  // For now, we'll use polling instead of real-time subscriptions
  // This can be enhanced later with WebSocket support
  subscribeToTimerState(userId, callback) {
    // Simplified polling approach
    const pollInterval = setInterval(async () => {
      try {
        const { data, error } = await this.getTimerState(userId);
        if (!error && data) {
          callback({
            eventType: "UPDATE",
            new: data,
          });
        }
      } catch (error) {
        console.error("FocusDot: Error polling timer state:", error);
      }
    }, 2000); // Poll every 2 seconds

    return {
      unsubscribe: () => clearInterval(pollInterval),
    };
  },
};

// User settings operations
export const settingsDB = {
  // Get user settings
  async getUserSettings(userId) {
    return await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", userId)
      .single()
      .execute();
  },
};

// Initialize authentication state
export async function initializeAuth() {
  try {
    const {
      data: { session },
      error,
    } = await auth.getSession();
    if (error) {
      console.error("FocusDot: Error getting session:", error);
      return { user: null, session: null };
    }

    console.log(
      "FocusDot: Auth initialized:",
      session?.user?.email || "No user"
    );
    return { user: session?.user || null, session };
  } catch (error) {
    console.error("FocusDot: Error initializing auth:", error);
    return { user: null, session: null };
  }
}

// Check if user is authenticated
export async function isAuthenticated() {
  const {
    data: { user },
  } = await auth.getUser();
  return !!user;
}
