/**
 * drawer.js — Zunifikowany system Drawer (ES Module)
 * 
 * Obsługuje wiele szuflad jednocześnie (stos), z-indexy i blokadę przewijania.
 */

import {
    acquireOverlayNavigationLock,
    releaseOverlayNavigationLock,
    hasVisibleBlockingOverlay,
} from './ui.js';

// ─── Stałe ────────────────────────────────────────────────────────────────────

const SIZES = { sm: 'drawer--sm', md: 'drawer--md', lg: 'drawer--lg', full: 'drawer--full' };
const MOBILE_DRAWER_QUERY = '(max-width: 639px)';
const DRAG_CLOSE_THRESHOLD = 96;
const DRAG_CLOSE_VELOCITY = 0.65;
const DRAG_FADE_DISTANCE = 360;

const FOCUSABLE = [
    'a[href]', 'button:not([disabled])', 'textarea:not([disabled])',
    'input:not([disabled])', 'select:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(', ');

// ─── Stan wewnętrzny ──────────────────────────────────────────────────────────

let _stack = []; // { overlay, panel, opts, id }
let _originalBodyOverflow = '';

// ─── Obsługa klawiatury (globalna) ─────────────────────────────────────────────

function _onKeyDown(e) {
    if (_stack.length === 0) return;
    const top = _stack[_stack.length - 1];

    if (e.key === 'Escape') {
        e.preventDefault();
        Drawer.close();
        return;
    }

    if (e.key === 'Tab') {
        const focusableEls = Array.from(top.panel.querySelectorAll(FOCUSABLE));
        if (focusableEls.length === 0) { e.preventDefault(); return; }

        const first = focusableEls[0];
        const last = focusableEls[focusableEls.length - 1];

        if (e.shiftKey) {
            if (document.activeElement === first) {
                e.preventDefault();
                last.focus();
            }
        } else {
            if (document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    }
}

document.addEventListener('keydown', _onKeyDown);

// ─── Pomocnicy ─────────────────────────────────────────────────────────────────

function _setContent(drawerObj, content) {
    const el = drawerObj.panel.querySelector('.u-drawer__content');
    if (!el) return;
    if (typeof content === 'string') {
        el.innerHTML = content;
    } else if (content instanceof HTMLElement) {
        el.innerHTML = '';
        el.appendChild(content);
    }
}

function _buildFooter(drawerObj) {
    const { panel, opts } = drawerObj;
    const footer = panel.querySelector('.u-drawer__footer');
    if (!footer) return;

    if (!opts.confirmLabel && !opts.cancelLabel) {
        footer.classList.add('u-drawer__footer--hidden');
        footer.innerHTML = '';
        return;
    }

    footer.classList.remove('u-drawer__footer--hidden');
    footer.innerHTML = '';

    if (opts.cancelLabel) {
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn-secondary rounded-xl u-drawer__footer-btn';
        cancelBtn.textContent = opts.cancelLabel;
        cancelBtn.onclick = () => {
            if (typeof opts.onCancel === 'function') opts.onCancel();
            Drawer.close();
        };
        footer.appendChild(cancelBtn);
    }

    if (opts.confirmLabel) {
        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.id = `u-drawer-confirm-${drawerObj.id}`;
        confirmBtn.className = 'btn-primary rounded-xl u-drawer__footer-btn';
        confirmBtn.textContent = opts.confirmLabel;
        confirmBtn.onclick = async () => {
            if (typeof opts.onConfirm === 'function') {
                Drawer.showConfirmLoading();
                try {
                    await opts.onConfirm();
                } catch (e) {
                    console.error('Drawer confirm error:', e);
                } finally {
                    Drawer.hideConfirmLoading();
                }
            }
        };
        footer.appendChild(confirmBtn);
    }
}

function _isMobileDrawer() {
    return typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia(MOBILE_DRAWER_QUERY).matches;
}

function _resetDragStyles(drawerObj) {
    drawerObj.panel.classList.remove('u-drawer--dragging');
    drawerObj.panel.style.transition = '';
    drawerObj.panel.style.transform = '';
    drawerObj.overlay.style.transition = '';
    drawerObj.overlay.style.opacity = '';
}

function _bindDragToClose(drawerObj) {
    const { panel, overlay, opts } = drawerObj;
    const header = panel.querySelector('.u-drawer__header');
    if (!header) return;

    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let dragging = false;

    const isInteractiveTarget = target => !!target?.closest?.('button, a, input, textarea, select, [data-no-drawer-drag]');

    const setDragOffset = (offset) => {
        const y = Math.max(0, offset);
        panel.style.transform = `translateY(${y}px)`;
        overlay.style.opacity = String(Math.max(0.2, 1 - (y / DRAG_FADE_DISTANCE)));
    };

    const resetDrag = () => {
        pointerId = null;
        startX = 0;
        startY = 0;
        startTime = 0;
        dragging = false;
    };

    header.addEventListener('pointerdown', (event) => {
        if (!_isMobileDrawer() || opts.closeOnDrag === false) return;
        if (event.button !== undefined && event.button !== 0) return;
        if (isInteractiveTarget(event.target)) return;
        if (_stack[_stack.length - 1] !== drawerObj) return;

        pointerId = event.pointerId;
        startX = event.clientX;
        startY = event.clientY;
        startTime = performance.now();
        dragging = false;

        try {
            header.setPointerCapture(pointerId);
        } catch (e) {}
    });

    header.addEventListener('pointermove', (event) => {
        if (pointerId !== event.pointerId || _stack[_stack.length - 1] !== drawerObj) return;

        const deltaX = event.clientX - startX;
        const deltaY = event.clientY - startY;
        const absX = Math.abs(deltaX);

        if (!dragging) {
            if (deltaY < 8 && absX < 8) return;
            if (deltaY <= 0 || absX > deltaY) {
                resetDrag();
                return;
            }

            dragging = true;
            panel.classList.add('u-drawer--dragging');
            panel.style.transition = 'none';
            overlay.style.transition = 'none';
        }

        event.preventDefault();
        setDragOffset(deltaY);
    });

    const finishDrag = (event) => {
        if (pointerId !== event.pointerId) return;

        const deltaY = Math.max(0, event.clientY - startY);
        const elapsed = Math.max(1, performance.now() - startTime);
        const velocity = deltaY / elapsed;
        const shouldClose = dragging && (deltaY >= DRAG_CLOSE_THRESHOLD || (deltaY > 32 && velocity >= DRAG_CLOSE_VELOCITY));

        try {
            header.releasePointerCapture(pointerId);
        } catch (e) {}

        if (shouldClose && _stack[_stack.length - 1] === drawerObj) {
            Drawer.close({ closeFromDrag: true });
            resetDrag();
            return;
        }

        if (dragging) {
            panel.style.transition = 'transform 0.22s cubic-bezier(0.4, 0, 0.2, 1)';
            overlay.style.transition = 'opacity 0.22s ease';
            setDragOffset(0);

            setTimeout(() => {
                if (_stack.includes(drawerObj)) _resetDragStyles(drawerObj);
            }, 230);
        }

        resetDrag();
    };

    header.addEventListener('pointerup', finishDrag);
    header.addEventListener('pointercancel', finishDrag);
}

// ─── Publiczne API ─────────────────────────────────────────────────────────────

const Drawer = {

    /**
     * Otwiera nowy drawer na szczycie stosu lub podmienia bieżący.
     * @param {Object} opts - Opcje (tytuł, treść, etc.)
     * @param {boolean} replace - Jeśli true, podmienia treść najwyższego drawera zamiast otwierać nowy.
     */
    open(opts = {}, replace = false) {
        if (replace && _stack.length > 0) {
            const top = _stack[_stack.length - 1];
            top.opts = Object.assign(top.opts, opts);

            // Aktualizacja UI
            top.panel.querySelector('.u-drawer__title').textContent = top.opts.title || '';
            
            const backBtn = top.panel.querySelector('.u-drawer__back');
            if (backBtn) {
                const hasBack = typeof top.opts.onBack === 'function';
                backBtn.classList.toggle('u-drawer__back--hidden', !hasBack);
                backBtn.onclick = hasBack ? (e) => { e.stopPropagation(); top.opts.onBack(); } : null;
            }

            const closeBtn = top.panel.querySelector('.u-drawer__close');
            if (closeBtn) closeBtn.classList.toggle('u-drawer__close--hidden', !top.opts.showCloseBtn);
            
            top.panel.classList.remove(...Object.values(SIZES));
            top.panel.classList.add(SIZES[top.opts.size] || SIZES.lg);
            
            _setContent(top, top.opts.content);
            _buildFooter(top);

            // Re-bind overlay click if closeOnBackdrop changed
            top.overlay.onclick = (e) => {
                if (e.target === top.overlay && top.opts.closeOnBackdrop !== false) {
                    Drawer.close();
                }
            };

            return top;
        }

        const id = Date.now();
        const config = Object.assign({
            title: '',
            content: '',
            size: 'lg',
            confirmLabel: '',
            cancelLabel: '',
            onConfirm: null,
            onCancel: null,
            onClose: null,
            onBack: null,
            closeOnBackdrop: true,
            closeOnDrag: true,
            showCloseBtn: true,
            triggerId: null,
        }, opts);

        // Tworzenie elementów DOM
        const overlay = document.createElement('div');
        overlay.className = 'u-drawer-overlay hidden';
        overlay.setAttribute('aria-hidden', 'true');

        const panel = document.createElement('div');
        panel.className = 'u-drawer hidden';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('tabindex', '-1');
        
        const titleId = `u-drawer-title-${id}`;
        panel.setAttribute('aria-labelledby', titleId);

        // Z-index: każda kolejna szuflada o 20 wyżej
        const baseZ = 150 + (_stack.length * 20);
        overlay.style.zIndex = baseZ;
        panel.style.zIndex = baseZ + 5;

        panel.innerHTML = `
            <div class="u-drawer__header">
                <div class="u-drawer__header-left">
                    <button class="u-drawer__back u-drawer__back--hidden" type="button" aria-label="Wstecz">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
                            fill="none" stroke="currentColor" stroke-width="2.5"
                            stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="15 18 9 12 15 6"></polyline>
                        </svg>
                    </button>
                    <h3 id="${titleId}" class="u-drawer__title"></h3>
                </div>
                <button class="u-drawer__close" type="button" aria-label="Zamknij">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
                        fill="none" stroke="currentColor" stroke-width="2.5"
                        stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
            <div class="u-drawer__content"></div>
            <div class="u-drawer__footer u-drawer__footer--hidden"></div>
        `;

        document.body.appendChild(overlay);
        document.body.appendChild(panel);

        const drawerObj = { overlay, panel, opts: config, id };
        _stack.push(drawerObj);

        // Inicjalizacja treści
        panel.querySelector('.u-drawer__title').textContent = config.title || '';
        
        const backBtn = panel.querySelector('.u-drawer__back');
        if (backBtn) {
            const hasBack = typeof config.onBack === 'function';
            backBtn.classList.toggle('u-drawer__back--hidden', !hasBack);
            backBtn.onclick = hasBack ? (e) => { e.stopPropagation(); config.onBack(); } : null;
        }

        const closeBtn = panel.querySelector('.u-drawer__close');
        if (closeBtn) closeBtn.classList.toggle('u-drawer__close--hidden', !config.showCloseBtn);
        
        panel.classList.add(SIZES[config.size] || SIZES.lg);
        _setContent(drawerObj, config.content);
        _buildFooter(drawerObj);

        // Eventy
        closeBtn.onclick = () => Drawer.close();
        overlay.onclick = (e) => {
            if (e.target === overlay && config.closeOnBackdrop !== false) {
                Drawer.close();
            }
        };
        _bindDragToClose(drawerObj);

        // Pokazywanie
        overlay.classList.remove('hidden');
        panel.classList.remove('hidden');

        if (_stack.length === 1) {
            _originalBodyOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
        }

        acquireOverlayNavigationLock();

        // Animacja
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                overlay.classList.add('u-drawer-overlay--open');
                panel.classList.add('u-drawer--open');
            });
        });

        // Focus
        setTimeout(() => {
            const focusable = panel.querySelectorAll(FOCUSABLE);
            if (focusable.length > 0) focusable[0].focus();
            else panel.focus();
        }, 50);

        return drawerObj;
    },

    /**
     * Zamyka szczytową szufladę.
     */
    close(options = {}) {
        if (_stack.length === 0) return;
        const top = _stack.pop();

        if (options.closeFromDrag === true) {
            top.panel.classList.remove('u-drawer--dragging');
            top.panel.style.transition = 'transform 0.22s cubic-bezier(0.4, 0, 0.2, 1)';
            top.panel.style.transform = 'translateY(100%)';
            top.overlay.style.transition = 'opacity 0.22s ease';
            top.overlay.style.opacity = '0';
        } else {
            _resetDragStyles(top);
        }

        top.panel.classList.remove('u-drawer--open');
        top.overlay.classList.remove('u-drawer-overlay--open');

        releaseOverlayNavigationLock({ skipHistoryBack: options.skipHistoryBack === true });

        if (typeof top.opts.onClose === 'function') top.opts.onClose();

        // Przywróć focus
        if (top.opts.triggerId) {
            setTimeout(() => {
                const trigger = document.getElementById(top.opts.triggerId);
                if (trigger) trigger.focus();
            }, 310);
        }

        // Usuń z DOM po animacji
        setTimeout(() => {
            top.panel.remove();
            top.overlay.remove();
            
            if (_stack.length === 0 && !hasVisibleBlockingOverlay()) {
                document.body.style.overflow = _originalBodyOverflow || '';
            }
        }, 300);
    },

    /** Podmienia treść szczytowej szuflady */
    setContent(content) {
        if (_stack.length === 0) return;
        _setContent(_stack[_stack.length - 1], content);
    },

    /** Podmienia tytuł szczytowej szuflady */
    setTitle(title) {
        if (_stack.length === 0) return;
        const top = _stack[_stack.length - 1];
        const el = top.panel.querySelector('.u-drawer__title');
        if (el) el.textContent = title;
    },

    showConfirmLoading() {
        if (_stack.length === 0) return;
        const top = _stack[_stack.length - 1];
        const btn = top.panel.querySelector('.btn-primary');
        if (!btn) return;
        btn._originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner animate-spin mr-2"></i>Zapisywanie...';
    },

    hideConfirmLoading() {
        if (_stack.length === 0) return;
        const top = _stack[_stack.length - 1];
        const btn = top.panel.querySelector('.btn-primary');
        if (!btn) return;
        btn.disabled = false;
        if (btn._originalText) btn.innerHTML = btn._originalText;
    },

    /**
     * Zamyka wszystkie otwarte szuflady.
     */
    closeAll(options = {}) {
        while (_stack.length > 0) {
            const top = _stack.pop();
            top.panel.remove();
            top.overlay.remove();
            releaseOverlayNavigationLock({ skipHistoryBack: options.skipHistoryBack === true });
            if (typeof top.opts.onClose === 'function') top.opts.onClose();
        }
        if (!hasVisibleBlockingOverlay()) {
            document.body.style.overflow = _originalBodyOverflow || '';
        }
    },

    /**
     * Obsluguje cofniecie systemowe/browserowe dla aktywnej szuflady.
     * Najpierw wykonuje krok wstecz wewnatrz szuflady, jesli istnieje,
     * a dopiero potem zamyka najwyzsza szuflade.
     */
    handleBackNavigation() {
        if (_stack.length === 0) return { handled: false, overlayClosed: false };
        const top = _stack[_stack.length - 1];

        if (typeof top.opts.onBack === 'function') {
            top.opts.onBack();
            return { handled: true, overlayClosed: false };
        }

        Drawer.close({ skipHistoryBack: true });
        return { handled: true, overlayClosed: true };
    },

    get isOpen() { return _stack.length > 0; },
    get current() { return _stack[_stack.length - 1] || null; }
};

export default Drawer;
