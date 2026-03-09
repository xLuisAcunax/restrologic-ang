import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  inject,
  QueryList,
  signal,
  ViewChildren,
} from '@angular/core';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { SafeHtmlPipe } from '../../pipes/safe-html.pipe';
import { combineLatest, Subscription } from 'rxjs';
import { SidebarService } from '../../services/sidebar.service';
import { AuthService } from '../../../core/services/auth.service';
import { appVersion } from '../../../../environments/version';
import { OrdersBadgeService } from '../../services/orders-badge.service';

type NavItem = {
  name: string;
  icon: string;
  path?: string;
  new?: boolean;
  subItems?: {
    name: string;
    path: string;
    icon?: string;
    pro?: boolean;
    new?: boolean;
  }[];
};

@Component({
  selector: 'app-sidebar',
  imports: [CommonModule, RouterModule, SafeHtmlPipe],
  templateUrl: './app-sidebar.component.html',
  styleUrl: './app-sidebar.component.css',
})
export class AppSidebarComponent {
  myRole = inject(AuthService).getRole() ?? [];
  appVersion = appVersion;
  ordersBadge = inject(OrdersBadgeService);

  navItems = signal<NavItem[]>([]);

  superNavItems: NavItem[] = [
    {
      icon: `<svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3"><path d="M5 26c5.86-6.959 11.184-10.966 13.613-12.612c.794-.539 1.841-.363 2.444.383a95 95 0 0 1 3.31 4.377c.808 1.132 2.513 1.168 3.408.104C31.911 13.34 37.501 8.5 37.501 8.5"/><path d="M42.376 11.323c.664-3.235.657-6.087.601-7.43a.9.9 0 0 0-.869-.87a31.7 31.7 0 0 0-7.43.601c-.753.154-1.002 1.075-.46 1.618l6.54 6.54c.544.543 1.464.293 1.618-.459M5.267 44.96c-1.128-.037-1.992-.719-2.106-1.841C3.07 42.239 3 40.932 3 39s.072-3.24.16-4.119c.115-1.122.979-1.804 2.107-1.842C5.934 33.017 6.827 33 8 33s2.066.017 2.733.04c1.128.037 1.992.719 2.106 1.841c.09.88.161 2.187.161 4.119s-.072 3.24-.16 4.119c-.115 1.122-.979 1.804-2.107 1.842c-.668.022-1.56.039-2.733.039s-2.066-.017-2.733-.04m32.29-.026c-1.3-.08-2.203-1.018-2.297-2.317C35.132 40.856 35 37.667 35 32s.132-8.856.26-10.617c.094-1.299.997-2.238 2.297-2.317C38.187 19.027 38.99 19 40 19s1.813.027 2.443.066c1.3.08 2.203 1.018 2.297 2.317c.128 1.761.26 4.95.26 10.617s-.132 8.856-.26 10.617c-.094 1.299-.997 2.238-2.297 2.317c-.63.039-1.432.066-2.443.066c-1.01 0-1.813-.027-2.443-.066m-16.057.018c-1.264-.055-2.187-.9-2.293-2.16C19.098 41.494 19 39.386 19 36s.098-5.494.207-6.792c.106-1.26 1.029-2.105 2.292-2.16A57 57 0 0 1 24 27c1.042 0 1.862.02 2.5.048c1.264.055 2.187.9 2.293 2.16c.109 1.298.207 3.406.207 6.792s-.098 5.494-.207 6.792c-.106 1.26-1.029 2.105-2.292 2.16c-.639.028-1.459.048-2.501.048a58 58 0 0 1-2.5-.048"/></g></svg>`,
      name: 'Dashboard',
      path: '/super',
    },
    {
      icon: `<svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="3"><path stroke-linejoin="round" d="M31.568 7.127A9 9 0 0 0 24 3a9 9 0 0 0-7.568 4.127A8 8 0 1 0 8.72 20.67a479 479 0 0 0 2.18 21.55c.17 1.36 1.251 2.4 2.62 2.488C15.606 44.842 19.1 45 24 45s8.394-.158 10.48-.293c1.369-.088 2.45-1.128 2.62-2.488a479 479 0 0 0 2.18-21.549a8 8 0 1 0-7.712-13.543"/><path stroke-linejoin="round" d="M37.753 37.363c-2.557-.133-6.836-.265-13.753-.265s-11.197.132-13.753.265"/><path d="m19 21l1 8m9-8l-1 8"/></g></svg>`,
      name: 'Negocios',
      path: '/super/businesses',
    },
    {
      icon: `<svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" stroke-width="3"><path d="M7 38a7 7 0 1 0 14 0a7 7 0 1 0-14 0m34 0a7 7 0 1 1-14 0a7 7 0 1 1 14 0"/><path stroke-linecap="round" d="M21 38c1.657-1.333 4.343-1.333 6 0"/><path stroke-linejoin="round" d="M3.05 23.063c.11 1.089 1.063 1.674 2.157 1.713C7.7 24.865 13.259 25 24 25s16.3-.135 18.793-.224c1.094-.04 2.047-.624 2.157-1.713q.048-.451.05-1.063q-.002-.612-.05-1.063c-.11-1.089-1.063-1.674-2.157-1.713C40.3 19.135 34.741 19 24 19s-16.3.135-18.793.224c-1.094.04-2.047.624-2.157 1.713Q3.002 21.388 3 22q.002.612.05 1.063Z"/><path d="M8.215 19.14c.32-2.5 1.02-7.168 2.28-11.85c.584-2.173 2.46-3.71 4.702-3.906C17.413 3.19 20.49 3 24 3s6.587.19 8.803.384c2.242.195 4.118 1.733 4.702 3.906c1.26 4.683 1.961 9.35 2.28 11.85"/></g></svg>`,
      name: 'Registros de error',
      path: '/super/error-logs',
    },
    {
      icon: `<svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3"><path d="M7 9a4 4 0 0 1 4-4h26a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H11a4 4 0 0 1-4-4z"/><path d="M7 31a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H11a4 4 0 0 1-4-4z"/><path d="M33 27h4a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4v-8a4 4 0 0 1 4-4Z"/><path d="M24 17v4m0 6v4"/></g></svg>`,
      name: 'Módulos',
      path: '/super/modules',
    },
  ];

