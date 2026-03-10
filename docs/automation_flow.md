# Automation Flow & Tech Stack (Loket.com Ticket Sniper)

## 🛠️ Tech Stack

This bot is built using a modern Node.js ecosystem focusing on high-level headless browser automation:

| Category | Technology | Function & Reason |
|----------|-----------|----------------|
| **Runtime** | **Node.js** | JavaScript backend platform for script execution with highly performant asynchronous I/O. |
| **Language** | **TypeScript** | Provides type-safety, autocompletion, and clean class structure (OOP) during development. Prevents runtime errors. |
| **Automation** | **Playwright Extra** | Browser automation framework from Microsoft (faster & lighter than Puppeteer). The `extra` version is used to support stealth plugins. |
| **Anti-Detection** | **puppeteer-extra-plugin-stealth** | Modifies the headless browser (removes `webdriver` flags, spoofs canvas/WebGL) so the bot remains undetected by Cloudflare / Turnstile used by Loket. |
| **Fingerprinting** | **fingerprint-generator & injector** | Generates fake but realistic browser profiles (User Agent, viewport, OS) randomly for each browser context so they appear as 10 different real users. |
| **Networking** | **Geonode Residential Proxies** | Changes the IP address of each browser using residential IPs (ISPs), ensuring Loket does not see 10 requests originating from the same server IP. |
| **Notification** | **Telegram Bot API (node-fetch)** | Sends real-time webhook alerts (text & fullpage screenshot) directly to the user's mobile upon successfully securing the ticket. |
| **Configuration** | **dotenv** | Manages the `.env` file to safely store sensitive data (ID cards, phone numbers, proxies) outside the source code (preventing it from entering version control). |

---

## 🔄 Execution Flow (Automation)

The sequence of processes from the very first second the bot runs until the invoice is acquired:

### 1. Preparation & Polling Phase (Observer)
- User executes `npm start`.
- The bot loads configurations from the `.env` file and guarantees no mandatory data is empty.
- **ObserverService** opens 1 low-footprint browser instance (without stealth/proxy overhead).
- The Observer loads the `LANDING_PAGE_URL`.
- The Observer loops every 3 seconds scanning `<a>` tags' hrefs, searching for links containing the `TARGET_KEYWORD` (e.g. `loket.com`).
- Once the Loket button appears → The bot captures the literal Loket URL → Proceeds to Phase 2.

### 2. Assault Phase (Orchestrator & BrowserService)
- Observer is destroyed.
- **BrowserService** launches the main **Chromium headless** engine.
- The bot spawns **Isolated Browser Contexts** concurrently (determined by `BROWSER_CONCURRENCY`, e.g., 10 contexts).
- Every single browser context is injected with:
  - 1 Unique Residential Proxy.
  - 1 Complete Browser Fingerprint (OS, Screen, Device).
  - The Stealth Plugin Injector.
- The bot commands all snipers (**LoketSniperService**) to simultaneously hit the Loket URL found in Phase 1.

### 3. Queue & Checkout Phase (LoketSniperService)
1. **Waiting Room (Queue):** All 10 browsers enter the Loket page (or virtual Waiting Room). They wait independently utilizing different proxy IPs.
2. **Add Tickets:** The first browser to bypass the queue locates the configured ticket category (`TICKET_CATEGORY`), e.g. "CAT 1".
3. **Select Quantity:** Identifies the parent/container of that category and clicks the `(+)` button exactly `TICKET_QUANTITY` times.
4. **Order Button:** Locates and clicks the "Order Now" or equivalent buy button to lock the tickets.

### 4. Data Population Phase (Customer Form)
- The *Personal Information* form page opens.
- The bot automatically inputs at lightning speed (in ms):
  - First Name & Last Name (automatically split by the bot from `USER_FULLNAME`).
  - Email & NIK / ID Document number.
  - Telephone (adjusting standard `08...` formats to the expected dropdown logic format if needed).
  - Selects the **3 DOB Dropdowns** (Date, Month, Year).
  - Selects the **Gender** Radio Button (e.g. `Female` = `gender_2`).
- Checks all mandatory Terms & Conditions checkboxes.
- Submits the form ("Next" button).

### 5. Payment & Notification Phase (Payment & TelegramNotifier)
- The Payment Method selection page opens.
- The bot scans for `Virtual Account BCA` and clicks on it.
- The bot triggers the final action button: **"Pay Now"**.
- The specific Event's Loket Invoice page appears.
- The bot dynamically extracts:
  1. The VA (Virtual Account) number.
  2. The unique Invoice Code.
  3. The Total billing price.
  4. The active Page URL.
- **TelegramNotifier** activates:
  1. Fires a **Text Message** containing the aforementioned details for easy copy-pasting.
  2. Takes a **Full Page Screenshot** and sends it as a photo object to Telegram.
- **Connection Termination:** The victorious winning browser context signals the system (triggering `AbortController`). The remaining 9 sister browsers are immediately halted and killed to prevent duplicate checkouts.
- The bot process cleanly exits with `Exit 0` (Success).
