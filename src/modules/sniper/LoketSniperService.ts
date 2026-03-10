import { Page, BrowserContext } from 'playwright';
import { Config } from '../../config';

export class LoketSniperService {

    /**
     * Executes the sniper flow for a single context.
     * Returns the order info string if successfully passed to payment page, else false.
     */
    async execute(context: BrowserContext, targetUrl: string, sniperId: number, abortSignal?: AbortSignal): Promise<string | false> {
        const page = await context.newPage();

        // Critical fix: Loket often opens checkout in a NEW TAB after clicking "Beli Tiket".
        // We track the active page reference, so the sniper always works on the correct one.
        let activePage = page;
        context.on('page', (newPage) => {
            console.log(`[Sniper-${sniperId}] 📑 New tab detected! Switching to new tab for form sniping...`);
            activePage = newPage;
        });

        try {
            console.log(`[Sniper-${sniperId}] 🚀 Entering ticket page...`);
            await this.resilientNavigate(page, targetUrl, abortSignal);

            console.log(`[Sniper-${sniperId}] ⏱️ In Queue or Event Page. Waiting for form...`);

            // Phase 1: Wait + select category (may trigger new tab here on click)
            await this.waitForCheckoutPhase(page, context, sniperId, abortSignal);

            // Wait for new tab to fully load before proceeding
            // Using a robust poll instead of a fixed 1.5s timeout
            await new Promise<void>((resolve) => {
                // If Loket opens a new tab, activePage will be updated by context.on('page').
                // We wait up to 5s for the new tab to load.
                const start = Date.now();
                const check = setInterval(async () => {
                    try {
                        if (activePage !== page) {
                            // New tab opened! Wait for it to be ready.
                            await activePage.waitForLoadState('domcontentloaded').catch(() => {});
                            clearInterval(check);
                            resolve();
                        } else if (Date.now() - start > 5000) {
                            // No new tab after 5s — stay on main page
                            clearInterval(check);
                            resolve();
                        }
                    } catch { clearInterval(check); resolve(); }
                }, 200);
            });
            
            // Phase 2: Form Sniping - use activePage (may now be the new tab)
            await this.snipeCustomerForm(activePage, sniperId, abortSignal);

            // Phase 3: Payment Selection & VA Extraction
            const successInfo = await this.selectPaymentAndFinalize(activePage, sniperId, abortSignal);

            console.log(`[Sniper-${sniperId}] ✅ Successfully reached checkout finalization!`);
            return successInfo || "BCA VA: Silakan cek Screenshot";

        } catch (error: any) {
            if (abortSignal?.aborted || error.message === 'AbortError') {
                await context.close();
                return false;
            }
            console.error(`[Sniper-${sniperId}] ❌ Failed or context crashed: ${error.message}`);
            await context.close();
            return false;
        }
    }

    private async resilientNavigate(page: Page, url: string, abortSignal?: AbortSignal, retries = 3) {
        for (let i = 1; i <= retries; i++) {
            if (abortSignal?.aborted) throw new Error("AbortError");
            try {
                // Critical Fix for Queue: Wait only for 'commit' so we don't crash with 30s timeout
                // while sitting in Loket's virtual waiting room.
                const res = await page.goto(url, { waitUntil: 'commit', timeout: 60000 });
                if (res && res.status() >= 500) {
                    await page.waitForTimeout(2000);
                    continue;
                }
                return;
            } catch (err: any) {
                // If it's a timeout but the document is loaded enough to run the queue, we can just proceed
                if (err.message.includes('Timeout') && page.url().includes('loket.com')) {
                    console.warn(`[Sniper] Navigation timeout, but already on Loket URL. Assuming Queue is running...`);
                    return; // Proceed anyway, the waitForCheckoutPhase loop will handle waiting
                }
                if (i === retries) throw err;
                await page.waitForTimeout(1000);
            }
        }
    }

