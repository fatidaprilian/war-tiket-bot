# Resiliency & Error Handling: Surviving the Chaos

Ticket war platforms are notoriously unstable during heavily hyped events. They routinely drop connections, throw 502 Bad Gateway errors, and forcibly disconnect users from the waiting room. 

A successful bot must anticipate failure at every step and recover instantly without losing its overarching state.

## 1. Handling Website Crashes (502 / 504 / Connection Reset)

When a server is overloaded, it returns HTTP 5xx errors or drops the connection entirely (`ERR_CONNECTION_RESET`).

**The Wrong Approach:** Let Playwright throw an unhandled rejection, crashing the entire bot context.
**The Right Approach:** Catch network-level errors at the navigation/interaction commands and implement intelligent retry logic.

**Logic (Auto-Retry on 5xx):**

```typescript
// A resilient wrapper for navigating to critical pages
async function resilientNavigate(page, url, maxRetries = 5) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`[Attempt ${attempt}] Navigating to ${url}`);
            
            // Navigate and wait for DOM, but use a shorter timeout to fail fast
            const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
            
            // Check HTTP status code. If it's a server error, we must retry.
            if (response && response.status() >= 500) {
                console.warn(`Server returned ${response.status()}. Retrying...`);
                // Wait briefly before slamming the server again (Exponential backoff is better, but speed matters here)
                await page.waitForTimeout(1000 * attempt); 
                continue; // Loop again
            }
            
            // If we reach here, navigation was "successful" (HTTP < 500)
            return true;

        } catch (error) {
            console.error(`[Attempt ${attempt}] Navigation failed:`, error.message);
            
            if (attempt === maxRetries) {
                throw new Error("Maximum retry attempts reached. Navigation failed permanently.");
            }
            await page.waitForTimeout(1000); 
        }
    }
    return false;
}
```

## 2. Queue Recovery: The Context Failover

In our Multi-Context Strategy (e.g., 20 simultaneous browser instances), the reality is that some contexts *will* fail. A proxy might die, a specific Cloudflare check might flag a fingerprint, or the page might just freeze.

**The Strategy:** Treat contexts as disposable but monitored workers.

1.  **State Tracking:** The Orchestrator maintains a registry of active contexts and their current state (e.g., `STARTING`, `QUEUED`, `CHECKOUT`, `FAILED`, `SUCCESS`).
2.  **Health Checks:** Each context runs an internal `setInterval` or `while` loop that periodically pings the Orchestrator with an "I am alive and in the queue" message.
3.  **Fail-Fast Isolation:** Wrap the entire execution flow of a single context in a massive `try...catch` block. If a context hits an unrecoverable error (e.g., proxy dead, permabanned IP), it logs the failure, closes itself (`context.close()`), and reports `FAILED` to the Orchestrator to free up memory.
4.  **No Single Point of Failure:** Because contexts do not share state, Context #4 crashing has absolutely zero impact on Context #12, which might be at the front of the queue.

## 3. The "Stuck Page" Heuristic

Sometimes, the page doesn't throw an error; it just never finishes loading or the necessary DOM elements never appear (e.g., a blank white screen).

**Solution:** Aggressive Timeouts + DOM Polling.

Never use generic explicit waits like `page.waitForTimeout(30000)` during critical phases. Always wait for specific elements with specific timeouts. If the timeout is hit, assume the page is stuck, refresh it, or restart the flow for that specific context.

```typescript
// Example: Waiting for the queue to finish
try {
    // Wait max 10 minutes for the checkout form to appear
    await page.waitForSelector('#checkout-form', { timeout: 600000 }); 
    // If successful, proceed to Snipe strategy
} catch (e) {
    if (e.name === 'TimeoutError') {
        console.warn("Context stuck in queue for too long or page froze. Refreshing...");
        await page.reload({ waitUntil: 'domcontentloaded' });
        // Re-enter monitoring loop
    }
}
```
