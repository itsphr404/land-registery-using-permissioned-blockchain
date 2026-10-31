// SPDX-License-Identifier: MIT
// UI utilities and components

(function() {
    'use strict';

    window.ui = {
        // Toast notifications
        toasts: [],
        toastContainer: null,

        init() {
            this.toastContainer = document.getElementById('toastContainer');
        },

        toast(message, type = 'info', duration = 4000) {
            if (!this.toastContainer) return;

            const toast = document.createElement('div');
            toast.className = 'toast';
            const colors = {
                info: 'var(--blue)',
                success: 'var(--forest)',
                warning: 'var(--bronze)',
                error: 'var(--red)'
            };
            toast.style.borderLeft = `4px solid ${colors[type] || colors.info}`;
            toast.style.background = 'var(--sheet)';
            toast.style.border = '1px solid var(--line)';
            toast.style.padding = '12px 16px';
            toast.style.borderRadius = '4px';
            toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
            toast.style.marginBottom = '8px';
            toast.style.font = '12px var(--mono)';
            toast.style.color = 'var(--ink)';
            toast.textContent = message;
            this.toastContainer.appendChild(toast);

            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transition = 'opacity 0.3s';
                setTimeout(() => toast.remove(), 300);
            }, duration);
        },

        // Modal dialog
        openModal(content, onClose) {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;';
            overlay.innerHTML = `
                <div style="background:var(--sheet);border:1.5px solid var(--ink);border-radius:8px;padding:24px;max-width:500px;width:100%;max-height:80vh;overflow:auto;position:relative;">
                    <button class="modal-close" style="position:absolute;top:8px;right:8px;background:none;border:1px solid var(--line);padding:4px 8px;cursor:pointer;font:11px var(--mono);color:var(--ink);">&times;</button>
                    <div>${content}</div>
                </div>
            `;
            document.body.appendChild(overlay);

            const close = () => {
                overlay.remove();
                if (onClose) onClose();
            };

            overlay.querySelector('.modal-close').onclick = close;
            overlay.onclick = (e) => { if (e.target === overlay) close(); };

            return { close };
        },

        confirm(message, onConfirm) {
            const modal = this.openModal(`
                <p style="margin:0 0 16px;font:14px var(--sans);color:var(--ink);">${message}</p>
                <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
                    <button class="btn alt" data-action="cancel">Cancel</button>
                    <button class="btn" data-action="confirm" style="background:var(--red);border-color:var(--red);">Confirm</button>
                </div>
            `);

            modal.close = () => modal.close();

            modal.element.querySelector('[data-action="confirm"]').onclick = () => {
                onConfirm(true);
                modal.close();
            };
            modal.element.querySelector('[data-action="cancel"]').onclick = () => {
                onConfirm(false);
                modal.close();
            };

            return modal;
        },

        // Loading spinner
        showSpinner(element) {
            const spinner = document.createElement('div');
            spinner.className = 'spinner';
            spinner.style.cssText = 'width:20px;height:20px;border:2px solid var(--line);border-top-color:var(--bronze);border-radius:50%;animation:spin 1s linear infinite;margin:0 auto;';
            if (!document.getElementById('spinner-style')) {
                const style = document.createElement('style');
                style.id = 'spinner-style';
                style.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
                document.head.appendChild(style);
            }
            element.appendChild(spinner);
            return spinner;
        },

        hideSpinner(spinner) {
            if (spinner && spinner.parentNode) spinner.parentNode.removeChild(spinner);
        },

        // Format helpers
        formatEther(wei) {
            return ethers.formatEther(wei);
        },

        formatAddress(addr) {
            if (!addr) return '';
            return addr.slice(0, 6) + '...' + addr.slice(-4);
        },

        formatDate(ts) {
            if (!ts) return '';
            const d = new Date(ts);
            return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        },

        // Loading state
        setLoading(btn, loading) {
            if (loading) {
                btn.disabled = true;
                btn.dataset.originalText = btn.textContent;
                btn.innerHTML = '<span style="display:inline-block;width:14px;height:14px;border:2px solid currentColor;border-radius:50%;border-top-color:transparent;animation:spin 1s linear infinite;margin-right:8px;"></span>Loading...';
            } else {
                btn.disabled = false;
                btn.textContent = btn.dataset.originalText || btn.textContent;
            }
        }
    };
})();