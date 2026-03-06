import { CommonModule } from '@angular/common';
import { Component, inject, computed } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'app-user-dropdown',
  imports: [CommonModule, RouterModule],
  templateUrl: './user-dropdown.component.html',
})
export class UserDropdownComponent {
  auth = inject(AuthService);

  // Compute user initials from name
  userInitials = computed(() => {
    const name = this.auth.me()?.fullName || '';
    return this.getInitials(name);
  });

  private getInitials(name: string): string {
    if (!name) return '?';

    const words = name.trim().split(/\s+/);

    if (words.length === 1) {
      // Single word: return first 2 characters
      return words[0].substring(0, 2).toUpperCase();
    }

    // Multiple words: return first letter of first two words
    return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
  }

  logout() {
    this.auth.logout();
  }
}