    private async waitForCheckoutPhase(page: Page, context: BrowserContext, id: number, abortSignal?: AbortSignal) {
        console.log(`[Sniper-${id}] 🎫 Waiting for Ticket Selection Page...`);

        // Wait for the ticket categories to load WITHOUT refreshing the page!
        // Loket's Waiting Room is a virtual queue. If we refresh, we lose our spot.
        let isReady = false;
        let waitLoops = 0;
        
        while (!isReady) {
            if (abortSignal?.aborted) throw new Error("AbortError");
            try {
                // Wait passively for the element to appear in the DOM. 
                // Loket will auto-redirect or modify the DOM when our queue turn arrives.
                await page.waitForSelector(`text="${Config.TICKET_CATEGORY}"`, { timeout: 30000 });
                isReady = true;
            } catch (e: any) {
                waitLoops++;
                // DO NOT RELOAD HERE. Just print log and wait again.
                console.log(`[Sniper-${id}] ⏳ Still in Waiting Room... (30s checkpoint #${waitLoops})`);
                
                // Nuclear safety timeout just in case the tab completely crashes (e.g. 2 hours)
                if (waitLoops > 240) {
                    throw new Error("Timeout: 2 hours passed in queue.");
                }
            }
        }

        console.log(`[Sniper-${id}] 🎯 Found category: ${Config.TICKET_CATEGORY}. Selecting quantity: ${Config.TICKET_QUANTITY}`);

        let ticketSecured = false;
        let attempts = 0;

        while (!ticketSecured && attempts < 1000) { // Keep trying for bounced tickets
            if (abortSignal?.aborted) throw new Error("AbortError");
            attempts++;

            // Multi-strategy fallback for finding the '+' button near the target category.
            // We try from most-specific to most-generic, so class changes won't break the bot entirely.
            const plusBtnStrategies = [
                // Strategy 1: Standard card/box container (original approach, covers most Loket layouts)
                page.locator(`//*[contains(text(), "${Config.TICKET_CATEGORY}")]/ancestor::div[contains(@class, "ticket-card") or contains(@class, "box") or contains(@class, "card")]//button[contains(text(), "+") or contains(@class,"plus") or contains(@class,"increment") or contains(@class,"add")]`).last(),
                // Strategy 2: Sibling/following-sibling button near category text (covers flat layouts)
                page.locator(`//*[contains(text(), "${Config.TICKET_CATEGORY}")]/following::button[contains(text(), "+") or contains(@aria-label, "tambah") or contains(@aria-label, "plus") or contains(@aria-label, "add")][1]`).last(),
                // Strategy 3: Any parent row/item container, then find + button inside
                page.locator(`//*[contains(text(), "${Config.TICKET_CATEGORY}")]/ancestor::*[contains(@class, "item") or contains(@class, "row") or contains(@class, "ticket")]//button[contains(text(), "+") or contains(@class,"add") or contains(@class,"qty")]`).last(),
                // Strategy 4: Generic quantity control — look for data attributes used by common UI kits
                page.locator(`//*[contains(text(), "${Config.TICKET_CATEGORY}")]/following::*[@data-action="increment" or @data-type="plus" or @role="spinbutton"][1]`).last(),
                // Strategy 5: Nuclear fallback — find any "+" button visible on page that isn't disabled
                // May click the wrong category if multiple visible, but better than nothing
                page.locator('button:has-text("+"):not([disabled])').last(),
            ];

            // Try each strategy until one works
            const findClickablePlusBtn = async () => {
                for (const [i, locator] of plusBtnStrategies.entries()) {
                    try {
                        const count = await locator.count();
                        if (count > 0 && await locator.isVisible()) {
                            if (i >= 4) console.warn(`[Sniper-${id}] Using nuclear fallback strategy (Strategy ${i + 1}) for '+' button`);
                            return locator;
                        }
                    } catch { /* Strategy not found, try next */ }
                }
                return null;
            };

            const categoryLocator = await findClickablePlusBtn();

            let clickedPlus = false;
            // Click the '+' button X times
            for (let i = 0; i < Config.TICKET_QUANTITY; i++) {
                try {
                    if (!categoryLocator) break;
                    await categoryLocator.click({ timeout: 2000 });
                    clickedPlus = true;
                    await page.waitForTimeout(200); // small delay between clicks
                } catch (e) {
                    // Button might be disabled due to sold out
                    clickedPlus = false;
                    break;
                }
            }


            if (!clickedPlus) {
                if (attempts % 10 === 0) console.log(`[Sniper-${id}] ⚠️ Ticket ${Config.TICKET_CATEGORY} seems FULL/HABIS. Retrying to catch bounced tickets... (Attempt ${attempts})`);
                await page.waitForTimeout(1000);
                continue; // Loop again
            }

            // Click the "Beli Tiket" or "Checkout" button
            try {
                const beliBtn = await page.$('button:has-text("Beli Tiket"), button:has-text("Beli"), button:has-text("Pesan Sekarang"), button:has-text("Order Now")');
                if (beliBtn) {
                    await beliBtn.click({ timeout: 3000 });
                    // Don't immediately set ticketSecured=true. Wait for URL to change or new page to appear
                    // as confirmation that cart accepted the item.
                    await Promise.race([
                        page.waitForNavigation({ timeout: 5000 }).catch(() => {}),
                        page.waitForURL(/checkout|order|form|pembeli/i, { timeout: 5000 }).catch(() => {}),
                        context.waitForEvent('page', { timeout: 5000 }).catch(() => {}),
                    ]);
                    console.log(`[Sniper-${id}] 🛒 Successfully added to cart, moving to form!`);
                    ticketSecured = true;
                }
            } catch (e) {
                console.warn(`[Sniper-${id}] Checkout button failed. Retrying...`);
                await page.waitForTimeout(1000);
            }
        }

        if (!ticketSecured) {
            throw new Error("Failed to secure ticket after multiple retries. It might be permanently sold out.");
        }
    }

