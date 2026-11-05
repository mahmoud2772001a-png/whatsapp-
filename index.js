const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const express = require('express');

// إعداد خادم بسيط لضمان بقاء البوت شغّالاً 24/7 على Render
const app = express();
const PORT = process.env.PORT || 10000;
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));

async function connectToWhatsApp() {
    // استخدمنا هنا اسم الجلسة الذي اتفقنا عليه لتبدأ بشكل نظيف
    const { state, saveCreds } = await useMultiFileAuthState('session_wa_2');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // تم الإلغاء لاستخدام كود رقم الهاتف
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed due to ', lastDisconnect?.error, ', reconnecting ', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('Bot connected successfully!');
        }
    });

    // ----------------------------------------------------
    // قسم مراقبة وحذف الرسائل (الروابط والملصقات)
    // ----------------------------------------------------
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message) return;
        
        // تجاهل رسائل البوت نفسه لكي لا يحذف رسائله بالخطأ
        if (m.key.fromMe) return;

        const remoteJid = m.key.remoteJid;
        
        // التأكد أن الرسالة قادمة من مجموعة (تتتهي بـ @g.us)
        if (remoteJid.endsWith('@g.us')) {
            const messageType = Object.keys(m.message)[0];
            
            // استخراج نص الرسالة إن وجد
            const messageText = m.message.conversation || 
                                m.message.extendedTextMessage?.text || '';

            // 1. فحص هل الرسالة تحتوي على رابط (HTTP أو HTTPS أو www)
            const hasLink = /https?:\/\/[^\s]+|www\.[^\s]+/.test(messageText);

            // 2. فحص هل الرسالة عبارة عن ملصق (Sticker)
            const isSticker = messageType === 'stickerMessage';

            // إذا كانت رابطاً أو ملصقاً، قم بحذفها فوراً!
            if (hasLink || isSticker) {
                try {
                    await sock.sendMessage(remoteJid, { 
                        delete: { 
                            remoteJid: remoteJid, 
                            fromMe: false, 
                            id: m.key.id, 
                            participant: m.key.participant || m.participant 
                        } 
                    });
                    console.log('تم حذف رابط أو ملصق بنجاح من المجموعة');
                } catch (error) {
                    console.log('فشل في حذف الرسالة (تأكد أن البوت مشرف في المجموعة):', error);
                }
            }
        }
    });
}

connectToWhatsApp();
