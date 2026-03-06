import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';

/**
 * Configuración de compresión de imágenes
 * Estos valores son estándares para web
 */
export const IMAGE_COMPRESSION_CONFIG = {
  maxWidth: 1920, // Ancho máximo en píxeles (web estándar)
  maxHeight: 1080, // Alto máximo en píxeles
  quality: 0.8, // Calidad de compresión (0.7-0.9 es bueno para web)
  maxSizeMB: 2, // Tamaño máximo en MB
};

/**
 * Configuración de Cloudinary
 * Reemplaza estos valores con tu información de Cloudinary
 * https://cloudinary.com/console
 */
export const CLOUDINARY_CONFIG = {
  cloudName: 'dcwznuumv', // Tu Cloud Name de Cloudinary
  apiKey: 'SxF2hLr6ZQFv0befVasUrpMt35I', // Tu API Key de Cloudinary
  uploadPreset: 'products_upload', // Preset sin autenticación para uploads desde cliente
};

export interface CloudinaryUploadResponse {
  public_id: string;
  version: number;
  signature: string;
  width: number;
  height: number;
  format: string;
  resource_type: string;
  created_at: string;
  tags: any[];
  bytes: number;
  type: string;
  etag: string;
  placeholder: boolean;
  url: string;
  secure_url: string;
  folder: string;
  original_filename: string;
}

export interface ImageUploadProgress {
  progress: number; // 0-100
  isUploading: boolean;
  error?: string;
}

@Injectable({
  providedIn: 'root',
})
export class ImageUploadService {
  private http = inject(HttpClient);

  // Signals para estado de carga
  uploadProgress = signal<ImageUploadProgress>({
    progress: 0,
    isUploading: false,
  });

  // Subject para notificaciones
  private uploadCompleted = new Subject<CloudinaryUploadResponse>();
  uploadCompleted$ = this.uploadCompleted.asObservable();

  constructor() {
    // Validar configuración
    this.validateConfig();
  }

  /**
   * Valida que la configuración de Cloudinary esté presente
   */
  private validateConfig(): void {
    const { cloudName, uploadPreset } = CLOUDINARY_CONFIG;
    if (
      cloudName === 'YOUR_CLOUD_NAME' ||
      uploadPreset === 'YOUR_UPLOAD_PRESET'
    ) {
      console.warn(
        '⚠️ Cloudinary no está configurado. Por favor, actualiza CLOUDINARY_CONFIG',
      );
    }
  }