  adminNavItems: NavItem[] = [
    {
      icon: `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"25\" height=\"25\" viewBox=\"0 0 48 48\"><g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"3\"><path d=\"M5 26c5.86-6.959 11.184-10.966 13.613-12.612c.794-.539 1.841-.363 2.444.383a95 95 0 0 1 3.31 4.377c.808 1.132 2.513 1.168 3.408.104C31.911 13.34 37.501 8.5 37.501 8.5\"/><path d=\"M42.376 11.323c.664-3.235.657-6.087.601-7.43a.9.9 0 0 0-.869-.87a31.7 31.7 0 0 0-7.43.601c-.753.154-1.002 1.075-.46 1.618l6.54 6.54c.544.543 1.464.293 1.618-.459M5.267 44.96c-1.128-.037-1.992-.719-2.106-1.841C3.07 42.239 3 40.932 3 39s.072-3.24.16-4.119c.115-1.122.979-1.804 2.107-1.842C5.934 33.017 6.827 33 8 33s2.066.017 2.733.04c1.128.037 1.992.719 2.106 1.841c.09.88.161 2.187.161 4.119s-.072 3.24-.16 4.119c-.115 1.122-.979 1.804-2.107 1.842c-.668.022-1.56.039-2.733.039s-2.066-.017-2.733-.04m32.29-.026c-1.3-.08-2.203-1.018-2.297-2.317C35.132 40.856 35 37.667 35 32s.132-8.856.26-10.617c.094-1.299.997-2.238 2.297-2.317C38.187 19.027 38.99 19 40 19s1.813.027 2.443.066c1.3.08 2.203 1.018 2.297 2.317c.128 1.761.26 4.95.26 10.617s-.132 8.856-.26 10.617c-.094 1.299-.997 2.238-2.297 2.317c-.63.039-1.432.066-2.443.066c-1.01 0-1.813-.027-2.443-.066m-16.057.018c-1.264-.055-2.187-.9-2.293-2.16C19.098 41.494 19 39.386 19 36s.098-5.494.207-6.792c.106-1.26 1.029-2.105 2.292-2.16A57 57 0 0 1 24 27c1.042 0 1.862.02 2.5.048c1.264.055 2.187.9 2.293 2.16c.109 1.298.207 3.406.207 6.792s-.098 5.494-.207 6.792c-.106 1.26-1.029 2.105-2.292 2.16c-.639.028-1.459.048-2.501.048a58 58 0 0 1-2.5-.048\"/></g></svg>`,
      name: 'Dashboard',
      path: '/admin',
    },
    {
      icon: `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"25\" height=\"25\" viewBox=\"0 0 48 48\"><g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"3\"><path d=\"M12 10h24l4 8H8l4-8Zm-4 8h32v18a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V18Zm8 6h12m-12 7h8\"/></g></svg>`,
      name: 'Entregas',
      path: '/admin/deliveries',
      new: true,
    },
    {
      icon: `<svg xmlns='http://www.w3.org/2000/svg' width='25' height='25' viewBox='0 0 48 48'><g fill='none' stroke='currentColor' stroke-linecap='round' stroke-linejoin='round' stroke-width='3'><path d='M5 9a4 4 0 0 1 4-4h30a4 4 0 0 1 4 4v14H5z'/><path d='M5 23h38v11a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4zm14 4h10m-10 5h6'/></g></svg>`,
      name: 'Estadísticas',
      path: '/admin/stats',
      new: true,
    },
    {
      icon: `<svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3"><path d="M19.158 4.362c.115-.24.281-.451.517-.575c.56-.294 1.868-.787 4.326-.787s3.765.493 4.325.787c.236.124.402.335.518.575c.335.7 1.082 2.314 1.643 3.92a17 17 0 0 1 3.878 2.242c1.672-.317 3.447-.477 4.222-.537c.265-.02.531.018.756.16c.535.339 1.616 1.224 2.844 3.353c1.23 2.129 1.456 3.507 1.482 4.14c.01.266-.089.515-.24.735c-.439.641-1.464 2.097-2.574 3.386a17.2 17.2 0 0 1 0 4.478c1.11 1.29 2.135 2.745 2.574 3.386c.15.22.25.47.24.735c-.026.633-.253 2.011-1.482 4.14s-2.31 3.014-2.844 3.353c-.225.142-.49.18-.757.16c-.775-.06-2.549-.22-4.22-.537a17 17 0 0 1-3.878 2.243c-.562 1.605-1.309 3.218-1.644 3.92c-.116.24-.282.45-.518.574c-.56.294-1.867.787-4.325.787s-3.765-.493-4.326-.787c-.236-.124-.402-.334-.517-.575c-.335-.7-1.083-2.314-1.644-3.92a17 17 0 0 1-3.878-2.242c-1.672.317-3.446.477-4.22.537c-.266.02-.532-.018-.757-.16c-.535-.339-1.616-1.224-2.845-3.353s-1.455-3.507-1.48-4.14c-.012-.266.088-.515.239-.735c.439-.641 1.464-2.097 2.574-3.386a17.2 17.2 0 0 1 0-4.478c-1.11-1.29-2.135-2.745-2.575-3.386c-.15-.22-.25-.47-.24-.735c.027-.633.253-2.011 1.482-4.14s2.31-3.014 2.844-3.353c.226-.142.491-.18.757-.16c.775.06 2.55.22 4.221.537a17 17 0 0 1 3.878-2.243c.561-1.605 1.309-3.219 1.644-3.92Z"/><path d="M14 24a10 10 0 1 0 20 0a10 10 0 1 0-20 0"/></g></svg>`,
      name: 'Configuración',
      subItems: [
        {
          name: 'Sucursales',
          path: '/admin/branches',
          icon: `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"18\" height=\"18\" viewBox=\"0 0 48 48\"><g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"3\"><path d=\"m37.5 33.26l.58.032c1.215.068 2.301.733 2.848 1.82a33.5 33.5 0 0 1 2.423 6.38c.44 1.657-.775 3.19-2.487 3.26C37.998 44.87 32.824 45 24 45s-13.998-.13-16.864-.247c-1.712-.07-2.926-1.605-2.487-3.26a33.5 33.5 0 0 1 2.423-6.381c.547-1.087 1.633-1.752 2.848-1.82l.58-.031\"/><path d=\"M39 18.07c0 10.63-10.748 18.26-14.048 20.353a1.77 1.77 0 0 1-1.904 0C19.748 36.331 9 28.7 9 18.07C9 9.747 15.716 3 24 3s15 6.747 15 15.07\"/><path d=\"M30 18a6 6 0 1 1-12 0a6 6 0 0 1 12 0\"/></g></svg>`,
        },
        {
          name: 'Menú público',
          path: '/admin/public-menu',
          icon: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 48 48"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M20.842 6.27c-.107-1.705-1.407-3.005-3.113-3.112A93 93 0 0 0 12 3a93 93 0 0 0-5.73.158c-1.705.107-3.005 1.407-3.112 3.113A93 93 0 0 0 3 12c0 2.472.073 4.361.158 5.73c.107 1.705 1.407 3.005 3.113 3.112C7.639 20.927 9.528 21 12 21s4.361-.073 5.73-.158c1.705-.107 3.005-1.407 3.112-3.113c.085-1.368.158-3.257.158-5.729a92 92 0 0 0-.158-5.73m0 24c-.107-1.705-1.407-3.005-3.113-3.112A92 92 0 0 0 12 27a93 93 0 0 0-5.73.158c-1.705.107-3.005 1.407-3.112 3.113C3.073 31.639 3 33.529 3 36s.073 4.361.158 5.73c.107 1.705 1.407 3.005 3.113 3.112C7.639 44.927 9.528 45 12 45s4.361-.073 5.73-.158c1.705-.107 3.005-1.407 3.112-3.113c.085-1.368.158-3.258.158-5.729s-.073-4.361-.158-5.73M27.05 5.234c.055-.629.54-1.039 1.17-1.08C29.32 4.085 31.563 4 36 4s6.68.084 7.78.155c.63.04 1.114.45 1.17 1.079c.03.321.05.736.05 1.266s-.02.945-.05 1.266c-.056.629-.54 1.039-1.17 1.08c-1.1.07-3.343.154-7.78.154s-6.68-.084-7.78-.155c-.63-.04-1.114-.45-1.17-1.079C27.02 7.445 27 7.03 27 6.5s.02-.945.05-1.266m-.02 11.046c.037-.65.5-1.108 1.149-1.156C29.007 15.062 30.467 15 33 15s3.993.062 4.821.124c.65.048 1.112.506 1.149 1.155c.017.315.03.716.03 1.221s-.013.906-.03 1.22c-.037.65-.5 1.108-1.149 1.156c-.828.062-2.288.124-4.821.124s-3.993-.062-4.821-.124c-.65-.049-1.112-.506-1.149-1.156c-.018-.314-.03-.715-.03-1.22s.013-.906.03-1.22m0 24c.037-.65.5-1.107 1.149-1.156C29.007 39.062 30.467 39 33 39s3.993.062 4.821.124c.65.049 1.112.506 1.149 1.156c.017.314.03.715.03 1.22s-.013.906-.03 1.22c-.037.65-.5 1.108-1.149 1.156c-.828.062-2.288.124-4.821.124s-3.993-.062-4.821-.124c-.65-.049-1.112-.506-1.149-1.156c-.018-.314-.03-.715-.03-1.22s.013-.906.03-1.22m.02-11.046c.055-.629.54-1.039 1.17-1.08c1.1-.07 3.343-.154 7.78-.154s6.68.084 7.78.155c.63.04 1.114.45 1.17 1.079c.03.321.05.736.05 1.266s-.02.945-.05 1.266c-.056.629-.54 1.039-1.17 1.08c-1.1.07-3.343.154-7.78.154s-6.68-.084-7.78-.155c-.63-.04-1.114-.45-1.17-1.079c-.03-.321-.05-.736-.05-1.266s.02-.945.05-1.266"/></svg>`,
        },
        {
          name: 'Usuarios',
          path: '/admin/users',
          icon: `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"18\" height=\"18\" viewBox=\"0 0 48 48\"><g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"3\"><path d=\"M26.195 29.58c.146-1.652 1.173-2.97 2.815-3.202C30.448 26.175 32.656 26 36 26s5.552.175 6.99.378c1.642.232 2.67 1.55 2.814 3.202A51 51 0 0 1 46 34c0 4.514-2.383 8.738-6.396 10.804C38.263 45.494 36.954 46 36 46s-2.263-.506-3.604-1.196C28.382 42.738 26 38.514 26 34c0-1.708.091-3.233.195-4.42\"/><path d=\"m32.5 34.767l3.294 3.733l4.706-7m-17.553-7.673A11 11 0 0 0 29 14c0-6.075-4.925-11-11-11S7 7.925 7 14a11 11 0 0 0 6.053 9.827c-5.017 1.736-8.818 6.038-9.803 11.319c-.318 1.706.675 3.1 2.397 3.323C7.742 38.74 11.457 39 18 39q1.611 0 3-.02\"/></g></svg>`,
        },
        {
          name: 'Productos',
          path: '/admin/products',
          icon: `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"18\" height=\"18\" viewBox=\"0 0 48 48\"><g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-width=\"3\"><path stroke-linejoin=\"round\" d=\"M40.29 36.31c1.239.442 2.21 1.353 2.21 2.69c0 2.803-2.713 4.698-5.515 4.8c-2.804.104-7.014.2-12.985.2s-10.18-.096-12.985-.2C8.213 43.699 5.5 41.804 5.5 39c0-1.337.972-2.248 2.211-2.69\"/><path d=\"M3.92 28.905a4.93 4.93 0 0 0-.913 3.035c.027.835.14 1.708.408 2.495c.63 1.855 2.901 1.946 4.858 1.855c1.038-.048 2.142.038 2.945.454c3.23 1.674 6.578 1.674 9.808 0c2.022-1.048 3.925-1.048 5.947 0c3.23 1.674 6.578 1.674 9.809 0c.803-.416 1.906-.502 2.944-.454c1.957.09 4.228 0 4.858-1.855a7 7 0 0 0 .185-.656c.391-1.707-.084-3.428-1.093-4.708\"/><path stroke-linejoin=\"round\" d=\"M5.5 16.5c0-6.856 5.382-12.174 12.233-12.402C19.563 4.038 21.645 4 24 4s4.437.037 6.267.098C37.117 4.326 42.5 9.644 42.5 16.5c0 1.26-.1 2.394-.232 3.343c-.268 1.929-1.774 3.311-3.708 3.534c-2.6.3-7.126.623-14.56.623s-11.96-.323-14.56-.623c-1.934-.223-3.44-1.605-3.708-3.534A24 24 0 0 1 5.5 16.5\"/><path d=\"m6.949 22.238l-.592.025c-1.543.067-3.014.76-3.253 2.286C3.04 24.959 3 25.439 3 26s.04 1.042.104 1.452c.24 1.526 1.71 2.219 3.253 2.286C9.02 29.854 14.31 30 24 30c9.3 0 14.546-.135 17.308-.248c1.751-.072 3.419-.903 3.629-2.643q.061-.495.063-1.109c0-.41-.024-.778-.063-1.108c-.21-1.74-1.878-2.572-3.628-2.643l-.258-.01M36.5 15H36m-5.5-4H30m-1 7h.5\"/></g></svg>`,
        },
        {
          name: 'Mesas',
          path: '/admin/tables',
          icon: `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"18\" height=\"18\" viewBox=\"0 0 48 48\"><g fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"3\"><path d=\"M44.93 32.086c-.123-1.143-1.11-1.782-2.258-1.829C40.138 30.153 34.596 30 24 30s-16.138.154-18.672.257c-1.149.047-2.135.686-2.259 1.83c-.042.388-.069.855-.069 1.413s.027 1.025.07 1.414c.123 1.143 1.11 1.782 2.258 1.829C7.862 36.846 13.404 37 24 37s16.138-.154 18.672-.257c1.149-.047 2.135-.686 2.259-1.83c.042-.388.069-.855.069-1.413s-.027-1.025-.07-1.414\"/><path d=\"M44.93 32.086c-.123-1.143-1.11-1.782-2.258-1.829C40.138 30.153 34.596 30 24 30s-16.138.154-18.672.257c-1.149.047-2.135.686-2.259 1.83c-.042.388-.069.855-.069 1.413s.027 1.025.07 1.414c.123 1.143 1.11 1.782 2.258 1.829C7.862 36.846 13.404 37 24 37s16.138-.154 18.672-.257c1.149-.047 2.135-.686 2.259-1.83c.042-.388.069-.855.069-1.413s-.027-1.025-.07-1.414M41.875 12.07c-.11-1.471-1.233-2.51-2.703-2.629C36.709 9.241 32.062 9 24 9c-8.061 0-12.71.242-15.172.441c-1.47.12-2.592 1.158-2.703 2.629A53 53 0 0 0 6 16c0 1.704.054 2.984.125 3.93c.11 1.471 1.233 2.51 2.703 2.629c2.463.2 7.11.441 15.172.441c8.061 0 12.71-.242 15.172-.441c1.47-.12 2.592-1.158 2.703-2.629A53 53 0 0 0 42 16a53 53 0 0 0-.125-3.93\"/><path d=\"M9.076 22.578A110 110 0 0 0 9 27c0 1.247.014 2.285.035 3.142m4.899-7.302c.037 1.014.065 2.37.065 4.16c0 1.206-.013 2.216-.032 3.056m20.099-7.216A113 113 0 0 0 34 27c0 1.206.013 2.216.033 3.056m4.891-7.478c.042 1.038.075 2.473.075 4.422c0 1.247-.013 2.285-.034 3.142m-33.96 6.571Q5 37.315 5 37.999c0 2.384.05 4 .105 5.06c.057 1.092.813 1.913 1.907 1.936a24 24 0 0 0 .976 0c1.094-.023 1.85-.844 1.907-1.936c.055-1.06.105-2.675.105-5.06q0-.59-.004-1.12m28.008 0q-.004.53-.004 1.12c0 2.384.05 4 .105 5.06c.057 1.092.813 1.913 1.907 1.936a24 24 0 0 0 .976 0c1.094-.023 1.85-.844 1.907-1.936c.055-1.06.105-2.675.105-5.06q0-.684-.005-1.286\"/></g></svg>`,
        },
        {
          name: 'Impuestos',
          path: '/admin/taxes',
          icon: `<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"18\" height=\"18\" viewBox=\"0 0 48 48\"><path fill=\"none\" stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"3\" d=\"M33 3.174c-1.89-.075-4.052-.132-6.5-.158m-6 0c-2.449.026-4.61.083-6.5.158m-6 .345l-.24.02c-2.556.207-4.514 2.165-4.721 4.72l-.02.24M39 3.52l.241.02c2.556.207 4.513 2.165 4.721 4.72l.02.24M39 44.48l.24-.019c2.556-.208 4.513-2.165 4.721-4.72l.02-.241M26.5 44.984a228 228 0 0 0 6.5-.158m-19 0c1.89.074 4.051.132 6.5.158M8 44.48l-.24-.019c-2.556-.208-4.514-2.165-4.721-4.72l-.02-.241m-.345-25c-.075 1.89-.132 4.051-.158 6.5m0 6c.026 2.448.083 4.61.158 6.5M44.484 21c-.026-2.449-.084-4.61-.158-6.5m0 19c.074-1.89.132-4.052.158-6.5m-10.602 7.808Q35 33.615 35 31.486q0-2.1-1.118-3.294Q32.764 27.001 31 27q-1.789 0-2.907 1.192Q27 29.385 27 31.486q0 2.13 1.093 3.322Q29.211 35.999 31 36q1.764 0 2.882-1.192m-14-15Q21 18.615 21 16.486q0-2.1-1.118-3.294Q18.764 12.001 17 12q-1.79 0-2.907 1.192Q13 14.384 13 16.486q0 2.13 1.093 3.322Q15.21 20.999 17 21q1.764 0 2.882-1.192M34 14L14 34\"/></svg>`,
        },
      ],
    },
    {
      icon: `<svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3"><path d="M29.368 3.08c.897.28 3.777 1.422 7.937 5.479c3.92 3.823 5.187 6.538 5.559 7.57C42.947 18.37 43 20.98 43 24c0 8.065-.375 13.204-.717 16.214c-.25 2.202-1.903 3.848-4.103 4.105c-2.815.329-7.413.681-14.18.681s-11.365-.352-14.18-.68c-2.2-.258-3.853-1.904-4.103-4.106C5.375 37.204 5 32.064 5 24s.375-13.204.717-16.214C5.967 5.584 7.62 3.938 9.82 3.68C12.635 3.353 17.233 3 24 3c1.97 0 3.756.03 5.368.08M13 37h22m-22-7h22"/><path d="M13 22.868c2.572-3.93 4.717-5.656 5.896-6.38c.557-.343 1.23-.119 1.52.468c.663 1.345 1.29 3.193 1.737 4.66c.264.86 1.52 1.045 2.073.335C26.452 19.095 29.5 16.5 29.5 16.5m4.067 1.82c.44-2.324.457-4.363.42-5.443a.89.89 0 0 0-.864-.865a25.5 25.5 0 0 0-5.444.42c-.754.143-1.004 1.062-.46 1.605l4.744 4.745c.543.543 1.461.293 1.604-.461"/></g></svg>`,
      name: 'Reportes',
      subItems: [
        {
          name: 'Historial de órdenes',
          path: '/admin/orders',
          icon: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3"><path d="M38.872 15.507c-.351-.98-1.549-3.567-5.268-7.213c-3.941-3.864-6.67-4.952-7.52-5.218A162 162 0 0 0 21 3c-6.264 0-10.566.32-13.248.627c-2.201.252-3.85 1.903-4.092 4.105C3.34 10.622 3 15.473 3 23s.341 12.378.66 15.268c.242 2.202 1.891 3.853 4.092 4.105c1.898.217 4.607.44 8.248.553"/><path d="M38.886 15.958c-2.087.311-5.841.072-8.69-.191a4.664 4.664 0 0 1-4.229-4.211c-.268-2.802-.506-6.466-.18-8.488M41 34.258s-.473-2.108-3.312-4.946C34.85 26.473 32.742 26 32.742 26M10 13l4 4l5-7m-9 14l4 4l5-7"/><path d="M43.665 31.592c1.454-1.453 2.01-3.577.794-5.235a18 18 0 0 0-1.77-2.046c-.74-.74-1.43-1.318-2.047-1.77c-1.657-1.216-3.781-.66-5.235.793l-12.34 12.34c-.543.544-.915 1.233-.979 2c-.087 1.041-.151 2.81.017 5.428a1.92 1.92 0 0 0 1.793 1.793c2.617.168 4.387.104 5.428.016c.766-.064 1.456-.435 2-.98z"/></g></svg>`,
        },
        {
          name: 'Historial de caja',
          path: '/admin/cash-history',
          icon: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3"><path d="M44.487 36.822c-.216 2.553-2.19 4.485-4.744 4.677C36.515 41.744 31.364 42 24 42s-12.515-.257-15.743-.5c-2.555-.193-4.528-2.125-4.743-4.678C3.259 33.81 3 29.117 3 22.5s.26-11.31.514-14.322C3.729 5.625 5.702 3.693 8.257 3.5C11.485 3.257 16.636 3 24 3s12.515.257 15.743.5c2.555.193 4.528 2.125 4.743 4.678c.255 3.012.514 7.705.514 14.322s-.26 11.31-.513 14.322"/><path d="M10.399 12.715c.125-1.273 1.117-2.235 2.393-2.34C14.862 10.207 18.507 10 24 10s9.138.206 11.208.376c1.276.104 2.268 1.066 2.394 2.34c.185 1.881.398 5.071.398 9.784s-.213 7.903-.398 9.785c-.126 1.273-1.118 2.235-2.394 2.34c-2.07.169-5.715.375-11.208.375s-9.138-.206-11.208-.376c-1.276-.104-2.268-1.066-2.393-2.34c-.186-1.88-.399-5.07-.399-9.784s.213-7.903.399-9.785"/><path d="M24 29.5a7 7 0 1 0 0-14a7 7 0 1 0 0 14M40 17h-4m4 11h-4m-8-5.5h3"/></g></svg>`,
        },
      ],
    },
  ];
  userNavItems: NavItem[] = [
    {
      icon: `<svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3"><path d="M44.93 32.086c-.123-1.143-1.11-1.782-2.258-1.829C40.138 30.153 34.596 30 24 30s-16.138.154-18.672.257c-1.149.047-2.135.686-2.259 1.83c-.042.388-.069.855-.069 1.413s.027 1.025.07 1.414c.123 1.143 1.11 1.782 2.258 1.829C7.862 36.846 13.404 37 24 37s16.138-.154 18.672-.257c1.149-.047 2.135-.686 2.259-1.83c.042-.388.069-.855.069-1.413s-.027-1.025-.07-1.414"/><path d="M44.93 32.086c-.123-1.143-1.11-1.782-2.258-1.829C40.138 30.153 34.596 30 24 30s-16.138.154-18.672.257c-1.149.047-2.135.686-2.259 1.83c-.042.388-.069.855-.069 1.413s.027 1.025.07 1.414c.123 1.143 1.11 1.782 2.258 1.829C7.862 36.846 13.404 37 24 37s16.138-.154 18.672-.257c1.149-.047 2.135-.686 2.259-1.83c.042-.388.069-.855.069-1.413s-.027-1.025-.07-1.414M41.875 12.07c-.11-1.471-1.233-2.51-2.703-2.629C36.709 9.241 32.062 9 24 9c-8.061 0-12.71.242-15.172.441c-1.47.12-2.592 1.158-2.703 2.629A53 53 0 0 0 6 16c0 1.704.054 2.984.125 3.93c.11 1.471 1.233 2.51 2.703 2.629c2.463.2 7.11.441 15.172.441c8.061 0 12.71-.242 15.172-.441c1.47-.12 2.592-1.158 2.703-2.629A53 53 0 0 0 42 16a53 53 0 0 0-.125-3.93"/><path d="M9.076 22.578A110 110 0 0 0 9 27c0 1.247.014 2.285.035 3.142m4.899-7.302c.037 1.014.065 2.37.065 4.16c0 1.206-.013 2.216-.032 3.056m20.099-7.216A113 113 0 0 0 34 27c0 1.206.013 2.216.033 3.056m4.891-7.478c.042 1.038.075 2.473.075 4.422c0 1.247-.013 2.285-.034 3.142m-33.96 6.571Q5 37.315 5 37.999c0 2.384.05 4 .105 5.06c.057 1.092.813 1.913 1.907 1.936a24 24 0 0 0 .976 0c1.094-.023 1.85-.844 1.907-1.936c.055-1.06.105-2.675.105-5.06q0-.59-.004-1.12m28.008 0q-.004.53-.004 1.12c0 2.384.05 4 .105 5.06c.057 1.092.813 1.913 1.907 1.936a24 24 0 0 0 .976 0c1.094-.023 1.85-.844 1.907-1.936c.055-1.06.105-2.675.105-5.06q0-.684-.005-1.286"/></g></svg>`,
      name: 'Mesas',
      path: '/user/tables',
    },
    {
      icon: `<svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 48 48"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M32.209 3.139c3.84 2.852 9.207 10.715 9.747 22.858c.056 1.257-.556 2.448-1.698 2.978c-.815.378-1.917.808-3.305 1.174a1.03 1.03 0 0 0-.77 1.135l1.226 8.578c.34 2.383-.593 4.518-2.915 5.157c-2.17.598-4.494-.844-4.494-3.096V4.506c0-1.284 1.178-2.132 2.209-1.367M21.945 5.358c.46 2.718 1.104 7.467 1.052 12.538c-.026 2.617-1.774 4.962-4.522 5.578c-.568.127-1.173.242-1.805.331l1.844 15.98c.28 2.432-1.226 4.817-3.652 5.145A7 7 0 0 1 14 45c-.243 0-.538-.026-.863-.07c-2.425-.328-3.931-2.713-3.65-5.145l1.843-15.98a23 23 0 0 1-1.804-.33c-2.749-.617-4.497-2.963-4.524-5.58c-.051-5.07.591-9.818 1.051-12.536C6.287 3.974 7.499 3 8.903 3h10.192c1.405 0 2.616.973 2.85 2.358M11.5 3L11 14m5.5-11l.5 11"/></svg>`,
      name: 'Órdenes',
      path: '/user/orders',
    },
    {
      icon: `<svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3"><path d="M44.487 36.822c-.216 2.553-2.19 4.485-4.744 4.677C36.515 41.744 31.364 42 24 42s-12.515-.257-15.743-.5c-2.555-.193-4.528-2.125-4.743-4.678C3.259 33.81 3 29.117 3 22.5s.26-11.31.514-14.322C3.729 5.625 5.702 3.693 8.257 3.5C11.485 3.257 16.636 3 24 3s12.515.257 15.743.5c2.555.193 4.528 2.125 4.743 4.678c.255 3.012.514 7.705.514 14.322s-.26 11.31-.513 14.322"/><path d="M10.399 12.715c.125-1.273 1.117-2.235 2.393-2.34C14.862 10.207 18.507 10 24 10s9.138.206 11.208.376c1.276.104 2.268 1.066 2.394 2.34c.185 1.881.398 5.071.398 9.784s-.213 7.903-.398 9.785c-.126 1.273-1.118 2.235-2.394 2.34c-2.07.169-5.715.375-11.208.375s-9.138-.206-11.208-.376c-1.276-.104-2.268-1.066-2.393-2.34c-.186-1.88-.399-5.07-.399-9.784s.213-7.903.399-9.785"/><path d="M24 29.5a7 7 0 1 0 0-14a7 7 0 1 0 0 14M40 17h-4m4 11h-4m-8-5.5h3M38 42v3m-28-3v3"/></g></svg>`,
      name: 'Caja',
      path: '/user/cash',
    },
    {
      icon: `<svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="3"><path stroke-linejoin="round" d="M31.568 7.127A9 9 0 0 0 24 3a9 9 0 0 0-7.568 4.127A8 8 0 1 0 8.72 20.67a479 479 0 0 0 2.18 21.55c.17 1.36 1.251 2.4 2.62 2.488C15.606 44.842 19.1 45 24 45s8.394-.158 10.48-.293c1.369-.088 2.45-1.128 2.62-2.488a479 479 0 0 0 2.18-21.549a8 8 0 1 0-7.712-13.543"/><path stroke-linejoin="round" d="M37.753 37.363c-2.557-.133-6.836-.265-13.753-.265s-11.197.132-13.753.265"/><path d="m19 21l1 8m9-8l-1 8"/></g></svg>`,
      name: 'Cocina',
      path: '/user/kitchen',
    },
    // Placeholder: Reservations will be conditionally added in renderMenu for ADMIN/Cajero
  ];