    private async snipeCustomerForm(page: Page, id: number, abortSignal?: AbortSignal) {
        if (abortSignal?.aborted) throw new Error("AbortError");
        console.log(`[Sniper-${id}] ⚡ Filling Personal Information form (live-verified selectors)...`);

        const { fullName, email, phoneNumber, nik, dob, gender } = Config.USER_DATA;
        const parts = fullName.trim().split(' ');
        const fName = parts[0];
        const lName = parts.slice(1).join(' ') || parts[0]; // fallback to fname if single name

        // Parse USER_DOB from env (format: "DD/MM/YYYY" or "DD-MM-YYYY")
        const dobParts = dob.replace(/-/g, '/').split('/');
        const dobDay   = dobParts[0] || '';  // e.g. "19"
        const dobMonth = dobParts[1] || '';  // e.g. "08"
        const dobYear  = dobParts[2] || '';  // e.g. "1999"

        // Wait for form to render (wait for firstname field to appear)
        await page.waitForSelector('input[name="firstname"]', { state: 'visible', timeout: 15000 })
            .catch(() => console.warn(`[Sniper-${id}] ⚠️ firstname field wait timed out, proceeding anyway`));

        // Helper: type into a named input
        const typeInput = async (name: string, val: string) => {
            if (!val) return;
            try {
                const el = page.locator(`input[name="${name}"]`).first();
                await el.click({ timeout: 2000 });
                await el.pressSequentially(val, { delay: Math.floor(Math.random() * 25) + 8 });
                console.log(`[Sniper-${id}] ✓ Typed ${name}: ${val}`);
            } catch {
                console.warn(`[Sniper-${id}] ⚠️ input[name="${name}"] not found`);
            }
        };

        // Helper: select a <select> dropdown by value or visible text
        const selectDropdown = async (name: string, val: string) => {
            if (!val) return;
            try {
                const el = page.locator(`select[name="${name}"]`).first();
                // Try by value first (e.g. "08"), then by visible text (e.g. "August")
                await el.selectOption({ value: val }).catch(() =>
                    el.selectOption({ label: val })
                );
                console.log(`[Sniper-${id}] ✓ Selected ${name}: ${val}`);
            } catch {
                console.warn(`[Sniper-${id}] ⚠️ select[name="${name}"] not found`);
            }
        };

        // Helper: click a radio button by id
        const clickRadio = async (radioId: string) => {
            try {
                const el = page.locator(`input[id="${radioId}"]`).first();
                if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
                    await el.click();
                    console.log(`[Sniper-${id}] ✓ Radio: ${radioId}`);
                }
            } catch {
                console.warn(`[Sniper-${id}] ⚠️ radio #${radioId} not found`);
            }
        };

