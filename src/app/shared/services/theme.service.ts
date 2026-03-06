import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

type Theme = 'pastel' | 'dim';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  // private themeSubject = new BehaviorSubject<Theme>('pastel');
  // theme$ = this.themeSubject.asObservable();
  // constructor() {
  //   const savedTheme = (localStorage.getItem('theme') as Theme) || 'pastel';
  //   this.setTheme(savedTheme);
  // }
  // toggleTheme() {
  //   const newTheme = this.themeSubject.value === 'pastel' ? 'dim' : 'pastel';
  //   this.setTheme(newTheme);
  // }
  // setTheme(theme: Theme) {
  //   this.themeSubject.next(theme);
  //   localStorage.setItem('theme', theme);
  //   if (theme === 'dim') {
  //     document.documentElement.classList.add('dim');
  //     document.body.classList.add('dim:bg-gray-900');
  //   } else {
  //     document.documentElement.classList.remove('dim');
  //     document.body.classList.remove('dim:bg-gray-900');
  //   }
  // }
}
