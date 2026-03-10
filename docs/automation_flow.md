# Core Automation Flow: From Monitoring to Payment

This document outlines the step-by-step logic the bot executes to successfully snipe a ticket.

---

## Step 1: Monitoring & Triggering

The bot starts in a lightweight polling state, continuously checking the event's landing page (e.g., `woodzinjakarta.com`).

*   **Logic:** The Observer script fetches the landing page HTML or polls the underlying API every few seconds (with randomized intervals to avoid detection patterns).
*   **Success Condition:** It detects the specific keyword (e.g., "BELI TIKET SEKARANG") or the `href` attribute of the target button changing from a placeholder (`#`) to the actual ticketing URL (e.g., `tiket.com/event/...`).
*   **Action:** Immediately broadcast the target URL to the Orchestrator.

---

## Step 2: The Queue / Waiting Room Survival Mode

Once the Orchestrator receives the live URL, it instantly spawns Multiple Browser Contexts (e.g., 10-20 contexts), each bound to a unique sticky proxy.

*   **Entry:** All contexts navigate to the ticketing URL simultaneously.
*   **Detection:** The bot analyzes the DOM to check if it has landed in a "Waiting Room" (Cloudflare, Queue-it, or custom platform queue). It looks for text like "You are in line," "Estimasi waktu tunggu," or specific queue elements.
*   **Maintenance:** 
    *   The bot must *not* reload the page aggressively, as this resets the queue position.
    *   It monitors the network tab (WebSocket or XHR polls) to ensure the connection to the queue server remains alive.
    *   If a Cloudflare challenge appears during the queue, the stealth plugin or CAPTCHA solver handles it silently keeping the session active.

---

## Step 3: Fast-Track Form Sniping

When a specific context reaches the front of the queue, the page automatically redirects or updates the DOM to display the ticket selection and checkout form.

*   **Recognition:** The bot detects the presence of ticket category containers or the specific "Checkout" form fields.
*   **Data Injection (Critical Path):** Speed is everything here. While we discussed human-like interaction earlier, in a high-stakes ticket war, if behavioral detection isn't strictly enforced on the specific form fields, *direct DOM injection* is vastly faster.

    **Implementation Choice:**
    *   *Safe Mode:* Use `page.type()` with slight delays.
    *   *Sniper Mode (Preferred if platform allows):* Use `page.fill()` or direct `page.evaluate()` to instantly populate the values.

```typescript
// SNIPER MODE: Instant Form Fill (Assuming pre-loaded User Data Profile)
async function snipeForm(page, userData) {
    try {
        console.log("Entering Sniper Mode: Filling Form");
        
        // Wait for the primary form container to be visible ensuring the page loaded completely
        await page.waitForSelector('#checkout-form-container', { state: 'visible', timeout: 5000 });

        // Instantly inject data into inputs
        await Promise.all([
            page.fill('input[name="nik"]', userData.nik),
            page.fill('input[name="fullName"]', userData.fullName),
            page.fill('input[name="email"]', userData.email),
            page.fill('input[name="phoneNumber"]', userData.phone),
            page.fill('input[name="dob"]', userData.dob) // Format strictly depends on target site
        ]);

        // Proceed to payment selection
        await page.click('button#continue-to-payment');

    } catch (error) {
        console.error("Form Sniping Failed:", error);
        // Trigger recovery or fallback to safe mode
    }
}
```

---

## Step 4: Rapid Payment Finalization

After the personal details are submitted, the ticketing platform presents the payment gateway selection.

*   **Selection:** The bot explicitly targets the designated payment method. The requirement is **BCA Virtual Account**.
*   **Execution:** 
    1.  Wait for the payment option list to render.
    2.  Locate and click the element containing "BCA Virtual Account" (usually by matching text or a specific ID).
    3.  Instantly locate and click the "Finalize," "Bayar Sekarang," or "Selesaikan Pesanan" button.
*   **Verification:** The bot waits for the final redirect to the "Success" or "Waiting for Payment" page containing the generated Virtual Account number.
