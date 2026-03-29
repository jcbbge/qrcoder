/**
 * SyncLogFeed Component
 * Displays sync operation logs grouped by 15-minute intervals, showing vendor, status, summary and details
 */

class SyncLogFeed extends HTMLElement {
  constructor() {
    super();
    this.logs = [];
    this.showVendorName = false; // Will be true for today.html, false for index.html
  }

  /**
   * Set logs data and trigger render
   * @param {Array} logs - Array of sync log entries
   */
  setLogs(logs) {
    this.logs = logs;
    this.render();
  }

  /**
   * Configure if vendor names should be shown
   * @param {boolean} show - Whether to show vendor names
   */
  setShowVendorName(show) {
    this.showVendorName = show;
    this.render();
  }

  /**
   * Format duration in a human-readable way
   * @param {number} duration_ms - Duration in milliseconds
   * @returns {string} Formatted duration
   */
  formatDuration(duration_ms) {
    if (!duration_ms) return '';

    if (duration_ms < 1000) {
      return `${duration_ms}ms`;
    }

    const seconds = Math.floor(duration_ms / 1000);
    const ms = duration_ms % 1000;

    if (seconds < 60) {
      return `${seconds}s ${ms}ms`;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  /**
   * Group logs by hour
   * @param {Array} logs - Array of sync log entries
   * @returns {Object} - Logs grouped by hour
   */
  groupLogsByTime(logs) {
    const groups = {};

    logs.forEach(log => {
      const date = new Date(log.run_at);
      const hour = date.getHours();
      const key = `${hour}:00`;

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(log);
    });

    return groups;
  }

  /**
   * Format details from JSONB data with improved readability
   * @param {Object} details - Log details object
   * @returns {string} HTML string of formatted details
   */
  formatDetails(details) {
    if (!details) return '';

    let html = '<div class="sync-log-details">';

    // Show product changes first with clear context
    if (details.operations) {
      const created = details.operations.filter(op => op.type === 'product_created');
      const updated = details.operations.filter(op => op.type === 'product_updated');
      const pages = details.operations.filter(op => op.type === 'page_created');
      const queues = details.operations.filter(op => op.type === 'queue_created');

      // Show queue and page information FIRST
      if (queues.length > 0 && pages.length > 0) {
        const queue = queues[0];
        html += '<div class="location-section">';
        if (pages.length === 1) {
          html += `<p>📋 These products are on Page ${pages[0].id} in Queue ${queue.id}</p>`;
        } else {
          html += `<p>📋 These products are on Pages ${pages.map(p => p.id).join(', ')} in Queue ${queue.id}</p>`;
        }
        html += '</div>';
      }

      if (created.length > 0) {
        html += '<div class="products-section">';
        html += '<h4>✨ New Products Added</h4>';
        html += '<ul class="products">';
        created.forEach(op => {
          html += `<li>
            <div class="product-info">
              <span class="product-name">${op.name}</span>
              <span class="product-price">$${op.price}</span>
            </div>
            <div class="product-meta">Added to catalog</div>
          </li>`;
        });
        html += '</ul></div>';
      }

      if (updated.length > 0) {
        html += '<div class="products-section">';
        html += '<h4>🔄 Products Updated</h4>';
        html += '<ul class="products">';
        updated.forEach(op => {
          html += `<li>
            <div class="product-info">
              <span class="product-name">${op.name}</span>
              <span class="product-price">$${op.price}</span>
            </div>
            <div class="product-meta">Price or details changed</div>
          </li>`;
        });
        html += '</ul></div>';
      }

      // Show counts as a clear summary
      if (details.counts) {
        const counts = details.counts;
        const total = (counts.products_created || 0) + (counts.products_updated || 0);
        if (total > 0) {
          html += '<div class="sync-summary">';
          html += '<h4>📊 Sync Summary</h4>';
          html += '<div class="counts">';
          if (counts.products_created > 0) {
            html += `<span class="count-item">✨ ${counts.products_created} new products</span>`;
          }
          if (counts.products_updated > 0) {
            html += `<span class="count-item">🔄 ${counts.products_updated} updated products</span>`;
          }
          html += '</div></div>';
        }
      }
    }

    // Show any error messages with clear context
    if (details.errors && details.errors.length > 0) {
      html += '<div class="errors-section">';
      html += '<h4>⚠️ Issues Found</h4>';
      html += '<ul class="errors">';
      details.errors.forEach(error => {
        html += `<li class="error-item">
          <span class="error-message">${error.message}</span>
          ${error.details ? `<div class="error-details">Additional info: ${JSON.stringify(error.details, null, 2)}</div>` : ''}
        </li>`;
      });
      html += '</ul></div>';
    }

    html += '</div>';
    return html;
  }

  render() {
    const groups = this.groupLogsByTime(this.logs);

    let html = '<div class="sync-log-feed">';

    // Render each time group
    Object.entries(groups).forEach(([time, logs]) => {
      html += `
        <div class="time-group">
          <h3 class="time-header">${time}</h3>
          <div class="logs-container">
      `;

      logs.forEach(log => {
        const duration = this.formatDuration(log.duration_ms);
        const createdBy = log.created_by ? `<span class="created-by">by ${log.created_by}</span>` : '';
        const timestamp = new Date(log.run_at).toLocaleTimeString();

        html += `
          <div class="sync-log-entry status-${log.status.toLowerCase()}">
            ${this.showVendorName ? `<div class="vendor-name">${log.vendor_name}</div>` : ''}
            <div class="log-header">
              <div class="log-header-left">
                <span class="status">${log.status}</span>
                ${createdBy}
              </div>
              <div class="log-header-right">
                <span class="duration">${duration}</span>
                <span class="timestamp">${timestamp}</span>
              </div>
            </div>
            <div class="summary">${log.summary || ''}</div>
            ${this.formatDetails(log.details)}
          </div>
        `;
      });

      html += `
          </div>
        </div>
      `;
    });

    html += '</div>';
    this.innerHTML = html;
  }
}

// Register the custom element
customElements.define('sync-log-feed', SyncLogFeed);
