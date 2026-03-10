import fetch from 'node-fetch';
import FormData from 'form-data';
import { Page } from 'playwright';
import { Config } from '../../config';

export class TelegramNotifier {
    private token: string;
    private chatId: string;

    constructor() {
        this.token = Config.TELEGRAM_BOT_TOKEN;
        this.chatId = Config.TELEGRAM_CHAT_ID;
    }

    async sendSuccessNotification(page: Page, orderInfo: string) {
        if (!this.token || !this.chatId) {
            console.warn('[Notifier] Telegram Token or Chat ID is missing, skipping notification.');
            return;
        }

        const apiBase = `https://api.telegram.org/bot${this.token}`;

        // ── 1. Send copyable TEXT message first ──────────────────────────────
        // This lets you copy-paste the VA number without needing to read the photo
        const textMessage = [
            '🚨 *TICKET BERHASIL DIBELI!* 🚨',
            '',
            `🎫 *Event:* Woodz in Jakarta`,
            `🏷️ *Kategori:* ${Config.TICKET_CATEGORY}`,
            `💳 *Pembayaran:* ${Config.PAYMENT_METHOD}`,
            '',
            orderInfo,
            '',
            '⚠️ *Segera bayar sebelum expired\\!*',
        ].join('\n');

        try {
            await fetch(`${apiBase}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: this.chatId,
                    text: textMessage,
                    parse_mode: 'Markdown',
                }),
            });
            console.log('[Notifier] ✅ Text notification sent!');
        } catch (err: any) {
            console.error('[Notifier] ❌ Failed to send text message:', err.message);
        }

        // ── 2. Send full-page screenshot as visual confirmation ──────────────
        console.log('[Notifier] 📸 Capturing full-page screenshot...');
        const buffer = await page.screenshot({ fullPage: true });

        const caption = `📸 Screenshot VA Page — ${Config.PAYMENT_METHOD}`;

        try {
            const formData = new FormData();
            formData.append('chat_id', this.chatId);
            formData.append('caption', caption);
            formData.append('photo', buffer, { filename: 'ticket_success.png', contentType: 'image/png' });

            const response = await fetch(`${apiBase}/sendPhoto`, {
                method: 'POST',
                body: formData,
            });

            if (response.ok) {
                console.log('[Notifier] ✅ Screenshot delivered to Telegram!');
            } else {
                console.error('[Notifier] ❌ Telegram photo error:', await response.text());
            }
        } catch (error: any) {
            console.error('[Notifier] ❌ Failed to send screenshot:', error.message);
        }
    }
}
