const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const express = require('express');

// خادم ويب وهمي لمنع انقطاع الاتصال على سحابة Render
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running 24/7!'));
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false, // إلغاء الـ QR المشوه
        auth: state
    });

    // إذا لم يكن الحساب مرتبطاً، سيطلب رقم هاتفك
    if (!sock.authState.creds.registered) {
        const phoneNumber = "970569530453"; // رقم هاتفك المسجل في ملفك الشخصي
        setTimeout(async () => {
            let code = await sock.requestPairingCode(phoneNumber);
            console.log(`========================================`);
            console.log(`🔑 YOUR PAIRING CODE IS: ${code}`);
            console.log(`========================================`);
        }, 3000);
    }

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('✅ Bot connected successfully!');
        }
    }); 

    sock.ev.on('creds.update', saveCreds);
}

connectToWhatsApp();
