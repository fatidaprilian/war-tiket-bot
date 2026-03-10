# Anti-Detection & Stealth Strategies: Bypassing Modern Waiting Rooms

## 1. Fingerprint Randomization: Canvas, WebGL, and AudioContext

Modern anti-bot systems (Cloudflare, Akamai, Datadome) go far beyond just checking your User-Agent or IP address. They execute JavaScript to inspect the unique hardware and software signatures of your browser, a process known as fingerprinting. 

To run 20 concurrent contexts and not have them all flagged as the exact same bot, each context needs a completely unique, mathematically mathematically consistent fingerprint.

**The Solution: `fingerprint-generator` and `fingerprint-injector`**

We use these libraries to generate realistic browser fingerprints and inject them into the Playwright context *before* any page evaluates its environment.

*   **Canvas Fingerprinting:** Systems draw text/shapes on a hidden `<canvas>` and hash the result. Different GPUs render pixels slightly differently.
*   **WebGL Fingerprinting:** Inspects the graphics driver, vendor, and renderer strings.
*   **AudioContext Fingerprinting:** Analyzes how the browser processes sub-audible frequencies.

**Implementation Logic:**

```typescript
import { fingerprintGenerator } from 'fingerprint-generator';
import { fingerprintInjector } from 'fingerprint-injector';
import { chromium } from 'playwright-extra';
// ... stealth plugin setup

async function setupStealthContext(browser, proxyUrl) {
    // 1. Generate a realistic fingerprint for a modern OS/Browser
    const fingerprint = fingerprintGenerator.getFingerprint({
        devices: ['desktop'],
        browsers: ['chrome', 'edge'],
        operatingSystems: ['windows', 'macos']
    });

    // 2. Create context with the basic fingerprint properties
    const context = await browser.newContext({
        userAgent: fingerprint.fingerprint.userAgent,
        viewport: fingerprint.fingerprint.viewport,
        locale: fingerprint.fingerprint.locale,
        timezoneId: fingerprint.fingerprint.timezoneId,
        proxy: { server: proxyUrl }
    });

    // 3. Inject the complex hardware fingerprints (Canvas, WebGL, etc.)
    await fingerprintInjector.attachFingerprintToPlaywright(context, fingerprint);

    return context;
}
```

## 2. Handling Cloudflare Turnstile & Google reCAPTCHA in Headless Mode

When the bot hits a ticketing platform, it is highly likely to encounter a challenge page (like Cloudflare Turnstile's "Checking your browser" or a Google reCAPTCHA checkbox).

**The Challenge:** Headless browsers struggle to solve these organically.

**The Solution: Third-Party Solver API Integration (2Captcha / CapSolver)**

Instead of trying to "click" the CAPTCHA (which often fails in headless), we intercept the CAPTCHA required by the site, send it to a solver service, wait for the token, and inject the solution back into the page.

**Workflow for Cloudflare Turnstile (Example):**

1.  **Detect:** The bot monitors the page for the Cloudflare challenge iframe or specific DOM elements indicating a Turnstile challenge is active.
2.  **Extract:** Extract the `sitekey` and the current URL.
3.  **Submit to Solver:** Send an API request to 2Captcha/CapSolver with the `sitekey`, `pageUrl`, and the proxy URL (crucial: the solver must use the *same* proxy as the bot context).
4.  **Poll for Solution:** Wait for the solver service to return the valid Turnstile token.
5.  **Inject and Evaluate:** Inject the solved token into the hidden input field (usually named `cf-turnstile-response`) and trigger the callback function that the page expects when the CAPTCHA is solved.

*Note: For Turnstile, `playwright-extra` with the stealth plugin often bypasses the "managed challenge" automatically without needing a third-party solver by possessing a strong fingerprint. The solver API is the fallback for absolute blocks or interactive challenges.*

## 3. Emulating Human-Like Interaction

Even with a perfect fingerprint and solved CAPTCHAs, behavioral analysis (mouse movements, keystroke dynamics) can flag a bot during the checkout phase.

**Strategies:**

*   **Randomized Click Delays:** Never click immediately after an element appears.
*   **Mouse Movement Curves:** Instead of teleporting the mouse cursor, use libraries like `ghost-cursor` to generate bezier curves that simulate human mouse paths across the screen.
*   **Typing Delays:** When automating forms, do not inject the entire string instantly. Use `page.type()` with a randomized `delay` parameter between keystrokes to simulate human typing cadence.

**Snippet: Human-like Form Filling**

```typescript
// DON'T do this: Instantly fills the input
// await page.fill('#full-name', 'John Doe'); 

// DO this: Simulates finding the element, moving the mouse, and typing with variable speed
async function simulateHumanTyping(page, selector, text) {
    await page.waitForSelector(selector);
    const element = await page.$(selector);
    
    // Attempt to move mouse smoothly to the input (requires external library or complex evaluate)
    // await cursor.click(selector); 
    
    await element.click(); // Focus the input
    
    for (const char of text) {
        await page.keyboard.press(char);
        // Random delay between 30ms and 150ms per keystroke
        await page.waitForTimeout(Math.floor(Math.random() * 120) + 30);
    }
}
```
