import { FrameworkConfiguration, PLATFORM } from 'aurelia-framework';
import { UxGrid } from './ux-grid';
import { UxGridCell } from './ux-grid-cell';

export { UxResponsiveUtilities } from './ux-responsive-utilities';
export { UxGridTheme } from './ux-grid-theme';
export { UxGrid, UxGridCell };

export function configure(config: FrameworkConfiguration) {
  config.globalResources([
    PLATFORM.moduleName('./ux-grid'),
    PLATFORM.moduleName('./ux-grid-cell')
  ]);
}
