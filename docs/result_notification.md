# Result Notification System: Telegram & Discord Integration

A headless background bot is useless if it successfully books a ticket but the user misses the 30-minute payment window. The notification system must be instantaneous and provide all necessary information to complete the transaction off-device.

## 1. Notification Requirements

Upon successful transition to the "Success" or "Waiting for Payment" page, the bot must immediately extract and transmit:
1.  **Status Confirmation:** A clear "SUCCESS" message.
2.  **Payment Details:** The specific Virtual Account (VA) Number, Bank Name, and the Exact Total Amount due.
3.  **Visual Proof:** A full-page screenshot of the success screen as definitive proof and for record-keeping.
4.  **Booking Reference (Optional):** The Order ID or Booking Reference number if displayed.

## 2. Choosing the Platform

Both Telegram and Discord are excellent for low-latency notifications with image support via simple HTTP APIs. 

*   **Telegram:** Generally preferred for personal alerts as it hits the phone's lock screen immediately and the API for sending photos is very straightforward.
*   **Discord:** Better if managing a team of snipers or logging results to a specific channel via Webhooks without needing to host a separate bot process.

## 3. Implementation: Telegram Bot API

**Setup:**
1.  Message `@BotFather` on Telegram.
2.  Send `/newbot`, choose a name, and get the HTTP API Token.
3.  Message your new bot to start a chat.
4.  Get your personal `chat_id` (using a tool like `@userinfobot`).

**Code Snippet (TypeScript with `node-fetch` or native `fetch`):**

```typescript
import fs from 'fs';
import FormData from 'form-data'; // Use form-data library for Node.js < 18 or specific needs

async function sendTelegramNotification(page, vaNumber, amount, telegramToken, chatId) {
    console.log("Preparing Telegram Notification...");
    
    const screenshotPath = './success_screenshot.png';
    // 1. Capture the visual proof
    await page.screenshot({ path: screenshotPath, fullPage: true });

    // 2. Format the message clearly
    const captionText = `
🚨 **TICKET SNIPED SUCCESSFULLY!** 🚨

🏦 **Bank:** BCA Virtual Account
🔢 **VA Number:** \`${vaNumber}\`
💰 **Total Tagihan:** Rp ${amount}

⏱️ *Segera lakukan pembayaran sebelum batas waktu habis!*
    `;

    // 3. Construct the multipart form data for the photo and text
    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('photo', fs.createReadStream(screenshotPath));
    form.append('caption', captionText);
    form.append('parse_mode', 'Markdown'); // Allow bold/code formatting

    // 4. Fire the webhook to Telegram API
    const url = `https://api.telegram.org/bot${telegramToken}/sendPhoto`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            body: form as any,
        });

        if (response.ok) {
            console.log("Notification Sent to Telegram!");
        } else {
            console.error("Failed to send notification:", await response.text());
        }
    } catch (error) {
        console.error("Error connecting to Telegram API:", error);
    } finally {
        // Cleanup local screenshot to save disk space over time
        if (fs.existsSync(screenshotPath)) {
            fs.unlinkSync(screenshotPath);
        }
    }
}
```

## 4. Implementation: Discord Webhook (Alternative)

**Setup:**
1.  Go to Server Settings -> Integrations -> Webhooks.
2.  Create a New Webhook and copy the Webhook URL.

**Logic:**
The logic is similar, but Discord uses a different JSON payload structure and handles file uploads slightly differently via `multipart/form-data`.

*Note: The script should ideally support both, toggled via environment variables (`process.env.TELEGRAM_TOKEN` vs `process.env.DISCORD_WEBHOOK`), giving the user flexibility.*
