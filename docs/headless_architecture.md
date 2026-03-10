# Headless Ticket War Bot Architecture: Observer Pattern & Multi-Context Strategy

## 1. The Observer Pattern for Landing Page Monitoring

The "Observer Pattern" in the context of this bot is about actively, yet efficiently, monitoring the landing page (`woodzinjakarta.com`) for state changes—specifically, the activation of the "Buy Ticket" button or a redirect to the ticketing platform (e.g., `tiket.com`).

**How it works:**
*   **Subject (The Target):** The landing page (`woodzinjakarta.com`). This is what we are watching.
*   **Observer (The Bot):** A lightweight background process (or multiple processes) continuously polling the Subject.

**Implementation Strategy:**
Instead of constantly reloading the entire heavy webpage (which is slow, bandwidth-intensive, and highly suspicious), the bot uses lightweight HTTP polling or focused DOM observation.

1.  **Direct API Polling (Preferred if possible):** If the landing page fetches the ticket link via a hidden API call (XHR/Fetch), the bot should intercept or mimic that specific API request instead of loading the UI.
2.  **Headless DOM Observation:** If direct API polling isn't feasible, a single headless browser instance periodically loads the page and evaluates the DOM for specific selectors (e.g., the `href` of the "Buy Ticket" button changing from `#` to a real URL).

**Code Snippet Outline (DOM Observation):**

```typescript
import { chromium } from 'playwright-extra';
// ... plugins setup

async function observeLandingPage(url: string, targetSelector: string) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    let isLive = false;
    let targetUrl = '';

    while (!isLive) {
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
            // Check if the button has a valid href or if we got redirected
            const href = await page.getAttribute(targetSelector, 'href');
            if (href && href !== '#' && href.includes('tiket.com')) {
                isLive = true;
                targetUrl = href;
                console.log(`[Observer] TARGET SIGHTED: ${targetUrl}`);
                break; // Trigger the sniping contexts
            }
            // Add jitter to polling interval to avoid patterns
            await page.waitForTimeout(3000 + Math.random() * 2000); 
        } catch (error) {
            console.error('[Observer] Polling error, retrying...', error);
        }
    }
    await browser.close();
    return targetUrl;
}
```

## 2. Multi-Context Strategy: Increasing Queue Probability

Ticket queues (like those on Cloudflare Waiting Room or custom queue systems) often assign queuing priority based on the moment a unique session hits the entry node.

To maximize the chance of getting a low queue number, we run **10-20 separate browser contexts simultaneously**.

**Why Contexts instead of Browsers?**
Launching 20 full browser windows is extremely resource-heavy. Playwright's `BrowserContext` allows running multiple independent, isolated sessions (incognito-like) within a single browser engine instance. They share no cookies or cache, making them appear as distinct visitors.

**Execution Flow:**
1.  **The Observer** detects the active ticket link.
2.  **The Orchestrator** immediately spawns 10-20 `BrowserContexts`.
3.  Each Context is routed through a **different Residential Proxy** and injected with a **unique fingerprint**.
4.  All Contexts hit the target queue URL at almost the exact same millisecond.

## 3. Strategy for Session Locking (Proxy & Context Consistency)

A critical anti-bot measure used by ticket platforms is verifying that the IP address that waited in the queue is the exact same IP address that attempts to check out.

If the IP changes mid-session, the queue token or session cookie is invalidated.

**The Solution: Sticky Proxies and Persistent Contexts**

1.  **Sticky Residential Proxies:** We must use a proxy provider that offers "sticky sessions" (e.g., keeping the same IP for up to 10-30 minutes based on a session ID).
2.  **Binding Proxy to Context:** When creating a Playwright `BrowserContext`, we explicitly bind it to a specific sticky proxy URL.
3.  **State Preservation:** We use Playwright's state saving capability to ensure cookies acquired during the queue phase are retained.

**Implementation Logic:**

```typescript
async function spawnSniperContext(browser, proxyEndpoint: string, proxySessionId: string, fingerprint) {
    // Construct the sticky proxy URL using the session ID
    // Format depends on provider, e.g., http://user-session-${proxySessionId}:pass@proxy.com:port
    const stickyProxyUrl = constructStickyProxy(proxyEndpoint, proxySessionId);

    const context = await browser.newContext({
        proxy: { server: stickyProxyUrl },
        userAgent: fingerprint.userAgent,
        viewport: fingerprint.viewport,
        locale: fingerprint.locale,
        timezoneId: fingerprint.timezoneId,
        // ... inject hardware concurrency, memory etc via evaluateOnNewDocument
    });

    // The context now permanently uses this specific IP for all subsequent requests
    return context;
}
```

*By strictly tying a specific proxy session ID to a specific Playwright BrowserContext, we guarantee that the IP used to enter the waiting room is the same IP used to submit the payment localized form.*