  openSubmenu: string | null | number = null;
  subMenuHeights: { [key: string]: number } = {};
  @ViewChildren('subMenu') subMenuRefs!: QueryList<ElementRef>;

  readonly isExpanded$;
  readonly isMobileOpen$;
  readonly isHovered$;

  private subscription: Subscription = new Subscription();

  constructor(
    public sidebarService: SidebarService,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {
    this.isExpanded$ = this.sidebarService.isExpanded$;
    this.isMobileOpen$ = this.sidebarService.isMobileOpen$;
    this.isHovered$ = this.sidebarService.isHovered$;
  }

  ngOnInit() {
    this.renderMenu();
    // Subscribe to router events
    this.subscription.add(
      this.router.events.subscribe((event: any) => {
        if (event instanceof NavigationEnd) {
          this.setActiveMenuFromRoute(this.router.url);
        }
      }),
    );

    // Subscribe to combined observables to close submenus when all are false
    this.subscription.add(
      combineLatest([
        this.isExpanded$,
        this.isMobileOpen$,
        this.isHovered$,
      ]).subscribe(([isExpanded, isMobileOpen, isHovered]) => {
        if (!isExpanded && !isMobileOpen && !isHovered) {
          // this.openSubmenu = null;
          // this.savedSubMenuHeights = { ...this.subMenuHeights };
          // this.subMenuHeights = {};
          this.cdr.detectChanges();
        } else {
          // Restore saved heights when reopening
          // this.subMenuHeights = { ...this.savedSubMenuHeights };
          // this.cdr.detectChanges();
        }
      }),
    );

    // Initial load
    this.setActiveMenuFromRoute(this.router.url);
  }

  ngOnDestroy() {
    // Clean up subscriptions
    this.subscription.unsubscribe();
  }

  isActive(path: string): boolean {
    return this.router.url === path;
  }

  isAnyChildActive(subItems?: { name: string; path: string }[]): boolean {
    if (!subItems) return false;
    return subItems.some((item) => this.router.url.startsWith(item.path));
  }

  toggleSubmenu(section: string, index: number) {
    const key = `${section}-${index}`;

    if (this.openSubmenu === key) {
      this.openSubmenu = null;
      this.subMenuHeights[key] = 0;
    } else {
      this.openSubmenu = key;

      setTimeout(() => {
        const el = document.getElementById(key);
        if (el) {
          this.subMenuHeights[key] = el.scrollHeight;
          this.cdr.detectChanges(); // Ensure UI updates
        }
      });
    }
  }

  onSidebarMouseEnter() {
    this.isExpanded$
      .subscribe((expanded: any) => {
        if (!expanded) {
          this.sidebarService.setHovered(true);
        }
      })
      .unsubscribe();
  }

  private setActiveMenuFromRoute(currentUrl: string) {
    const menuGroups = [{ items: this.navItems, prefix: 'main' }];

    menuGroups.forEach((group) => {
      group.items().forEach((nav, i) => {
        if (nav.subItems) {
          nav.subItems.forEach((subItem: any) => {
            if (currentUrl === subItem.path) {
              const key = `${group.prefix}-${i}`;
              this.openSubmenu = key;

              setTimeout(() => {
                const el = document.getElementById(key);
                if (el) {
                  this.subMenuHeights[key] = el.scrollHeight;
                  this.cdr.detectChanges(); // Ensure UI updates
                }
              });
            }
          });
        }
      });
    });
  }

  onSubmenuClick() {
    this.isMobileOpen$
      .subscribe((isMobile: any) => {
        if (isMobile) {
          this.sidebarService.setMobileOpen(false);
        }
      })
      .unsubscribe();
  }

  renderMenu(branchId?: string) {
    let myMenu: NavItem[] = [];

    // Special case: Repartidor role users get custom menu
    if (this.myRole.includes('Repartidor') && this.myRole.length === 1) {
      myMenu = [
        {
          icon: `<svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3"><path d="M12 10h24l4 8H8l4-8Zm-4 8h32v18a4 4 0 0 1-4 4H12a4 4 0 0 1-4-4V18Zm8 6h12m-12 7h8"/></g></svg>`,
          name: 'Mis Entregas',
          path: '/delivery',
        },
        {
          icon: `<svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/><path d="M45 24c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="36" cy="24" r="3"/><path d="M33 38c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="24" cy="38" r="3"/></g></svg>`,
          name: 'Ruta',
          path: '/delivery/route-ol',
        },
      ];
      this.navItems.set(myMenu);
      return;
    }

    const regularUserRoles = ['Mesero', 'Cajero', 'Cocina'];
    const hasRegularUserRole = this.myRole.some((role) =>
      regularUserRoles.includes(role),
    );
    const shouldShowUserMenu =
      hasRegularUserRole || this.myRole.includes('Admin');

    if (this.myRole.length > 0) {
      const appendNavItems = (items: NavItem[]) => {
        items.forEach((item) => {
          const exists = myMenu.some((menuItem) => {
            const currentKey = menuItem.path ?? menuItem.name;
            const incomingKey = item.path ?? item.name;
            return currentKey === incomingKey;
          });
          if (!exists) {
            myMenu.push(item);
          }
        });
      };

      if (this.myRole.includes('Super')) {
        appendNavItems(this.superNavItems);
      }
      if (this.myRole.includes('Admin')) {
        appendNavItems(this.adminNavItems);
      }
      if (shouldShowUserMenu) {
        appendNavItems(this.userNavItems);
      }

      // Conditionally inject Reservations (ADMIN & Cajero only)
      const hasReservationRole =
        this.myRole.includes('Admin') || this.myRole.includes('Cajero');
      if (hasReservationRole) {
        const reservationsKey = '/user/reservations';
        const exists = myMenu.some(
          (i) => (i.path ?? i.name) === reservationsKey,
        );
        if (!exists) {
          myMenu.push({
            icon: `<svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 48 48"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3"><path d="M8 8h32v8H8z"/><path d="M8 20h32v20H8z"/><path d="M16 24v8m8-8v8m8-8v8"/></g></svg>`,
            name: 'Reservas',
            path: '/user/reservations',
          });
        }
      }
    }
    this.navItems.set(myMenu);
  }
}