        // Helper: check a checkbox by id (only if not already checked)
        const checkBox = async (checkId: string) => {
            try {
                const el = page.locator(`input[id="${checkId}"]`).first();
                if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
                    const checked = await el.isChecked().catch(() => false);
                    if (!checked) await el.click();
                    console.log(`[Sniper-${id}] ✓ Checkbox: ${checkId}`);
                }
            } catch {
                console.warn(`[Sniper-${id}] ⚠️ checkbox #${checkId} not found`);
            }
        };

        // --- FILL ALL FIELDS (confirmed from live Loket inspection) ---
        await typeInput('firstname', fName);
        await typeInput('lastname', lName);
        await typeInput('email', email);
        await typeInput('telephone', phoneNumber.replace(/^0/, '')); // Loket wants 8xxx not 08xxx (placeholder: "81222333444")
        await typeInput('identity_id', nik);

        // DOB: 3 separate SELECT dropdowns → dob_day, dob_month, dob_year
        await selectDropdown('dob_day', dobDay);
        await selectDropdown('dob_month', dobMonth);
        await selectDropdown('dob_year', dobYear);

        // Gender radio: gender_1 = Male, gender_2 = Female
        const genderNorm = (gender || '').toLowerCase();
        if (genderNorm === 'male' || genderNorm === 'laki' || genderNorm === 'm') {
            await clickRadio('gender_1');
        } else if (genderNorm === 'female' || genderNorm === 'perempuan' || genderNorm === 'f') {
            await clickRadio('gender_2');
        }

        // WA notification: always click "Yes" to get order updates
        await clickRadio('receive_yes');

        // MANDATORY: Check both ToS checkboxes (Next button disabled without these!)
        await checkBox('accept_toc');
        await checkBox('accept_consent');

        console.log(`[Sniper-${id}] ✅ All fields filled. Clicking Next...`);

        // Click Next / Selanjutnya / Lanjut button
        const nextBtn = await page.$([
            'button:has-text("Next")',
            'button:has-text("Selanjutnya")',
            'button:has-text("Lanjut")',
            'button:has-text("Continue")',
        ].join(', '));

        if (nextBtn) {
            await nextBtn.click();
            await Promise.race([
                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {}),
                page.waitForURL(/payment|bayar|checkout|confirm|order/i, { timeout: 10000 }).catch(() => {}),
                page.waitForSelector('[class*="confirm"], [class*="payment"]', { timeout: 10000 }).catch(() => {}),
            ]);
        } else {
            console.warn(`[Sniper-${id}] ⚠️ Next button not found — form may have submitted automatically`);
        }
    }

    private async selectPaymentAndFinalize(activePage: Page, id: number, abortSignal?: AbortSignal): Promise<string | undefined> {
        if (abortSignal?.aborted) throw new Error("AbortError");
        console.log(`[Sniper-${id}] 💳 Selecting Payment: "${Config.PAYMENT_METHOD}"...`);

        // Wait for payment list to render (h6 containing payment names)
        await activePage.waitForSelector('h6', { timeout: 15000 }).catch(() => {});

        // Click the payment card that matches PAYMENT_METHOD text in its <h6>
        // Live confirmed: payment options are clickable divs with <h6 class="ml-3 ...">Virtual Account BCA</h6>
        try {
            const paymentCard = activePage.locator(`h6:has-text("${Config.PAYMENT_METHOD}")`).first();
            if (await paymentCard.isVisible({ timeout: 3000 }).catch(() => false)) {
                await paymentCard.click();
                console.log(`[Sniper-${id}] ✓ Clicked payment card: "${Config.PAYMENT_METHOD}"`);
            } else {
                // Fallback: try partial text match (e.g. "BCA" matches "Virtual Account BCA")
                const keyword = Config.PAYMENT_METHOD.split(' ').pop() || Config.PAYMENT_METHOD;
                const fallback = activePage.locator(`h6:has-text("${keyword}")`).first();
                await fallback.click({ timeout: 3000 });
                console.log(`[Sniper-${id}] ✓ Clicked payment card via keyword: "${keyword}"`);
            }
        } catch {
            console.warn(`[Sniper-${id}] ⚠️ Could not click payment card — proceeding with pre-selected`);
        }

        // Click "Next" button (confirmed id: "form-register") to confirm payment selection
        try {
            const nextBtn = activePage.locator('#form-register, button:has-text("Next"), button:has-text("Selanjutnya")').first();
            if (await nextBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
                await nextBtn.click();
                console.log(`[Sniper-${id}] ✓ Clicked Next (form-register)`);
                // Wait for next step to render
                await activePage.waitForTimeout(2000);
            }
        } catch {
            console.warn(`[Sniper-${id}] ⚠️ Next button not found on payment page`);
        }

        // Click "Pay Now" button (confirmed id: "submit-button")
        try {
            const payNow = activePage.locator('#submit-button, button:has-text("Pay Now"), button:has-text("Bayar Sekarang")').first();
            if (await payNow.isVisible({ timeout: 5000 }).catch(() => false)) {
                console.log(`[Sniper-${id}] 💥 TRIGGERING FINAL CHECKOUT — Pay Now!`);
                await payNow.click();
            }
        } catch {
            console.warn(`[Sniper-${id}] ⚠️ Pay Now button not found`);
        }

        // Wait for VA page to fully render
        await activePage.waitForFunction(
            () => document.querySelector('p#vanumber') !== null ||
                  document.body.innerText.includes('Virtual Account'),
            { timeout: 30000 }
        ).catch(() => console.warn(`[Sniper-${id}] ⚠️ VA page timeout — proceeding with screenshot`));

        // --- EXTRACT VA NUMBER, INVOICE CODE & TOTAL ---
        // Live-confirmed selectors:
        //   VA number  → <p id="vanumber">
        //   Invoice    → <input name="gtm_invoice_code"> (hidden) OR visible text
        //   Total      → element containing "Rp."
        let billingInfo = "BCA VA: Silakan cek Screenshot";
        try {
            await activePage.waitForTimeout(1500);

            // VA Number — direct confirmed selector
            const vaText = await activePage
                .$eval('p#vanumber', (el: any) => el.innerText.trim())
                .catch(() => '');

            // Invoice Code from hidden input (confirmed from live scan)
            const invoiceCode = await activePage
                .$eval('input[name="gtm_invoice_code"]', (el: any) => (el as HTMLInputElement).value.trim())
                .catch(async () => {
                    // Fallback: scrape visible "Invoice Code" text
                    return await activePage.evaluate(() => {
                        const els = Array.from(document.querySelectorAll('*'));
                        const label = els.find(el => el.children.length === 0 && el.textContent?.match(/XHTJ|Invoice Code/i));
                        return label?.nextElementSibling?.textContent?.trim() || '';
                    }).catch(() => '');
                });

            // Total price — find element with "Rp." text
            const priceText = await activePage.evaluate(() => {
                const els = Array.from(document.querySelectorAll('*'));
                // Find the "Total Payment" value specifically, not just any Rp. text
                const totalLabel = els.find(el =>
                    el.children.length === 0 &&
                    el.textContent?.toLowerCase().includes('total payment')
                );
                if (totalLabel) {
                    // Look for sibling or parent containing Rp
                    const parent = totalLabel.parentElement;
                    const rpEl = parent?.querySelector('*');
                    if (rpEl?.textContent?.includes('Rp')) return rpEl.textContent.trim();
                }
                // Nuclear fallback: find first "Rp 2.x" pattern (total is usually the largest)
                const rpEls = els.filter(el => el.children.length === 0 && /Rp\.?\s*[\d.,]+/.test(el.textContent || ''));
                return rpEls.map(el => el.textContent?.trim()).filter(Boolean).join(' | ') || '';
            }).catch(() => '');

            const vaNumber = vaText || 'Cek Screenshot';
            const invoice  = invoiceCode || 'Cek Screenshot';
            const total    = priceText || 'Cek Screenshot';
            const invoiceUrl = activePage.url();

            billingInfo = [
                `\n🏦 **VA Number** (copy ini!): \`${vaNumber}\``,
                `🧾 **Invoice Code**: \`${invoice}\``,
                `💰 **Total Tagihan**: \`${total}\``,
                `🔗 **Link Invoice**: ${invoiceUrl}`
            ].join('\n');

            console.log(`[Sniper-${id}] ✅ BERHASIL! VA: ${vaNumber} | Invoice: ${invoice} | Total: ${total}`);
            return billingInfo;

        } catch (err) {
            console.warn(`[Sniper-${id}] ⚠️ Could not extract VA info cleanly. Screenshot will be sent.`);
            return billingInfo;
        }
    }
}

