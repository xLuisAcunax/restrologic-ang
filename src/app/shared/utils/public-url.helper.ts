import { environment } from '../../../environments/environment';

/**
 * Helper functions to generate public URLs for menu and order tracking
 */
export class PublicUrlHelper {
  /**
   * Get the base URL for public pages
   * Uses environment.publicMenuBaseUrl or falls back to window.location.origin
   */
  private static getPublicBase(): string {
    const fromEnv = environment.publicMenuBaseUrl;
    if (fromEnv) return fromEnv.replace(/\/$/, '');

    if (typeof window !== 'undefined' && window.location) {
      return window.location.origin;
    }

    return '';
  }

  /**
   * Generate public menu URL
   * @param tenantId - Tenant ID
   * @param branchId - Branch ID
   * @returns Full URL to public menu
   */
  static buildMenuUrl(tenantId: string, branchId: string): string {
    const base = this.getPublicBase();
    return `${base}/menu?tenantId=${tenantId}&branchId=${branchId}`;
  }

  /**
   * Generate public order tracking URL
   * @param tenantId - Tenant ID
   * @param branchId - Branch ID
   * @param orderId - Order ID
   * @returns Full URL to order tracking page
   */
  static buildTrackingUrl(
    tenantId: string,
    branchId: string,
    orderId: string
  ): string {
    const base = this.getPublicBase();
    return `${base}/seguimiento?tenantId=${tenantId}&branchId=${branchId}&orderId=${orderId}`;
  }

  /**
   * Copy URL to clipboard
   * @param url - URL to copy
   * @returns Promise that resolves when copied successfully
   */
  static async copyToClipboard(url: string): Promise<void> {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = url;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
    } catch (error) {
      console.error('Error copying URL to clipboard:', error);
      throw error;
    }
  }
}
