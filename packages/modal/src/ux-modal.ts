import { UxModalService, UxModalServiceResult } from './ux-modal-service';
import { customElement, bindable } from 'aurelia-templating';
import { inject } from 'aurelia-dependency-injection';
import { StyleEngine, UxComponent } from '@aurelia-ux/core';
import { UxModalTheme } from './ux-modal-theme';
import { TaskQueue } from 'aurelia-framework';
import { PLATFORM, DOM } from 'aurelia-pal';
import { getLogger } from 'aurelia-logging';
import { UxModalPosition, UxModalKeybord, UxDefaultModalConfiguration } from './ux-modal-configuration';

const log = getLogger('ux-modal');

@inject(Element, StyleEngine, UxModalService, TaskQueue, UxDefaultModalConfiguration)
@customElement('ux-modal')
export class UxModal implements UxComponent {

  @bindable public position: UxModalPosition = 'center';
  @bindable public host: 'body' | HTMLElement | false | string = 'body';
  @bindable public modalBreakpoint: number = 768;
  @bindable public theme: UxModalTheme;
  @bindable public overlayDismiss: boolean = true;
  @bindable public outsideDismiss: boolean = true;
  @bindable public lock: boolean = true;
  @bindable public keyboard: UxModalKeybord = ['Escape'];
  @bindable public restoreFocus?: (lastActiveElement: HTMLElement) => void= (lastActiveElement: HTMLElement) => {
    lastActiveElement.focus();
  }
  @bindable public openingCallback?: (contentWrapperElement?: HTMLElement, overlayElement?: HTMLElement) => void;

  // Aria attributes
  @bindable public role: 'dialog' | 'alertdialog' = 'dialog';
  @bindable public ariaLabelledby: string = '';
  @bindable public ariaDescribedby: string = '';

  public lastActiveElement?: HTMLElement;

  private handlingEvent: boolean = false;
  public viewportType: 'mobile' | 'desktop' = 'desktop';

  // Will be populated by `ref="...."` in template
  private overlayElement: HTMLElement;
  private contentWrapperElement: HTMLElement;
  public contentElement: HTMLElement;

  private showed: boolean = false;
  private showing: boolean = false;
  private hiding: boolean = false;
  private bindingContext: any;

  constructor(
    public element: HTMLElement,
    private styleEngine: StyleEngine,
    private modalService: UxModalService,
    private taskQueue: TaskQueue,
    private defaultConfig: UxDefaultModalConfiguration) {
    if (this.defaultConfig.modalBreakpoint !== undefined) {
      this.modalBreakpoint = this.defaultConfig.modalBreakpoint;
    }
    if (this.defaultConfig.host !== undefined) {
      this.host = this.defaultConfig.host;
    }
    if (this.defaultConfig.overlayDismiss !== undefined) {
      this.overlayDismiss = this.defaultConfig.overlayDismiss;
    }
    if (this.defaultConfig.outsideDismiss !== undefined) {
      this.outsideDismiss = this.defaultConfig.outsideDismiss;
    }
    if (this.defaultConfig.lock !== undefined) {
      this.lock = this.defaultConfig.lock;
    }
    if (this.defaultConfig.position !== undefined) {
      this.position = this.defaultConfig.position;
    }
    if (this.defaultConfig.keyboard !== undefined) {
      this.keyboard = this.defaultConfig.keyboard;
    }
    if (this.defaultConfig.theme !== undefined) {
      this.theme = this.defaultConfig.theme;
    }
  }

  public bind(bindingContext: any) {
    this.bindingContext = bindingContext;
    this.themeChanged(this.theme);
    this.setViewportType();
    window.addEventListener('resize', this);
    this.positionChanged();
    this.modalBreakpointChanged();
    this.hostChanged();
    this.overlayDismissChanged();
    this.outsideDismissChanged();
    this.lockChanged();
    this.keyboardChanged();
  }

  public positionChanged() {
    if (!this.position && this.defaultConfig.position) {
      this.position = this.defaultConfig.position;
    }
  }

  public modalBreakpointChanged() {
    if (typeof this.modalBreakpoint !== 'number' && this.defaultConfig.modalBreakpoint) {
      this.modalBreakpoint = this.defaultConfig.modalBreakpoint;
    }
  }

  public hostChanged() {
    if (this.host === false || this.host === 'body' || this.host instanceof HTMLElement) {
      return;
    }
    if (this.defaultConfig.host !== undefined) {
      this.host = this.defaultConfig.host;
      return;
    }
    if (this.host === '') {
      this.host = 'body';
    }
  }

  public overlayDismissChanged() {
    if (!this.overlayDismiss && this.defaultConfig.overlayDismiss) {
      this.overlayDismiss = this.defaultConfig.overlayDismiss;
    }
  }

  public outsideDismissChanged() {
    if (!this.outsideDismiss && this.defaultConfig.outsideDismiss) {
      this.outsideDismiss = this.defaultConfig.outsideDismiss;
    }
  }

  public lockChanged() {
    if (!this.lock && this.defaultConfig.lock !== undefined) {
      this.lock = this.defaultConfig.lock;
    }
    this.setZindex();
  }

  public keyboardChanged() {
    if (!this.keyboard && this.defaultConfig.keyboard) {
      this.keyboard = this.defaultConfig.keyboard;
    }
  }

  public attached() {
    if (this.host) {
      this.moveToHost();
    }
    this.show();
  }

  public detached() {
    if (this.host) {
      this.removeFromHost();
    }
  }

