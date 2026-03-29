/**
 * Service for fetching and managing sync logs
 */
class SyncLogService {
  constructor() {
    this.baseUrl = '/api/sync-logs';
  }

  /**
   * Fetch sync logs with optional filtering
   * @param {Object} options - Filter options
   * @param {string} [options.vendor_name] - Filter by vendor name
   * @param {string} [options.status] - Filter by status
   * @param {string} [options.start_date] - Filter by start date (ISO string)
   * @param {string} [options.end_date] - Filter by end date (ISO string)
   * @param {number} [options.limit=50] - Maximum number of logs to return
   * @returns {Promise<Array>} Array of sync log entries
   */
  async fetchLogs(options = {}) {
    try {
      const params = new URLSearchParams();

      // Add optional filters to query params
      if (options.vendor_name) {
        params.append('vendor_name', options.vendor_name);
      }
      if (options.status) {
        params.append('status', options.status);
      }
      if (options.start_date) {
        params.append('start_date', options.start_date);
      }
      if (options.end_date) {
        params.append('end_date', options.end_date);
      }
      if (options.limit) {
        params.append('limit', options.limit.toString());
      }

      const queryString = params.toString();
      const url = `${this.baseUrl}${queryString ? '?' + queryString : ''}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const logs = await response.json();
      return logs;
    } catch (error) {
      console.error('Error fetching sync logs:', error);
      throw error;
    }
  }

  /**
   * Fetch logs for a specific vendor
   * @param {string} vendorName - Name of the vendor
   * @param {Object} [options] - Additional filter options
   * @returns {Promise<Array>} Array of sync log entries for the vendor
   */
  async fetchVendorLogs(vendorName, options = {}) {
    return this.fetchLogs({
      ...options,
      vendor_name: vendorName
    });
  }

  /**
   * Fetch today's logs for all vendors
   * @param {Object} [options] - Additional filter options
   * @returns {Promise<Array>} Array of today's sync log entries
   */
  async fetchTodayLogs(options = {}) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.fetchLogs({
      ...options,
      start_date: today.toISOString()
    });
  }

  /**
   * Fetch latest logs for each vendor
   * @param {number} [limit=1] - Number of latest logs per vendor
   * @returns {Promise<Object>} Object mapping vendor names to their latest logs
   */
  async fetchLatestVendorLogs(limit = 1) {
    try {
      const url = `${this.baseUrl}/latest${limit > 1 ? '?limit=' + limit : ''}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const logs = await response.json();
      return logs;
    } catch (error) {
      console.error('Error fetching latest vendor logs:', error);
      throw error;
    }
  }
}
