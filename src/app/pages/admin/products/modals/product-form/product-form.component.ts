import {
  Component,
  inject,
  Inject,
  OnInit,
  OnDestroy,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';

import {
  CreateProductDto,
  Product,
  ProductService,
  UpdateProductDto,
} from '../../../../../core/services/product.service';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { AuthService } from '../../../../../core/services/auth.service';
import { CategoryService } from '../../../../../core/services/category.service';
import {
  Subcategory,
  SubcategoryService,
} from '../../../../../core/services/subcategory.service';
import {
  ProductSize,
  ProductSizeService,
} from '../../../../../core/services/product-size.service';
import { ProductTypeService } from '../../../../../core/services/product-type.service';
import { ImageUploadService } from '../../../../../core/services/image-upload.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-product-form',
  imports: [ReactiveFormsModule, FormsModule],
  templateUrl: './product-form.component.html',
})
export class ProductFormComponent implements OnInit, OnDestroy {
  me = inject(AuthService).me;
  productService = inject(ProductService);
  categoryService = inject(CategoryService);
  subcategoryService = inject(SubcategoryService);
  productSizeService = inject(ProductSizeService);
  productTypeService = inject(ProductTypeService);
  imageUploadService = inject(ImageUploadService);

  // Subject para limpiar suscripciones
  private destroy$ = new Subject<void>();

  filteredSubcategories = signal<Subcategory[]>([]);
  filteredProductSizes = signal<ProductSize[]>([]);

  // Signals para manejo de imagen
  imageFile = signal<File | null>(null);
  previewImageUrl = signal<string>('');

  // Usar signals del servicio para estado de upload
  uploadProgress = this.imageUploadService.uploadProgress;
  get isUploadingImage() {
    return this.uploadProgress().isUploading;
  }
  get uploadError() {
    return this.uploadProgress().error || '';
  }

  form = new FormBuilder().group({
    name: ['', Validators.required],
    description: [''],
    price: [0, [Validators.required, Validators.min(0)]],
    imageUrl: [''],
    categoryId: [''],
    subcategoryId: [{ value: '', disabled: true }],
    productSizeId: [{ value: '', disabled: true }],
    type: [''],
    productTypeId: [''],
    allBranches: true,
    isActive: true,
  });

  constructor(
    public dialogRef: DialogRef<string>, // Specify the return type when closing
    @Inject(DIALOG_DATA)
    public data: {
      product?: Product | undefined;
      branchId: string;
    },
  ) {}

  ngOnInit(): void {
    // Limpiar estado de imagen antes de cargar
    this.imageFile.set(null);
    this.previewImageUrl.set('');

    if (this.data.product && this.data.product.imageUrl) {
      this.previewImageUrl.set(this.data.product.imageUrl);
      this.form.patchValue({ imageUrl: this.data.product.imageUrl });
    }

    // Listen to category changes to filter subcategories and product sizes
    this.form.controls.categoryId.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((categoryId) => {
        const hasCategory = !!categoryId;
        if (hasCategory) {
          this.form.controls.subcategoryId.enable({ emitEvent: false });
          this.form.controls.productSizeId.enable({ emitEvent: false });
          this.updateFilteredSubcategories(categoryId);
          this.updateFilteredProductSizes(categoryId);
        } else {
          this.form.controls.subcategoryId.disable({ emitEvent: false });
          this.form.controls.subcategoryId.setValue('', { emitEvent: false });
          this.form.controls.productSizeId.disable({ emitEvent: false });
          this.form.controls.productSizeId.setValue('', { emitEvent: false });
          this.filteredSubcategories.set([]);
          this.filteredProductSizes.set([]);
        }
      });

    // If editing, patch existing values
    if (this.data.product) {
      this.form.patchValue({
        name: this.data.product.name,
        description: this.data.product.description,
        price: this.data.product.price,
        imageUrl: this.data.product.imageUrl || '',
        allBranches: this.data.product.branchId ? false : true,
        type: this.data.product.productTypeId,
        categoryId: this.data.product.categoryId || '',
        subcategoryId: this.data.product.subcategoryId || '',
        productSizeId: this.data.product.productSizeId || '',
        productTypeId: this.data.product.productTypeId || '',
        isActive: this.data.product.isActive,
      });

      // Enable controls if category is set
      if (this.data.product.categoryId) {
        this.form.controls.subcategoryId.enable({ emitEvent: false });
        this.form.controls.productSizeId.enable({ emitEvent: false });
        this.updateFilteredSubcategories(this.data.product.categoryId);
        this.updateFilteredProductSizes(this.data.product.categoryId);
      }
    }
  }