  private show() {
    if (this.showing && this.showed) {
      return;
    }
    if (document.activeElement instanceof HTMLElement) {
      this.lastActiveElement = document.activeElement;
    }
    if (this.openingCallback) {
      this.openingCallback.call(this, this.contentWrapperElement, this.overlayElement);
    }
    this.showing = true;
    this.modalService.addLayer(this, this.bindingContext);
    this.setZindex();
    // We rely on `queueTask()` here to make sure the
    // element is completely ready with all CSS set
    // before to set `showed = true` which will start
    // the CSS transition to bring the modal to the
    // screen
    this.taskQueue.queueTask(() => {
      this.showed = true;
      const duration = this.getAnimationDuration();
      setTimeout(() => {
        this.showing = false;
      }, duration);
    });
  }

  private async hide() {
    if (this.hiding || !this.showed) {return;}
    this.hiding = true;
    const duration = this.getAnimationDuration();
    this.showed = false;
    return new Promise((resolve) => {
      setTimeout(() => {
        this.modalService.removeLayer(this);
        this.hiding = false;
        if (this.lastActiveElement && typeof this.restoreFocus === 'function') {
          this.restoreFocus(this.lastActiveElement);
        }
        resolve();
      }, duration);
    });
  }

  private setZindex() {
    if (this.overlayElement) {
      this.overlayElement.style.zIndex = `${this.modalService.zIndex}`;
    }
    this.contentWrapperElement.style.zIndex = `${this.modalService.zIndex}`;
  }

  private moveToHost() {
    const host = this.getHost();
    if (!host) {
      return;
    }
    host.appendChild(this.element);
  }

  private removeFromHost() {
    // TODO: make sure we dont' need to bring back the element to its original position
    // before to remove it. Seems ok to keep it like this, but we decided to keep
    // an eye on it. See GH comment (18.04.2020 : https://github.com/aurelia/ux/pull/246#discussion_r410664303)
    const host = this.getHost();
    if (!host) {
      return;
    }
    try {
      host.removeChild(this.element);
    } catch (e) {
      // if error, it's because the child is already removed
    }
  }

  private getHost(): Element | null {
    if (this.host === 'body') {
      return document.body;
    } else if (this.host instanceof HTMLElement) {
      return this.host;
    } else if (typeof this.host === 'string') {
      return document.querySelector(this.host);
    }
    return null;
  }

  public unbind() {
    window.removeEventListener('resize', this);
  }

  public handleEvent() {
    if (this.handlingEvent) {
      return;
    }
    this.handlingEvent = true;
    if (PLATFORM.global.requestAnimationFrame) {
      PLATFORM.global.requestAnimationFrame(() => {
        this.setViewportType();
        this.handlingEvent = false;
      });
    } else {
      setTimeout(() => {
        this.setViewportType();
        this.handlingEvent = false;
      }, 100);
    }
    this.setViewportType();
  }

  public themeChanged(newValue: any) {
    if (newValue != null && newValue.themeKey == null) {
      newValue.themeKey = 'modal';
    }

    this.styleEngine.applyTheme(newValue, this.element);
  }

  public setViewportType() {
    this.viewportType = window.innerWidth < this.modalBreakpoint ? 'mobile' : 'desktop';
  }

  public overlayClick(event: Event): any {
    for (const element of (event as any).composedPath() ) {
      if (element === this.contentElement) {
        return true; // this allow normal behvior when clicking on elements inside the modal
      }
    }
    if (!this.overlayDismiss) {
      event.stopPropagation();
      return;
    }
    this.dismiss();
  }

  public async dismiss(event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    if (this.showing) {
      return;
    }
    const result: UxModalServiceResult = {
      wasCancelled: true,
      output: undefined
    };
    if (!await this.prepareClosing(result)) {
      return;
    }
    await this.hide();
    const dismissEvent = DOM.createCustomEvent('dismiss', {bubbles: true});
    this.element.dispatchEvent(dismissEvent);
  }

  public async ok(output?: any, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    const result: UxModalServiceResult = {
      wasCancelled: false,
      output
    };
    if (!await this.prepareClosing(result)) {
      return;
    }
    await this.hide();
    const okEvent = DOM.createCustomEvent('ok', {bubbles: true, detail: result.output});
    this.element.dispatchEvent(okEvent);
  }

  private async prepareClosing(result: UxModalServiceResult): Promise<boolean> {
    const layer = this.modalService.getLayer(this);
    if (layer) {
      if (!await this.modalService.callCanDeactivate(layer, result)) {
        return false;
      }
      try {
        await this.modalService.callDetached(layer);
        await this.modalService.callDeactivate(layer, result);
      } catch (error) {
        log.error(error);
      }
    }
    return true;
  }

  public stop(event: Event) {
    event.stopPropagation();
  }

  private getAnimationDuration() {
    // In order to allow precise animation we allow different duration
    // value for animating the overlay and the drawer. In most cases it will
    // be the same value but we can imagine a fast overlay and slower modal
    // apearence for exemple
    // Because the duration is used to determine when we can safely assume the
    // modal appeared/disappeard, we only keep the maximum value.
    const overlayElementDuration: string = this.overlayElement
      ? window.getComputedStyle(this.overlayElement).transitionDuration || '0'
      : '0';
    const contentDuration: string = window.getComputedStyle(this.contentElement).transitionDuration || '0';
    // overlayElementDuration and contentDuration are string like '0.25s'
    return Math.max(parseFloat(overlayElementDuration), parseFloat(contentDuration)) * 1000;
  }
}
