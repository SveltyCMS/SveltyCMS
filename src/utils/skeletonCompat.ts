/**
 * Lightweight compatibility shim for the removed `popup` action from Skeleton v4.
 *
 * This implements a minimal subset used in the app:
 * - Toggle visibility of an element annotated with `data-popup="<target>"`
 * - Support trigger `event` (click|hover)
 * - Optional `closeQuery` to auto-close when clicking a matching descendant
 * - Close on outside click and on Escape
 */
export type PopupCompatSettings = {
    event?: 'click' | 'hover';
    target: string;
    placement?: 'top' | 'bottom' | 'left' | 'right' | string; // ignored by this shim
    closeQuery?: string;
};

export function popup(node: HTMLElement, settings: PopupCompatSettings) {
    let current = normalize(settings);
    let popupEl: HTMLElement | null = null;
    let hoverHandlers: { enter?: (e: Event) => void; leave?: (e: Event) => void } = {};

    function normalize(s: PopupCompatSettings): Required<PopupCompatSettings> {
        return {
            event: s.event ?? 'click',
            target: s.target,
            placement: s.placement ?? 'bottom',
            closeQuery: s.closeQuery ?? ''
        } as Required<PopupCompatSettings>;
    }

    function findPopup(): HTMLElement | null {
        if (!current.target) return null;
        const selector = `[data-popup="${CSS.escape(current.target)}"]`;
        return (node.ownerDocument || document).querySelector(selector) as HTMLElement | null;
    }

    function show() {
        popupEl = popupEl || findPopup();
        if (!popupEl) return;
        popupEl.classList.remove('hidden');
        popupEl.style.display = '';
        addGlobalListeners();
    }

    function hide() {
        popupEl = popupEl || findPopup();
        if (!popupEl) return;
        if (!popupEl.classList.contains('hidden')) popupEl.classList.add('hidden');
        popupEl.style.display = 'none';
        removeGlobalListeners();
    }

    function toggle() {
        popupEl = popupEl || findPopup();
        if (!popupEl) return;
        if (popupEl.classList.contains('hidden') || popupEl.style.display === 'none') show();
        else hide();
    }

    function onDocumentClick(e: MouseEvent) {
        popupEl = popupEl || findPopup();
        if (!popupEl) return;
        const target = e.target as Node;
        if (popupEl.contains(target) || node.contains(target)) {
            if (current.closeQuery && target instanceof Element && target.closest(current.closeQuery)) {
                hide();
            }
            return;
        }
        hide();
    }

    function onKeydown(e: KeyboardEvent) {
        if (e.key === 'Escape') hide();
    }

    function addGlobalListeners() {
        document.addEventListener('mousedown', onDocumentClick, true);
        document.addEventListener('keydown', onKeydown, true);
    }

    function removeGlobalListeners() {
        document.removeEventListener('mousedown', onDocumentClick, true);
        document.removeEventListener('keydown', onKeydown, true);
    }

    function addTriggerListeners() {
        if (current.event === 'click') {
            node.addEventListener('click', toggle);
        } else {
            hoverHandlers.enter = () => show();
            hoverHandlers.leave = (e: Event) => {
                const related = (e as MouseEvent).relatedTarget as Node | null;
                if (popupEl && (popupEl.contains(related as Node) || node.contains(related as Node))) return;
                hide();
            };
            node.addEventListener('mouseenter', hoverHandlers.enter);
            node.addEventListener('mouseleave', hoverHandlers.leave);
            // Keep open when hovering popup, close on leave
            queueMicrotask(() => {
                popupEl = popupEl || findPopup();
                if (!popupEl) return;
                popupEl.addEventListener('mouseenter', show);
                popupEl.addEventListener('mouseleave', hide);
            });
        }
    }

    function removeTriggerListeners() {
        node.removeEventListener('click', toggle);
        if (hoverHandlers.enter) node.removeEventListener('mouseenter', hoverHandlers.enter);
        if (hoverHandlers.leave) node.removeEventListener('mouseleave', hoverHandlers.leave);
        if (popupEl) {
            popupEl.removeEventListener('mouseenter', show);
            popupEl.removeEventListener('mouseleave', hide);
        }
    }

    addTriggerListeners();

    return {
        update(next: PopupCompatSettings) {
            const wasEvent = current.event;
            current = normalize(next);
            popupEl = null;
            if (wasEvent !== current.event) {
                removeTriggerListeners();
                addTriggerListeners();
            }
        },
        destroy() {
            removeTriggerListeners();
            removeGlobalListeners();
        }
    };
}


