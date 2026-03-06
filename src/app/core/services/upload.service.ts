import {
  HttpClient,
  HttpHeaders,
  HttpEvent,
  HttpEventType,
} from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map, filter } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export type CloudinaryUploadResponse = {
  ok: boolean;
  data: {
    imageUrl: string;
    publicId: string;
    width: number;
    height: number;
    format: string;
    size?: number;
  };
};

export type UploadProgress = {
  progress: number; // 0-100
  loaded: number;
  total: number;
};

export type CloudinaryDeleteResponse = {
  ok: boolean;
  message?: string;
};

@Injectable({ providedIn: 'root' })
export class UploadService {
  private readonly base = environment.apiBaseUrl;
  private http = inject(HttpClient);

  /**
   * Upload product image to Cloudinary with progress tracking
   * @param file Image file to upload
   * @param token JWT token for authentication
   * @returns Observable with upload events (progress and response)
   */
  uploadProductImageWithProgress(
    file: File,
    token?: string
  ): Observable<HttpEvent<CloudinaryUploadResponse>> {
    const formData = new FormData();
    formData.append('image', file);

    const headers = token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : undefined;

    return this.http.post<CloudinaryUploadResponse>(
      `${this.base}/upload/product-image`,
      formData,
      {
        headers,
        reportProgress: true,
        observe: 'events',
      }
    );
  }

  /**
   * Upload product image to Cloudinary (simple version without progress)
   * @param file Image file to upload
   * @param token JWT token for authentication
   * @returns Observable with Cloudinary upload response
   */
  uploadProductImage(
    file: File,
    token?: string
  ): Observable<CloudinaryUploadResponse> {
    const formData = new FormData();
    formData.append('image', file);

    const headers = token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : undefined;

    return this.http.post<CloudinaryUploadResponse>(
      `${this.base}/upload/product-image`,
      formData,
      headers ? { headers } : {}
    );
  }

  /**
   * Delete product image from Cloudinary
   * @param publicId Public ID of the image (e.g., 'restrologic/products/abc123')
   * @param token JWT token for authentication
   * @returns Observable with delete response
   */
  deleteProductImage(
    publicId: string,
    token?: string
  ): Observable<CloudinaryDeleteResponse> {
    // URL encode the publicId (replace / with %2F)
    const encodedPublicId = encodeURIComponent(publicId);

    const headers = token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : undefined;

    return this.http.delete<CloudinaryDeleteResponse>(
      `${this.base}/upload/product-image/${encodedPublicId}`,
      headers ? { headers } : {}
    );
  }

  /**
   * Extract publicId from Cloudinary URL
   * @param imageUrl Full Cloudinary URL
   * @returns publicId or null if not a valid Cloudinary URL
   */
  extractPublicId(imageUrl: string): string | null {
    if (!imageUrl) return null;

    // Cloudinary URL format: https://res.cloudinary.com/{cloud_name}/image/upload/v{version}/{publicId}.{format}
    const match = imageUrl.match(/\/upload\/(?:v\d+\/)?(.+)\.\w+$/);
    return match ? match[1] : null;
  }
}