  onSaving() {
    if (!this.form.valid) {
      return;
    }

    // Si es edición Y hay imagen nueva, subirla con el ID del producto
    if (this.data.product && this.imageFile()) {
      const productId = this.data.product.id;
      console.log(
        '📤 Subiendo imagen para producto:',
        productId,
        this.data.product.name,
      );
      const customName = `product-${productId}`;

      this.imageUploadService
        .uploadImage(this.imageFile()!, 'products', customName)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response) => {
            console.log(
              '✅ Imagen subida exitosamente para:',
              productId,
              response.secure_url,
            );
            this.form.patchValue({
              imageUrl: response.secure_url,
            });
            this.saveProduct();
          },
          error: (error) => {
            console.error('❌ Error al subir imagen:', error);
          },
        });
    }
    // Si es creación Y hay imagen, crear producto primero para obtener ID
    else if (!this.data.product && this.imageFile()) {
      console.log('📝 Creando nuevo producto con imagen');
      // Guardar producto sin imagen primero
      this.productService
        .createProduct(this.mapProductToUpdateDto() as CreateProductDto)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (createdProduct) => {
            console.log('✅ Producto creado:', createdProduct.id);
            // Ahora subir imagen con el ID del producto
            const customName = `product-${createdProduct.id}`;

            this.imageUploadService
              .uploadImage(this.imageFile()!, 'products', customName)
              .pipe(takeUntil(this.destroy$))
              .subscribe({
                next: (response) => {
                  console.log(
                    '✅ Imagen subida para nuevo producto:',
                    createdProduct.id,
                    response.secure_url,
                  );
                  // Actualizar producto con la URL de imagen
                  this.productService
                    .updateProduct(
                      { imageUrl: response.secure_url },
                      createdProduct.id,
                    )
                    .pipe(takeUntil(this.destroy$))
                    .subscribe({
                      next: () => {
                        console.log('✅ Producto actualizado con imagen');
                        // Refrescar lista después de actualizar imagen
                        this.productService.forceRefresh();
                        this.dialogRef.close('Confirmed');
                      },
                    });
                },
                error: (error) => {
                  console.error('❌ Error al subir imagen:', error);
                  // Producto ya creado, pero sin imagen
                  this.dialogRef.close('Confirmed');
                },
              });
          },
        });
    } else {
      // Si no hay imagen nueva, solo guardar producto normalmente
      console.log('💾 Guardando producto sin cambio de imagen');
      this.saveProduct();
    }
  }

  private saveProduct() {
    const request$ = this.data.product
      ? this.productService.updateProduct(
          this.mapProductToUpdateDto(),
          this.data.product.id,
        )
      : this.productService.createProduct(
          this.mapProductToUpdateDto() as CreateProductDto,
        );

    request$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      if (this.data.product) {
        console.log(
          '✅ Producto actualizado:',
          this.data.product.id,
          this.data.product.name,
        );
      } else {
        console.log('✅ Producto creado');
      }
      // Refrescar lista de productos después de actualizar
      this.productService.forceRefresh();
      this.dialogRef.close('Confirmed');
    });
  }

  /**
   * Maneja la selección de archivo de imagen
   */
  onImageSelected(event: Event): void {
    const target = event.target as HTMLInputElement;
    const files = target.files;

    if (!files || files.length === 0) {
      this.imageFile.set(null);
      this.previewImageUrl.set('');
      return;
    }

    const file = files[0];

    // Validar que sea imagen
    if (!file.type.startsWith('image/')) {
      console.warn('Por favor selecciona un archivo de imagen válido');
      return;
    }

    // Validar tamaño (máximo 10MB)
    const maxSizeMB = 10;
    if (file.size > maxSizeMB * 1024 * 1024) {
      console.warn(
        `El archivo debe ser menor a ${maxSizeMB}MB. El archivo actual pesa ${(file.size / 1024 / 1024).toFixed(2)}MB`,
      );
      return;
    }

    // Guardar archivo
    this.imageFile.set(file);

    // Crear preview
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      this.previewImageUrl.set(result);
    };
    reader.readAsDataURL(file);
  }

  /**
   * Limpia la imagen seleccionada
   */
  clearImage(): void {
    this.imageFile.set(null);
    this.previewImageUrl.set('');
  }

  mapProductToUpdateDto(): UpdateProductDto {
    return {
      name: this.form.value.name ?? this.data.product?.name,
      description:
        this.form.value.description ?? this.data.product?.description,
      price: this.form.value.price ?? this.data.product?.price,
      imageUrl: this.form.value.imageUrl || undefined,
      type: this.form.value.type || undefined,
      categoryId: this.form.value.categoryId || undefined,
      subcategoryId: this.form.value.subcategoryId || undefined,
      productSizeId: this.form.value.productSizeId || undefined,
      productTypeId: this.form.value.productTypeId || undefined,
      isActive: this.form.value.isActive!,
      branchId: this.form.value.allBranches ? null : this.data.branchId,
    };
  }

  private updateFilteredSubcategories(categoryId: string): void {
    const filtered = this.subcategoryService
      .subcategories()
      .filter((s) => s.categoryId === categoryId);
    this.filteredSubcategories.set(filtered);
  }

  private updateFilteredProductSizes(categoryId: string): void {
    const filtered = this.productSizeService
      .productSizes()
      .filter((ps) => ps.categoryId === categoryId);
    this.filteredProductSizes.set(filtered);
  }

  ngOnDestroy(): void {
    console.log('🧹 Limpiando ProductFormComponent');
    this.destroy$.next();
    this.destroy$.complete();
  }
}