  /**
   * Sube una imagen a Cloudinary (con compresión automática)
   * @param file Archivo a subir
   * @param folder Carpeta en Cloudinary (opcional)
   * @param customName Nombre personalizado para la imagen (opcional, sin extensión)
   * @returns Observable con la respuesta de Cloudinary
   */
  uploadImage(
    file: File,
    folder: string = 'restrologic/products',
    customName?: string,
  ): Observable<CloudinaryUploadResponse> {
    // Validar archivo
    if (!this.isValidImageFile(file)) {
      this.uploadProgress.update((state) => ({
        ...state,
        error:
          'Archivo no válido. Solo se aceptan imágenes (JPG, PNG, WebP, GIF)',
      }));
      return of();
    }

    // Indicar que estamos comprimiendo
    this.uploadProgress.set({
      progress: 10,
      isUploading: true,
    });

    // Comprimir imagen antes de subir
    this.compressImage(file)
      .then((compressedFile) => {
        // Usar XMLHttpRequest directamente para evitar problemas de CORS
        const xhr = new XMLHttpRequest();
        const formData = new FormData();

        // Determinar nombre del archivo (sin extensión)
        let uniqueFilename: string;

        if (customName) {
          // Usar nombre personalizado con timestamp (para versionar: product-abc123-1705123456)
          const timestamp = Date.now();
          uniqueFilename = `${customName}-${timestamp}`;
        } else {
          // Generar nombre único: timestamp + random + nombre original (sin extensión)
          const timestamp = Date.now();
          const randomStr = Math.random().toString(36).substring(2, 8);

          // Extraer nombre sin extensión
          const fileNameWithoutExt = file.name
            .replace(/\.[^/.]+$/, '') // Quitar extensión
            .replace(/\s+/g, '-') // Espacios → guiones
            .replace(/[^a-zA-Z0-9-]/g, ''); // Solo alfanuméricos y guiones

          uniqueFilename = `${timestamp}_${randomStr}_${fileNameWithoutExt}`;
        }

        formData.append('file', compressedFile);
        formData.append('upload_preset', CLOUDINARY_CONFIG.uploadPreset);
        formData.append('folder', folder);
        formData.append('public_id', uniqueFilename); // Nombre único SIN extensión

        const uploadUrl = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/image/upload`;

        // Progreso de upload
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const percentComplete = Math.round(
              (event.loaded / event.total) * 100,
            );
            this.uploadProgress.set({
              progress: percentComplete,
              isUploading: true,
            });
          }
        });

        // Upload exitoso
        xhr.addEventListener('load', () => {
          if (xhr.status === 200) {
            const response: CloudinaryUploadResponse = JSON.parse(
              xhr.responseText,
            );
            this.uploadProgress.set({
              progress: 100,
              isUploading: false,
            });
            this.uploadCompleted.next(response);
          } else {
            console.error('Error al subir imagen:', xhr.responseText);
            this.uploadProgress.set({
              progress: 0,
              isUploading: false,
              error: 'Error al subir la imagen',
            });
          }
        });

        // Error de red
        xhr.addEventListener('error', () => {
          console.error('Error de red al subir imagen');
          this.uploadProgress.set({
            progress: 0,
            isUploading: false,
            error: 'Error de conexión al subir la imagen',
          });
        });

        // Enviar petición
        xhr.open('POST', uploadUrl);
        xhr.send(formData);
      })
      .catch((error) => {
        console.error('Error al comprimir imagen:', error);
        this.uploadProgress.set({
          progress: 0,
          isUploading: false,
          error: 'Error al procesar la imagen',
        });
      });

    // Retornar observable del evento completado
    return this.uploadCompleted$;
  }

  /**
   * Comprime una imagen usando Canvas API (nativo, sin dependencias)
   * @param file Archivo de imagen a comprimir
   * @returns Promise con la imagen comprimida
   */
  private compressImage(file: File): Promise<File> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (event: ProgressEvent<FileReader>) => {
        const img = new Image();

        img.onload = () => {
          // Calcular nuevas dimensiones manteniendo proporción
          let width = img.width;
          let height = img.height;

          if (
            width > IMAGE_COMPRESSION_CONFIG.maxWidth ||
            height > IMAGE_COMPRESSION_CONFIG.maxHeight
          ) {
            const ratio = Math.min(
              IMAGE_COMPRESSION_CONFIG.maxWidth / width,
              IMAGE_COMPRESSION_CONFIG.maxHeight / height,
            );
            width *= ratio;
            height *= ratio;
          }

          // Crear canvas y dibujar imagen redimensionada
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('No se puede obtener contexto del canvas'));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          // Convertir a blob comprimido
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Error al crear blob comprimido'));
                return;
              }

              // Crear nuevo File con la imagen comprimida
              const compressedFile = new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });

              console.log(
                `✅ Imagen comprimida: ${(file.size / 1024).toFixed(2)}KB → ${(blob.size / 1024).toFixed(2)}KB`,
              );

              resolve(compressedFile);
            },
            'image/jpeg',
            IMAGE_COMPRESSION_CONFIG.quality,
          );
        };

        img.onerror = () => {
          reject(new Error('Error al cargar la imagen'));
        };

        img.src = event.target?.result as string;
      };

      reader.onerror = () => {
        reject(new Error('Error al leer el archivo'));
      };

      reader.readAsDataURL(file);
    });
  }

  /**
   * Valida que el archivo sea una imagen soportada
   */
  private isValidImageFile(file: File): boolean {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const maxSize = 10 * 1024 * 1024; // 10MB

    return validTypes.includes(file.type) && file.size <= maxSize;
  }

  /**
   * Genera una URL optimizada de Cloudinary
   * @param publicId ID público de la imagen en Cloudinary
   * @param width Ancho deseado (opcional)
   * @param height Alto deseado (opcional)
   * @param quality Calidad (auto, 80, 60, etc)
   * @returns URL optimizada
   */
  getOptimizedUrl(
    publicId: string,
    width?: number,
    height?: number,
    quality: string = 'auto',
  ): string {
    let transforms = [];

    if (width || height) {
      const w = width ? `w_${width}` : '';
      const h = height ? `h_${height}` : '';
      const fit = 'c_fill';
      transforms.push(`${w}${h ? ',' + h : ''},${fit}`);
    }

    transforms.push(`q_${quality}`);

    const transformString = transforms.join(',');

    return `https://res.cloudinary.com/${CLOUDINARY_CONFIG.cloudName}/image/upload/${
      transformString ? transformString + '/' : ''
    }${publicId}`;
  }

  /**
   * Crea una URL de thumbnail
   */
  getThumbnailUrl(publicId: string, size: number = 200): string {
    return this.getOptimizedUrl(publicId, size, size, 'auto');
  }

  /**
   * Crea una URL responsive
   */
  getResponsiveUrl(publicId: string): string {
    return `https://res.cloudinary.com/${CLOUDINARY_CONFIG.cloudName}/image/upload/c_fill,w_auto,dpr_auto/q_auto/${publicId}`;
  }

  /**
   * Deleta una imagen de Cloudinary
   * NOTA: Requiere autenticación en el backend
   */
  deleteImage(publicId: string): Observable<any> {
    // Esta operación debe hacerse en el backend por seguridad
    // No incluyas API Secret en el cliente
    console.error(
      'La eliminación debe hacerse en el backend. No uses credenciales en el cliente.',
    );
    return of(null);
  }

  /**
   * Obtiene el ID público de una URL de Cloudinary
   */
  getPublicIdFromUrl(url: string): string {
    const match = url.match(/\/([^/]+)$/);
    return match ? match[1] : '';
  }
}
