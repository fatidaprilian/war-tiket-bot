import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const Config = {
    // Target Setup
    LANDING_PAGE_URL: process.env.LANDING_PAGE_URL || 'https://woodzinjakarta.com/',
    TARGET_KEYWORD: process.env.TARGET_KEYWORD || 'loket.com', // Change depending on ticketing platform

    // Concurrency & Stealth
    BROWSER_CONCURRENCY: parseInt(process.env.BROWSER_CONCURRENCY || '1', 10),
    USE_PROXY: process.env.USE_PROXY === 'true',
    PROXIES: process.env.PROXIES ? process.env.PROXIES.split(',') : [],

    // User Data for Checkout
    USER_DATA: {
        nik: process.env.USER_NIK || '',
        fullName: process.env.USER_FULLNAME || '',
        email: process.env.USER_EMAIL || '',
        phoneNumber: process.env.USER_PHONE || '',
        dob: process.env.USER_DOB || '', // typically DD-MM-YYYY or depending on platform
        gender: process.env.USER_GENDER || '', // optional
    },

    // Telegram Notification
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '',

    // Timeout configurations
    POLLING_INTERVAL: parseInt(process.env.POLLING_INTERVAL || '3000', 10),
    QUEUE_TIMEOUT: parseInt(process.env.QUEUE_TIMEOUT || '600000', 10), // 10 minutes max wait in queue

    // Ticket Selection Settings
    TICKET_CATEGORY: process.env.TICKET_CATEGORY || 'CAT 1',
    TICKET_QUANTITY: parseInt(process.env.TICKET_QUANTITY || '1', 10),

    // Payment Configuration
    PAYMENT_METHOD: process.env.PAYMENT_METHOD || 'BCA Virtual Account',
};

// Validate critical config
export function validateConfig() {
    if (!Config.LANDING_PAGE_URL) throw new Error('LANDING_PAGE_URL is missing');
    if (!Config.USER_DATA.nik) throw new Error('USER_NIK is missing from .env — Loket requires a valid NIK');
    if (!Config.USER_DATA.email || Config.USER_DATA.email === 'johndoe@example.com') throw new Error('USER_EMAIL is missing or still set to placeholder — please update .env');
    if (!Config.USER_DATA.fullName) throw new Error('USER_FULLNAME is missing from .env');
    if (!Config.USER_DATA.phoneNumber) throw new Error('USER_PHONE is missing from .env');
    if (Config.USE_PROXY && Config.PROXIES.length === 0) {
        console.warn('⚠️ Warning: USE_PROXY is true but PROXIES list is empty!');
    }
}
