import { chromium } from 'playwright-extra';
// @ts-ignore
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Page } from 'playwright';

chromium.use(stealthPlugin());

async function scrapeLoket() {
    console.log('🚀 Starting Loket Form Inspector (PLACEHOLDER-AWARE)...');

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();

    context.on('page', async (newPage) => {
        console.log('\n[Scraper] New tab opened! URL:', newPage.url());
        monitorAllFrames(newPage);
    });

    const page = await context.newPage();

    try {
        console.log('Navigating to monstaxjakarta2026.com...');
        await page.goto('https://monstaxjakarta2026.com/', { waitUntil: 'domcontentloaded' });

        console.log('\n================================================');
        console.log('[Scraper] INSTRUKSI:');
        console.log('  1. Klik "Buy Tickets"');
        console.log('  2. Pilih kategori + klik "+" + klik "Order Now"');
        console.log('  3. Di halaman form data diri — BERHENTI, tunggu output');
        console.log('  4. Bot print semua field termasuk yang tanpa name attr');
        console.log('================================================\n');

        monitorAllFrames(page);
        await page.waitForTimeout(600000);

    } catch (e: any) {
        if (!e.message?.includes('closed')) console.error('Error:', e);
    } finally {
        await browser.close();
    }
}

async function monitorAllFrames(page: Page) {
    let lastReport = '';

    const interval = setInterval(async () => {
        try {
            if (page.isClosed()) { clearInterval(interval); return; }

            const frames = page.frames();
            let allInputs: any[] = [];
            let allButtons: any[] = [];
            let frameInfo: string[] = [];

            for (const frame of frames) {
                try {
                    const frameUrl = frame.url();

                    // CRITICAL: Capture ALL visible inputs — including those without 'name'
                    // Loket uses Vue.js v-model which does not set name attributes!
                    const inputs = await frame.$$eval('input:not([type="hidden"])', (els: any) =>
                        els.map((el: HTMLInputElement) => ({
                            name: el.name || null,
                            id: el.id || null,
                            type: el.type,
                            placeholder: el.placeholder || null,
                            ariaLabel: el.getAttribute('aria-label'),
                            required: el.required,
                            maxlength: el.maxLength > 0 ? el.maxLength : null,
                            value: el.value ? '[HAS_VALUE]' : null,
                        })).filter((i: any) => {
                            // Include if we have ANY identifying info
                            return i.name || i.id || i.placeholder || i.ariaLabel;
                        })
                    ).catch(() => []);

                    // Also capture selects (dropdown menus for gender, payment, etc.)
                    const selects = await frame.$$eval('select', (els: any) =>
                        els.map((el: HTMLSelectElement) => ({
                            tag: 'SELECT',
                            name: el.name || null,
                            id: el.id || null,
                            ariaLabel: el.getAttribute('aria-label'),
                            options: Array.from(el.options).map(o => o.text).slice(0, 5),
                        }))
                    ).catch(() => []);

                    const buttons = await frame.$$eval('button:not([disabled])', (els: any) =>
                        els.map((el: HTMLButtonElement) => ({
                            text: el.innerText.trim().substring(0, 80),
                            class: el.className.substring(0, 80),
                        })).filter((b: any) => b.text && b.text.length > 0)
                    ).catch(() => []);

                    if (inputs.length > 0 || selects.length > 0) {
                        frameInfo.push(frameUrl);
                        allInputs.push(...inputs.map((i: any) => ({ ...i, _frame: frameUrl.substring(0, 70) })));
                        allInputs.push(...selects.map((s: any) => ({ ...s, _frame: frameUrl.substring(0, 70) })));
                        allButtons.push(...buttons.map((b: any) => ({ ...b, _frame: frameUrl.substring(0, 70) })));
                    }
                } catch { /* ignore */ }
            }

            const report = JSON.stringify({ inputs: allInputs, buttons: allButtons });
            if (report !== lastReport && allInputs.length > 0) {
                lastReport = report;
                console.log('\n============================================');
                console.log(`🎯 FORM DETECTED! (${allInputs.length} inputs/selects)`);
                console.log(`   Frame: ${frameInfo.join(' | ')}`);
                console.log('--- ALL VISIBLE INPUTS (including Vue v-model) ---');
                console.log(JSON.stringify(allInputs, null, 2));
                console.log('--- BUTTONS ---');
                console.log(JSON.stringify(allButtons.slice(0, 15), null, 2));
                console.log('============================================\n');
            }

        } catch { /* ignore */ }
    }, 1500); // scan every 1.5s for faster detection
}

scrapeLoket();
