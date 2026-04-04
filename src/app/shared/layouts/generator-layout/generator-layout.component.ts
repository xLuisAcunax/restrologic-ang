
import { Component } from '@angular/core';

@Component({
  selector: 'app-generator-layout',
  imports: [],
  templateUrl: './generator-layout.component.html',
})
export class GeneratorLayoutComponent {
  sidebarOpen = true;

  closeSidebar = () => {
    this.sidebarOpen = false;
  };
}
